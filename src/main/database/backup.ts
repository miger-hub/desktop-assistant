import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import type { SqliteDatabase } from './connection'

/** 备份保留份数：够回滚几次即可，避免把磁盘塞满 */
export const BACKUP_KEEP = 5

/** 备份统一放在数据库旁边的 backups/ 目录，卸载应用不会删除 userData */
export function backupDirOf(databasePath: string): string {
  return path.join(path.dirname(databasePath), 'backups')
}

function timestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/**
 * 生成一份数据库快照。
 *
 * 用 SQLite 的 `VACUUM INTO` 而不是复制文件：应用运行期间 WAL 里可能还有没 checkpoint 的写入，
 * 直接复制 `data.db` 会丢数据；`VACUUM INTO` 得到的是包含全部已提交数据的一致快照。
 */
export function createBackup(db: SqliteDatabase, databasePath: string, label: string): string {
  const directory = backupDirOf(databasePath)
  mkdirSync(directory, { recursive: true })

  const base = path.basename(databasePath, path.extname(databasePath)) || 'data'
  // 同一秒内连续备份时文件名会撞车，加序号兜底
  let target = path.join(directory, `${base}-${label}-${timestamp()}.db`)
  for (let suffix = 2; existsSync(target); suffix += 1) {
    target = path.join(directory, `${base}-${label}-${timestamp()}-${suffix}.db`)
  }

  // SQLite 的字符串字面量用 '' 转义单引号
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)

  pruneBackups(directory)
  return target
}

/** 只保留最近 keep 份备份（按修改时间倒序），返回被删掉的路径 */
export function pruneBackups(directory: string, keep = BACKUP_KEEP): string[] {
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }

  const files = names
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const full = path.join(directory, name)
      try {
        return { full, modifiedAt: statSync(full).mtimeMs }
      } catch {
        return null
      }
    })
    .filter((entry): entry is { full: string; modifiedAt: number } => entry !== null)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)

  const removed: string[] = []
  for (const entry of files.slice(keep)) {
    try {
      rmSync(entry.full, { force: true })
      removed.push(entry.full)
    } catch {
      // 删不掉就留着，不影响主流程
    }
  }
  return removed
}
