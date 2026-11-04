import type { SqliteDatabase } from '../database/connection'
import type { Todo, TodoFilter, TodoInput, TodoPatch } from '../../shared/types'

interface TodoRow {
  id: number
  workspace_id: number | null
  title: string
  description: string
  status: Todo['status']
  priority: Todo['priority']
  due_date: string | null
  created_at: string
  updated_at: string
}

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class TodoRepository {
  constructor(private readonly db: SqliteDatabase) {}

  find(filter: TodoFilter = {}): Todo[] {
    const conditions: string[] = []
    const params: Array<string | number> = []

    if (filter.workspaceId === null) {
      conditions.push('workspace_id IS NULL')
    } else if (typeof filter.workspaceId === 'number') {
      conditions.push('workspace_id = ?')
      params.push(filter.workspaceId)
    }
    if (filter.status) {
      conditions.push('status = ?')
      params.push(filter.status)
    }
    if (filter.keyword) {
      conditions.push('(title LIKE ? ESCAPE \'\\\' OR description LIKE ? ESCAPE \'\\\')')
      const pattern = `%${filter.keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
      params.push(pattern, pattern)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.db
      .prepare(
        `SELECT * FROM todo ${where}
         ORDER BY (status = 'done') ASC,
                  CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC,
                  COALESCE(due_date, '9999-12-31') ASC,
                  id DESC`
      )
      .all(...params) as TodoRow[]
    return rows.map(toTodo)
  }

  findById(id: number): Todo | null {
    const row = this.db.prepare('SELECT * FROM todo WHERE id = ?').get(id) as TodoRow | undefined
    return row ? toTodo(row) : null
  }

  insert(input: Required<Pick<TodoInput, 'title' | 'description' | 'status' | 'priority' | 'dueDate'>> & {
    workspaceId: number | null
  }): Todo {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `INSERT INTO todo (workspace_id, title, description, status, priority, due_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(input.workspaceId, input.title, input.description, input.status, input.priority, input.dueDate, now, now)
    return this.findById(Number(result.lastInsertRowid))!
  }

  update(id: number, patch: TodoPatch): Todo | null {
    const current = this.findById(id)
    if (!current) return null

    const next = {
      workspaceId: patch.workspaceId === undefined ? current.workspaceId : patch.workspaceId,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      status: patch.status ?? current.status,
      priority: patch.priority ?? current.priority,
      dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate
    }

    this.db
      .prepare(
        `UPDATE todo
            SET workspace_id = ?, title = ?, description = ?, status = ?, priority = ?, due_date = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(
        next.workspaceId,
        next.title,
        next.description,
        next.status,
        next.priority,
        next.dueDate,
        new Date().toISOString(),
        id
      )
    return this.findById(id)
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM todo WHERE id = ?').run(id).changes > 0
  }
}
