import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

/**
 * 打开数据库连接。
 * 数据库放在 Electron userData 目录，不放在项目目录。
 */
export function openDatabase(filePath: string): SqliteDatabase {
  if (filePath !== ':memory:') {
    mkdirSync(path.dirname(filePath), { recursive: true })
  }

  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
