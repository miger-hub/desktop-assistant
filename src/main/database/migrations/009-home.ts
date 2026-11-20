import type { Migration } from '../migration'

/**
 * 首页数据：
 * - home_shortcut：快捷访问系统应用，只保存启动目标与显示名；
 * - work_log：按自然日保存工作记录，周报从这些记录导出。
 *
 * 旧的 recent_file 无法区分「在文件列表打开」和「从全局搜索打开」，
 * 新语义上线时清空一次，避免把旧的非搜索打开记录继续展示成搜索结果最近项。
 */
export const migration009: Migration = {
  version: 9,
  name: 'home',
  up(db) {
    db.exec(`
      CREATE TABLE home_shortcut (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        label      TEXT    NOT NULL,
        path       TEXT    NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL
      );

      CREATE INDEX idx_home_shortcut_order ON home_shortcut (sort_order, id);

      CREATE TABLE work_log (
        date       TEXT PRIMARY KEY,
        content    TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      DELETE FROM recent_file;
    `)
  }
}
