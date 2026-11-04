import type { SqliteDatabase } from '../database/connection'
import type { MappedDirectory } from '../../shared/types'

interface MappingRow {
  id: number
  workspace_id: number
  name: string
  path: string
  created_at: string
  updated_at: string
}

function toMapping(row: MappingRow, exists: boolean): MappedDirectory {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    path: row.path,
    exists,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class MappingRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findAll(): MappedDirectory[] {
    const rows = this.db
      .prepare('SELECT * FROM mapped_directory ORDER BY name COLLATE NOCASE ASC')
      .all() as MappingRow[]
    return rows.map((row) => toMapping(row, true))
  }

  findByWorkspace(workspaceId: number): MappedDirectory[] {
    const rows = this.db
      .prepare('SELECT * FROM mapped_directory WHERE workspace_id = ? ORDER BY name COLLATE NOCASE ASC')
      .all(workspaceId) as MappingRow[]
    return rows.map((row) => toMapping(row, true))
  }

  findById(id: number): MappedDirectory | null {
    const row = this.db.prepare('SELECT * FROM mapped_directory WHERE id = ?').get(id) as MappingRow | undefined
    return row ? toMapping(row, true) : null
  }

  findByPath(workspaceId: number, dirPath: string): MappedDirectory | null {
    const row = this.db
      .prepare('SELECT * FROM mapped_directory WHERE workspace_id = ? AND path = ?')
      .get(workspaceId, dirPath) as MappingRow | undefined
    return row ? toMapping(row, true) : null
  }

  insert(input: { workspaceId: number; name: string; path: string }): MappedDirectory {
    const now = new Date().toISOString()
    const result = this.db
      .prepare('INSERT INTO mapped_directory (workspace_id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(input.workspaceId, input.name, input.path, now, now)
    return this.findById(Number(result.lastInsertRowid))!
  }

  update(id: number, patch: { name?: string }): MappedDirectory | null {
    const current = this.findById(id)
    if (!current) return null
    this.db
      .prepare('UPDATE mapped_directory SET name = ?, updated_at = ? WHERE id = ?')
      .run(patch.name ?? current.name, new Date().toISOString(), id)
    return this.findById(id)
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM mapped_directory WHERE id = ?').run(id).changes > 0
  }
}
