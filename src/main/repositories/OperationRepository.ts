import type { FileOperation, FileOperationKind, FileOperationOrigin, OperationBatch } from '../../shared/types'
import type { SqliteDatabase } from '../database/connection'

interface OperationRow {
  id: number
  batch_id: string
  kind: FileOperationKind
  origin: FileOperationOrigin
  rule_id: number | null
  source_path: string
  target_path: string
  created_at: string
  undone_at: string | null
}

interface BatchRow {
  batch_id: string
  kind: FileOperationKind
  origin: FileOperationOrigin
  rule_id: number | null
  created_at: string
  total: number
  pending: number
}

function toOperation(row: OperationRow): FileOperation {
  return {
    id: row.id,
    batchId: row.batch_id,
    kind: row.kind,
    origin: row.origin,
    ruleId: row.rule_id,
    sourcePath: row.source_path,
    targetPath: row.target_path,
    createdAt: row.created_at,
    undoneAt: row.undone_at
  }
}

export class OperationRepository {
  constructor(private readonly db: SqliteDatabase) {}

  /** 最近的操作批次，按时间倒序 */
  findBatches(limit: number, previewSize = 3): OperationBatch[] {
    const rows = this.db
      .prepare(
        `SELECT batch_id,
                MIN(kind)        AS kind,
                MIN(origin)      AS origin,
                MAX(rule_id)     AS rule_id,
                MIN(created_at)  AS created_at,
                COUNT(*)         AS total,
                SUM(CASE WHEN undone_at IS NULL THEN 1 ELSE 0 END) AS pending
           FROM file_operation
          GROUP BY batch_id
          ORDER BY created_at DESC, batch_id DESC
          LIMIT ?`
      )
      .all(limit) as BatchRow[]

    if (rows.length === 0) return []

    const placeholders = rows.map(() => '?').join(', ')
    const detailRows = this.db
      .prepare(
        `SELECT batch_id, source_path, target_path
           FROM file_operation
          WHERE batch_id IN (${placeholders})
          ORDER BY id ASC`
      )
      .all(...rows.map((row) => row.batch_id)) as Array<{
      batch_id: string
      source_path: string
      target_path: string
    }>

    const previews = new Map<string, string[]>()
    for (const row of detailRows) {
      const bucket = previews.get(row.batch_id) ?? []
      if (bucket.length < previewSize) bucket.push(`${row.source_path} → ${row.target_path}`)
      previews.set(row.batch_id, bucket)
    }

    return rows.map((row) => ({
      batchId: row.batch_id,
      kind: row.kind,
      origin: row.origin,
      ruleId: row.rule_id,
      createdAt: row.created_at,
      count: row.total,
      pending: row.pending,
      preview: previews.get(row.batch_id) ?? []
    }))
  }

  findByBatch(batchId: string): FileOperation[] {
    const rows = this.db
      .prepare('SELECT * FROM file_operation WHERE batch_id = ? ORDER BY id ASC')
      .all(batchId) as OperationRow[]
    return rows.map(toOperation)
  }

  insertMany(
    batchId: string,
    entries: Array<{ source: string; target: string }>,
    kind: FileOperationKind,
    origin: FileOperationOrigin,
    ruleId: number | null
  ): void {
    const now = new Date().toISOString()
    const statement = this.db.prepare(
      `INSERT INTO file_operation (batch_id, kind, origin, rule_id, source_path, target_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    this.db.transaction(() => {
      for (const entry of entries) {
        statement.run(batchId, kind, origin, ruleId, entry.source, entry.target, now)
      }
    })()
  }

  markUndone(ids: number[], undoneAt = new Date().toISOString()): void {
    if (ids.length === 0) return
    const statement = this.db.prepare('UPDATE file_operation SET undone_at = ? WHERE id = ?')
    this.db.transaction(() => {
      for (const id of ids) statement.run(undoneAt, id)
    })()
  }

  /** 最近一个还有未撤销条目的批次 */
  findLastUndoable(): OperationBatch | null {
    const batches = this.findBatches(50)
    return batches.find((batch) => batch.pending > 0) ?? null
  }
}
