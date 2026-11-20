import type { SqliteDatabase } from './connection'
import { migration001 } from './migrations/001-init'
import { migration002 } from './migrations/002-rule'
import { migration003 } from './migrations/003-file-operation'
import { migration004 } from './migrations/004-shortcut'
import { migration005 } from './migrations/005-note'
import { migration006 } from './migrations/006-recent-file'
import { migration007 } from './migrations/007-note-opened'
import { migration008 } from './migrations/008-plugin'
import { migration009 } from './migrations/009-home'
import { migration010 } from './migrations/010-note-link-usage'

export interface Migration {
  version: number
  name: string
  up: (db: SqliteDatabase) => void
}

/** 结构变化必须新增 migration，不允许直接改历史版本 */
export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010
]

interface AppliedRow {
  version: number
}

/** 当前程序支持的最新结构版本 */
export function latestSchemaVersion(): number {
  return migrations.reduce((max, migration) => Math.max(max, migration.version), 0)
}

/** 数据库里已经应用的版本；0 表示还没有任何 migration（全新数据库） */
export function readSchemaVersion(db: SqliteDatabase): number {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'")
    .get()
  if (!table) return 0

  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migration').get() as {
    version: number | null
  }
  return row?.version ?? 0
}

export function migrate(db: SqliteDatabase): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migration').all() as AppliedRow[]).map((row) => row.version)
  )
  const pending = migrations
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version)

  const record = db.prepare('INSERT INTO schema_migration (version, name, applied_at) VALUES (?, ?, ?)')

  for (const migration of pending) {
    db.transaction(() => {
      migration.up(db)
      record.run(migration.version, migration.name, new Date().toISOString())
    })()
  }

  return pending.length
}
