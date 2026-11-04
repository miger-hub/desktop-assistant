import type { Migration } from '../migration'

/** 备忘：一段文本，可选带一个链接（复制 / 用浏览器打开） */
export const migration005: Migration = {
  version: 5,
  name: 'note',
  up(db) {
    db.exec(`
      CREATE TABLE note (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT    NOT NULL,
        content    TEXT    NOT NULL DEFAULT '',
        url        TEXT    NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );

      CREATE INDEX idx_note_order ON note (sort_order, id);
    `)
  }
}
