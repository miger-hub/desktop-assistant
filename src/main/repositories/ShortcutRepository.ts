import type { Shortcut, ShortcutKind } from '../../shared/types'
import type { SqliteDatabase } from '../database/connection'

interface ShortcutRow {
  id: number
  kind: ShortcutKind
  label: string
  path: string | null
  workspace_id: number | null
  sort_order: number
  created_at: string
}

function toShortcut(row: ShortcutRow): Shortcut {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    path: row.path,
    workspaceId: row.workspace_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    // 是否存在由服务层实时判断
    exists: true
  }
}

/** 快捷入口的数据库读写 */
export class ShortcutRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findAll(): Shortcut[] {
    const rows = this.db
      .prepare('SELECT * FROM shortcut ORDER BY sort_order ASC, id ASC')
      .all() as ShortcutRow[]
    return rows.map(toShortcut)
  }

  findByPath(path: string): Shortcut | null {
    const row = this.db.prepare('SELECT * FROM shortcut WHERE path = ?').get(path) as ShortcutRow | undefined
    return row ? toShortcut(row) : null
  }

  findByWorkspace(workspaceId: number): Shortcut | null {
    const row = this.db.prepare('SELECT * FROM shortcut WHERE workspace_id = ?').get(workspaceId) as
      | ShortcutRow
      | undefined
    return row ? toShortcut(row) : null
  }

  nextSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM shortcut').get() as {
      value: number
    }
    return row.value + 10
  }

  insert(input: {
    kind: ShortcutKind
    label: string
    path: string | null
    workspaceId: number | null
    sortOrder: number
  }): Shortcut {
    const result = this.db
      .prepare(
        'INSERT INTO shortcut (kind, label, path, workspace_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(input.kind, input.label, input.path, input.workspaceId, input.sortOrder, new Date().toISOString())

    const row = this.db.prepare('SELECT * FROM shortcut WHERE id = ?').get(Number(result.lastInsertRowid)) as ShortcutRow
    return toShortcut(row)
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM shortcut WHERE id = ?').run(id).changes > 0
  }
}
