import { backupDirOf, createBackup } from '../database/backup'
import { openDatabase, type SqliteDatabase } from '../database/connection'
import { latestSchemaVersion, migrate, readSchemaVersion } from '../database/migration'
import { ServiceError } from '../errors'
import { t } from '../i18n'

/**
 * 数据库生命周期管理：打开连接、检查版本、升级前备份、执行 migration、关闭连接。
 *
 * 版本升级约定（详见 DATABASE.md §3）：
 * - 结构版本只看 `schema_migration` 表里的最大 version，不依赖应用版本号；
 * - 数据库版本比程序支持的更新时直接报错，避免旧版本程序写坏新结构；
 * - 真正要跑 migration 时先自动备份一份，升级出问题可以回滚。
 */
export class DatabaseService {
  private readonly db: SqliteDatabase
  private closed = false

  /** 当前数据库结构版本（等于本次启动应用完 migration 后的版本） */
  readonly schemaVersion: number
  /** 本次启动因为结构升级自动生成的备份；没有升级时为 null */
  readonly upgradeBackup: string | null

  constructor(readonly filePath: string) {
    let db: SqliteDatabase
    try {
      db = openDatabase(filePath)
    } catch (error) {
      throw new ServiceError('DB_ERROR', t('svc.dbOpenFailed', { value: (error as Error).message }), { cause: error })
    }
    this.db = db

    try {
      const current = readSchemaVersion(db)
      const latest = latestSchemaVersion()

      if (current > latest) {
        throw new ServiceError('DB_ERROR', t('svc.dbTooNew', { current, latest }))
      }

      // 全新数据库没有数据，不需要备份
      this.upgradeBackup = current > 0 && current < latest ? this.backupBeforeUpgrade(current, latest) : null
      migrate(db)
      this.schemaVersion = readSchemaVersion(db)
    } catch (error) {
      db.close()
      throw error instanceof ServiceError
        ? error
        : new ServiceError('DB_ERROR', t('svc.dbInitFailed', { value: (error as Error).message }), { cause: error })
    }
  }

  get connection(): SqliteDatabase {
    if (this.closed) {
      throw new ServiceError('DB_ERROR', t('svc.dbClosed'))
    }
    return this.db
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }

  /** 备份文件所在目录 */
  get backupDirectory(): string {
    return backupDirOf(this.filePath)
  }

  /** 手动备份，返回备份文件路径 */
  backup(label = 'manual'): string {
    if (this.filePath === ':memory:') {
      throw new ServiceError('DB_ERROR', t('svc.dbNoBackupMemory'))
    }
    try {
      return createBackup(this.connection, this.filePath, label)
    } catch (error) {
      throw new ServiceError('DB_ERROR', t('svc.dbBackupFailed', { value: (error as Error).message }), { cause: error })
    }
  }

  /** 升级前备份；失败不阻塞升级，只在控制台留warning（迁移本身在事务里） */
  private backupBeforeUpgrade(from: number, to: number): string | null {
    if (this.filePath === ':memory:') return null
    try {
      return createBackup(this.db, this.filePath, `v${from}-to-v${to}`)
    } catch (error) {
      console.warn(`[db] 升级前备份失败，继续执行 migration：${(error as Error).message}`)
      return null
    }
  }
}
