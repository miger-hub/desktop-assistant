import type { HomeShortcut } from '../../shared/types'
import type { SqliteDatabase } from '../database/connection'

interface HomeShortcutRow {
  id: number
  label: string
  path: string
  sort_order: number
  created_at: string
}

function toHomeShortcut(row: HomeShortcutRow): HomeShortcut {
  return {
    id: row.id,
    label: row.label,
    path: row.path,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    exists: true
  }
}

export class HomeShortcutRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findAll(): HomeShortcut[] {
    const rows = this.db
      .prepare('SELECT * FROM home_shortcut ORDER BY sort_order ASC, id ASC')
      .all() as HomeShortcutRow[]
    return rows.map(toHomeShortcut)
  }

  findByPath(target: string): HomeShortcut | null {
    const row = this.db.prepare('SELECT * FROM home_shortcut WHERE path = ?').get(target) as
      | HomeShortcutRow
      | undefined
    return row ? toHomeShortcut(row) : null
  }

  nextSortOrder(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM home_shortcut')
      .get() as { value: number }
    return row.value + 10
  }

  insert(input: { label: string; path: string; sortOrder: number }): HomeShortcut {
    const result = this.db
      .prepare('INSERT INTO home_shortcut (label, path, sort_order, created_at) VALUES (?, ?, ?, ?)')
      .run(input.label, input.path, input.sortOrder, new Date().toISOString())
    const row = this.db.prepare('SELECT * FROM home_shortcut WHERE id = ?').get(Number(result.lastInsertRowid)) as HomeShortcutRow
    return toHomeShortcut(row)
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM home_shortcut WHERE id = ?').run(id).changes > 0
  }
}
