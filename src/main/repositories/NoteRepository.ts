import type { Note, NoteInput, NotePatch } from '../../shared/types'
import type { SqliteDatabase } from '../database/connection'

interface NoteRow {
  id: number
  title: string
  content: string
  url: string
  sort_order: number
  created_at: string
  updated_at: string
  last_opened_at: string | null
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    url: row.url,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at
  }
}

export class NoteRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findAll(): Note[] {
    const rows = this.db.prepare('SELECT * FROM note ORDER BY sort_order ASC, id ASC').all() as NoteRow[]
    return rows.map(toNote)
  }

  findById(id: number): Note | null {
    const row = this.db.prepare('SELECT * FROM note WHERE id = ?').get(id) as NoteRow | undefined
    return row ? toNote(row) : null
  }

  /** 关键字搜索：标题 / 内容 / 链接任一命中即可 */
  find(keyword?: string): Note[] {
    const needle = keyword?.trim().toLowerCase()
    if (!needle) return this.findAll()

    const pattern = `%${needle}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM note
          WHERE lower(title) LIKE ? OR lower(content) LIKE ? OR lower(url) LIKE ?
          ORDER BY sort_order ASC, id ASC`
      )
      .all(pattern, pattern, pattern) as NoteRow[]
    return rows.map(toNote)
  }

  /** 从搜索跳转打开过的备忘，按打开时间倒序（「最近打开」用） */
  findRecentlyOpened(limit: number): Note[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM note
          WHERE last_opened_at IS NOT NULL
          ORDER BY last_opened_at DESC, id DESC LIMIT ?`
      )
      .all(limit) as NoteRow[]
    return rows.map(toNote)
  }

  /** 记一次「从搜索打开」；返回是否命中存在的备忘 */
  markOpened(id: number, openedAt: string): boolean {
    return this.db.prepare('UPDATE note SET last_opened_at = ? WHERE id = ?').run(openedAt, id).changes > 0
  }

  /** 新备忘排在最前面：取当前最小排序值再减 10（列表按 sort_order 升序显示） */
  topSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MIN(sort_order), 10) AS value FROM note').get() as { value: number }
    return row.value - 10
  }

  insert(input: NoteInput & { sortOrder: number }): Note {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `INSERT INTO note (title, content, url, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.title, input.content ?? '', input.url ?? '', input.sortOrder, now, now)
    return this.findById(Number(result.lastInsertRowid))!
  }

  update(id: number, patch: NotePatch): Note | null {
    const current = this.findById(id)
    if (!current) return null

    this.db
      .prepare('UPDATE note SET title = ?, content = ?, url = ?, sort_order = ?, updated_at = ? WHERE id = ?')
      .run(
        patch.title ?? current.title,
        patch.content ?? current.content,
        patch.url ?? current.url,
        patch.sortOrder ?? current.sortOrder,
        new Date().toISOString(),
        id
      )
    return this.findById(id)
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM note WHERE id = ?').run(id).changes > 0
  }
}
