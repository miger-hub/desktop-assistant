import type { Rule, RuleMatchType, RulePatch } from '../../shared/types'
import type { SqliteDatabase } from '../database/connection'

interface RuleRow {
  id: number
  name: string
  enabled: number
  source_path: string
  match_type: RuleMatchType
  pattern: string
  target_path: string
  sort_order: number
  created_at: string
  updated_at: string
}

function toRule(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    sourcePath: row.source_path,
    matchType: row.match_type,
    pattern: row.pattern,
    targetPath: row.target_path,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class RuleRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findAll(): Rule[] {
    const rows = this.db
      .prepare('SELECT * FROM rule ORDER BY sort_order ASC, id ASC')
      .all() as RuleRow[]
    return rows.map(toRule)
  }

  findEnabled(): Rule[] {
    const rows = this.db
      .prepare('SELECT * FROM rule WHERE enabled = 1 ORDER BY sort_order ASC, id ASC')
      .all() as RuleRow[]
    return rows.map(toRule)
  }

  findById(id: number): Rule | null {
    const row = this.db.prepare('SELECT * FROM rule WHERE id = ?').get(id) as RuleRow | undefined
    return row ? toRule(row) : null
  }

  /** 新规则排在最前面：取当前最小排序值再减 10（列表按 sort_order 升序显示） */
  topSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MIN(sort_order), 10) AS value FROM rule').get() as {
      value: number
    }
    return row.value - 10
  }

  insert(input: {
    name: string
    enabled: boolean
    sourcePath: string
    matchType: RuleMatchType
    pattern: string
    targetPath: string
    sortOrder: number
  }): Rule {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `INSERT INTO rule (name, enabled, source_path, match_type, pattern, target_path, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.name,
        input.enabled ? 1 : 0,
        input.sourcePath,
        input.matchType,
        input.pattern,
        input.targetPath,
        input.sortOrder,
        now,
        now
      )
    return this.findById(Number(result.lastInsertRowid))!
  }

  update(id: number, patch: RulePatch): Rule | null {
    const current = this.findById(id)
    if (!current) return null

    const next = {
      name: patch.name ?? current.name,
      enabled: patch.enabled === undefined ? current.enabled : patch.enabled,
      sourcePath: patch.sourcePath ?? current.sourcePath,
      matchType: patch.matchType ?? current.matchType,
      pattern: patch.pattern ?? current.pattern,
      targetPath: patch.targetPath ?? current.targetPath,
      sortOrder: patch.sortOrder ?? current.sortOrder
    }

    this.db
      .prepare(
        `UPDATE rule
            SET name = ?, enabled = ?, source_path = ?, match_type = ?, pattern = ?, target_path = ?, sort_order = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(
        next.name,
        next.enabled ? 1 : 0,
        next.sourcePath,
        next.matchType,
        next.pattern,
        next.targetPath,
        next.sortOrder,
        new Date().toISOString(),
        id
      )
    return this.findById(id)
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM rule WHERE id = ?').run(id).changes > 0
  }
}
