import type { Migration } from '../migration'

/**
 * 备忘的「最近打开」时间：从全局搜索跳转到某条备忘时记一次，
 * 搜索弹框的「最近打开」用它把备忘和打开过的文件排在一起。
 * 老数据为 NULL，表示还没从搜索里打开过。
 */
export const migration007: Migration = {
  version: 7,
  name: 'note-opened',
  up(db) {
    db.exec(`
      ALTER TABLE note ADD COLUMN last_opened_at TEXT;

      CREATE INDEX idx_note_opened ON note (last_opened_at DESC);
    `)
  }
}
