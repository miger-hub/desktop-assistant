import type { Migration } from '../migration'

/** 首页常用链接的最近使用时间；与全局搜索的 last_opened_at 分开记录。 */
export const migration010: Migration = {
  version: 10,
  name: 'note-link-usage',
  up(db) {
    db.exec(`
      ALTER TABLE note ADD COLUMN last_link_used_at TEXT;
      CREATE INDEX idx_note_link_used ON note (last_link_used_at DESC);
    `)
  }
}
