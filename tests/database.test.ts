import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/database/connection'
import { migration001 } from '../src/main/database/migrations/001-init'
import { DatabaseService } from '../src/main/services/DatabaseService'
import {
  latestSchemaVersion,
  migrate,
  migrations,
  readSchemaVersion
} from '../src/main/database/migration'

async function createTempDatabasePath(): Promise<{ dir: string; filePath: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'desktop-assistant-db-'))
  return { dir, filePath: path.join(dir, 'data.db') }
}

/** 造一个只跑到 v1 的"旧版本"数据库，用来验证升级流程 */
function createLegacyDatabase(filePath: string): void {
  const db = openDatabase(filePath)
  db.exec(`
    CREATE TABLE schema_migration (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)
  db.transaction(() => {
    migration001.up(db)
    db.prepare('INSERT INTO schema_migration (version, name, applied_at) VALUES (?, ?, ?)').run(
      1,
      'init',
      new Date().toISOString()
    )
  })()
  db.close()
}

/** 造一个跑到指定 migration 的数据库，用来验证后续升级 */
function createDatabaseAtVersion(filePath: string, version: number): void {
  const db = openDatabase(filePath)
  db.exec(`
    CREATE TABLE schema_migration (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)
  for (const migration of migrations.filter((item) => item.version <= version)) {
    db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT INTO schema_migration (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString()
      )
    })()
  }
  db.close()
}

function tableNames(database: DatabaseService): string[] {
  const rows = database.connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

describe('数据库与 migration', () => {
  it('初始化后创建全部表', () => {
    const database = new DatabaseService(':memory:')
    const names = tableNames(database)
    expect(names).toEqual(
      expect.arrayContaining([
        'file_operation',
        'home_shortcut',
        'mapped_directory',
        'note',
        'recent_file',
        'rule',
        'schema_migration',
        'setting',
        'shortcut',
        'todo',
        'work_log',
        'workspace'
      ])
    )
    expect(database.schemaVersion).toBe(latestSchemaVersion())
    database.close()
  })

  it('重复执行 migration 不会重复应用', () => {
    const database = new DatabaseService(':memory:')
    expect(migrate(database.connection)).toBe(0)
    database.close()
  })

  it('v11 给日报增加四栏，并保留旧默认栏内容', async () => {
    const { dir, filePath } = await createTempDatabasePath()
    createDatabaseAtVersion(filePath, 10)

    const before = openDatabase(filePath)
    before
      .prepare('INSERT INTO work_log (date, content, updated_at) VALUES (?, ?, ?)')
      .run('2026-11-20', '旧日报内容', new Date().toISOString())
    before.close()

    const database = new DatabaseService(filePath)
    const columns = (
      database.connection.prepare('PRAGMA table_info(work_log)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    const row = database.connection
      .prepare('SELECT content, completed, incomplete, issues FROM work_log WHERE date = ?')
      .get('2026-11-20') as {
      content: string
      completed: string
      incomplete: string
      issues: string
    }

    expect(columns).toEqual(expect.arrayContaining(['completed', 'incomplete', 'issues']))
    expect(row).toEqual({
      content: '旧日报内容',
      completed: '',
      incomplete: '',
      issues: ''
    })
    database.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('外键级联：删除工作区会清掉映射与待办', () => {
    const database = new DatabaseService(':memory:')
    const connection = database.connection
    const now = new Date().toISOString()

    const workspaceId = Number(
      connection.prepare('INSERT INTO workspace (name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('Dev', 0, now, now).lastInsertRowid
    )
    connection
      .prepare(
        'INSERT INTO mapped_directory (workspace_id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(workspaceId, 'code', '/tmp/code', now, now)
    connection
      .prepare(
        'INSERT INTO todo (workspace_id, title, description, status, priority, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(workspaceId, '写测试', '', 'todo', 'normal', null, now, now)

    connection.prepare('DELETE FROM workspace WHERE id = ?').run(workspaceId)

    const mappings = connection.prepare('SELECT COUNT(*) AS count FROM mapped_directory').get() as { count: number }
    const todos = connection.prepare('SELECT COUNT(*) AS count FROM todo').get() as { count: number }
    expect(mappings.count).toBe(0)
    expect(todos.count).toBe(0)

    database.close()
  })

  it('升级前自动备份，备份里保留升级前的结构与数据', async () => {
    const { dir, filePath } = await createTempDatabasePath()
    createLegacyDatabase(filePath)

    const database = new DatabaseService(filePath)
    expect(database.schemaVersion).toBe(latestSchemaVersion())
    expect(database.upgradeBackup).toBeTruthy()
    expect(readSchemaVersion(database.connection)).toBe(latestSchemaVersion())
    database.close()

    // 备份是升级前的快照：还没有 rule / file_operation 表
    const backup = new Database(database.upgradeBackup!, { readonly: true })
    const tables = (backup.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string
    }>).map((row) => row.name)
    expect(tables).not.toContain('rule')
    expect(tables).not.toContain('file_operation')
    const version = backup.prepare('SELECT MAX(version) AS version FROM schema_migration').get() as {
      version: number
    }
    expect(version.version).toBe(1)
    backup.close()

    const backups = await readdir(path.join(dir, 'backups'))
    expect(backups.filter((name) => name.endsWith('.db'))).toHaveLength(1)

    await rm(dir, { recursive: true, force: true })
  })

  it('数据库版本比程序支持的新时拒绝打开，避免旧版本写坏新结构', async () => {
    const { dir, filePath } = await createTempDatabasePath()
    const db = openDatabase(filePath)
    db.exec(`
      CREATE TABLE schema_migration (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `)
    db.prepare('INSERT INTO schema_migration (version, name, applied_at) VALUES (?, ?, ?)').run(
      latestSchemaVersion() + 1,
      'from-the-future',
      new Date().toISOString()
    )
    db.close()

    expect(() => new DatabaseService(filePath)).toThrow(/比当前程序支持的/)

    await rm(dir, { recursive: true, force: true })
  })

  it('手动备份是包含已写入数据的一致快照，并只保留最近若干份', async () => {
    const { dir, filePath } = await createTempDatabasePath()
    const database = new DatabaseService(filePath)
    database.connection
      .prepare('INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)')
      .run('theme', 'dracula', new Date().toISOString())

    const first = database.backup()
    const snapshot = new Database(first, { readonly: true })
    const theme = snapshot.prepare("SELECT value FROM setting WHERE key = 'theme'").get() as { value: string }
    snapshot.close()
    expect(theme.value).toBe('dracula')

    for (let index = 0; index < 6; index += 1) database.backup()
    database.close()

    const backups = (await readdir(path.join(dir, 'backups'))).filter((name) => name.endsWith('.db'))
    expect(backups.length).toBeLessThanOrEqual(5)

    await rm(dir, { recursive: true, force: true })
  })
})
