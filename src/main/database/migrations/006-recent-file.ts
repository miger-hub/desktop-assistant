import type { Migration } from '../migration'

/**
 * 最近打开的文件 / 目录，只给搜索弹框的「最近打开」用。
 * 记录很少，按 path 去重并保留固定条数，不做历史归档。
 */
export const migration006: Migration = {
  version: 6,
  name: 'recent-file',
  up(db) {
    db.exec(`
      CREATE TABLE recent_file (
        path      TEXT PRIMARY KEY,
        name      TEXT    NOT NULL,
        kind      TEXT    NOT NULL CHECK (kind IN ('file', 'directory')),
        opened_at TEXT    NOT NULL,
        count     INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX idx_recent_file_opened ON recent_file (opened_at DESC);
    `)
  }
}
