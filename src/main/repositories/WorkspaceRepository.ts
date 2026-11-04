import type { SqliteDatabase } from '../database/connection'
import type { Workspace, WorkspaceInput, WorkspacePatch } from '../../shared/types'

interface WorkspaceRow {
  id: number
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 只负责数据库读写，不涉及 UI 与文件系统 */
export class WorkspaceRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findAll(): Workspace[] {
    const rows = this.db
      .prepare('SELECT * FROM workspace ORDER BY sort_order ASC, name COLLATE NOCASE ASC')
      .all() as WorkspaceRow[]
    return rows.map(toWorkspace)
  }

  findById(id: number): Workspace | null {
    const row = this.db.prepare('SELECT * FROM workspace WHERE id = ?').get(id) as WorkspaceRow | undefined
    return row ? toWorkspace(row) : null
  }

  findByName(name: string): Workspace | null {
    const row = this.db.prepare('SELECT * FROM workspace WHERE name = ? COLLATE NOCASE').get(name) as
      | WorkspaceRow
      | undefined
    return row ? toWorkspace(row) : null
  }

  nextSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM workspace').get() as {
      value: number
    }
    return row.value + 10
  }

  insert(input: WorkspaceInput & { sortOrder: number }): Workspace {
    const now = new Date().toISOString()
    const result = this.db
      .prepare('INSERT INTO workspace (name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(input.name, input.sortOrder, now, now)
    return this.findById(Number(result.lastInsertRowid))!
  }

  update(id: number, patch: WorkspacePatch): Workspace | null {
    const current = this.findById(id)
    if (!current) return null

    const name = patch.name ?? current.name
    const sortOrder = patch.sortOrder ?? current.sortOrder
    this.db
      .prepare('UPDATE workspace SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?')
      .run(name, sortOrder, new Date().toISOString(), id)
    return this.findById(id)
  }

  /** 按给定顺序重排 sort_order（拖拽排序用），间隔 10 便于以后插入 */
  reorder(ids: number[]): void {
    const now = new Date().toISOString()
    const statement = this.db.prepare('UPDATE workspace SET sort_order = ?, updated_at = ? WHERE id = ?')

    this.db.transaction(() => {
      ids.forEach((id, index) => statement.run((index + 1) * 10, now, id))
    })()
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM workspace WHERE id = ?').run(id)
    return result.changes > 0
  }
}
