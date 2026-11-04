import type { SqliteDatabase } from '../database/connection'

interface PluginRow {
  id: string
  version: string
  enabled: number
  install_path: string
  installed_at: string
}

export interface PluginRecord {
  id: string
  version: string
  enabled: boolean
  installPath: string
  installedAt: string
}

function toRecord(row: PluginRow): PluginRecord {
  return {
    id: row.id,
    version: row.version,
    enabled: row.enabled === 1,
    installPath: row.install_path,
    installedAt: row.installed_at
  }
}

/** 已安装插件状态（只存安装信息，不存插件内容） */
export class PluginRepository {
  constructor(private readonly db: SqliteDatabase) {}

  list(): PluginRecord[] {
    const rows = this.db.prepare('SELECT * FROM plugin ORDER BY installed_at DESC, id ASC').all() as PluginRow[]
    return rows.map(toRecord)
  }

  find(id: string): PluginRecord | null {
    const row = this.db.prepare('SELECT * FROM plugin WHERE id = ?').get(id) as PluginRow | undefined
    return row ? toRecord(row) : null
  }

  upsert(record: Omit<PluginRecord, 'installedAt'> & { installedAt?: string }): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO plugin (id, version, enabled, install_path, installed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           version = excluded.version,
           enabled = excluded.enabled,
           install_path = excluded.install_path,
           installed_at = excluded.installed_at`
      )
      .run(record.id, record.version, record.enabled ? 1 : 0, record.installPath, record.installedAt ?? now)
  }

  setEnabled(id: string, enabled: boolean): boolean {
    return this.db.prepare('UPDATE plugin SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id).changes > 0
  }

  remove(id: string): boolean {
    return this.db.prepare('DELETE FROM plugin WHERE id = ?').run(id).changes > 0
  }
}
