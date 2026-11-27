import type { WorkLog, WorkLogDraft } from '../../shared/types'
import type { SqliteDatabase } from '../database/connection'

interface WorkLogRow {
  date: string
  content: string
  completed: string
  incomplete: string
  issues: string
  updated_at: string
}

function toWorkLog(row: WorkLogRow): WorkLog {
  return {
    date: row.date,
    content: row.content,
    completed: row.completed,
    incomplete: row.incomplete,
    issues: row.issues,
    updatedAt: row.updated_at
  }
}

export class WorkLogRepository {
  constructor(private readonly db: SqliteDatabase) {}

  find(startDate: string, endDate: string): WorkLog[] {
    const rows = this.db
      .prepare('SELECT * FROM work_log WHERE date >= ? AND date <= ? ORDER BY date ASC')
      .all(startDate, endDate) as WorkLogRow[]
    return rows.map(toWorkLog)
  }

  findByDate(date: string): WorkLog | null {
    const row = this.db.prepare('SELECT * FROM work_log WHERE date = ?').get(date) as WorkLogRow | undefined
    return row ? toWorkLog(row) : null
  }

  upsert(date: string, draft: WorkLogDraft): WorkLog {
    this.db
      .prepare(
        `INSERT INTO work_log (date, content, completed, incomplete, issues, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           content = excluded.content,
           completed = excluded.completed,
           incomplete = excluded.incomplete,
           issues = excluded.issues,
           updated_at = excluded.updated_at`
      )
      .run(
        date,
        draft.content,
        draft.completed,
        draft.incomplete,
        draft.issues,
        new Date().toISOString()
      )
    return this.findByDate(date)!
  }
}
