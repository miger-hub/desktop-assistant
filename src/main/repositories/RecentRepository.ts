import type { RecentEntry } from '../../shared/types'
import type { SqliteDatabase } from '../database/connection'

interface RecentRow {
  path: string
  name: string
  kind: 'file' | 'directory'
  opened_at: string
  count: number
}

function toRecent(row: RecentRow): RecentEntry {
  return {
    path: row.path,
    name: row.name,
    kind: row.kind,
    openedAt: row.opened_at,
    count: row.count
  }
}

/** 最近打开的文件 / 目录，按 path 去重 */
export class RecentRepository {
  constructor(private readonly db: SqliteDatabase) {}

  /** 记录一次打开；同一路径只更新时间与次数。openedAt 由服务层保证单调递增 */
  touch(path: string, name: string, kind: 'file' | 'directory', openedAt: string): void {
    this.db
      .prepare(
        `INSERT INTO recent_file (path, name, kind, opened_at, count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (path) DO UPDATE SET
           name = excluded.name,
           kind = excluded.kind,
           opened_at = excluded.opened_at,
           count = recent_file.count + 1`
      )
      .run(path, name, kind, openedAt)
  }

  find(limit: number): RecentEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM recent_file ORDER BY opened_at DESC LIMIT ?')
      .all(limit) as RecentRow[]
    return rows.map(toRecent)
  }

  /** 只保留最近 keep 条，避免历史无限增长 */
  prune(keep: number): void {
    this.db
      .prepare(
        `DELETE FROM recent_file
          WHERE path NOT IN (SELECT path FROM recent_file ORDER BY opened_at DESC LIMIT ?)`
      )
      .run(keep)
  }

  clear(): void {
    this.db.prepare('DELETE FROM recent_file').run()
  }
}
