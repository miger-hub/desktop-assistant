import type { Migration } from '../migration'

/**
 * 日报拆成「完成 / 未完成 / 问题 / 默认」四栏。
 * 旧字段 content 保留为「默认」，已有日报不需要改写。
 */
export const migration011: Migration = {
  version: 11,
  name: 'work-log-sections',
  up(db) {
    db.exec(`
      ALTER TABLE work_log ADD COLUMN completed TEXT NOT NULL DEFAULT '';
      ALTER TABLE work_log ADD COLUMN incomplete TEXT NOT NULL DEFAULT '';
      ALTER TABLE work_log ADD COLUMN issues TEXT NOT NULL DEFAULT '';
    `)
  }
}
