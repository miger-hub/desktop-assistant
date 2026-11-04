import type { SqliteDatabase } from '../database/connection'

interface SettingRow {
  key: string
  value: string
}

/** 简单的 key-value 设置表 */
export class SettingRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findAll(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM setting').all() as SettingRow[]
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  }

  setMany(values: Record<string, string>): void {
    const now = new Date().toISOString()
    const statement = this.db.prepare(
      `INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(values)) {
        statement.run(key, value, now)
      }
    })()
  }
}
