import type { Migration } from '../migration'

/**
 * 已安装插件的状态。
 * 只保存安装/启用状态，不保存插件输入或结果（这些不落盘）。
 */
export const migration008: Migration = {
  version: 8,
  name: 'plugin',
  up(db) {
    db.exec(`
      CREATE TABLE plugin (
        id           TEXT    PRIMARY KEY,
        version      TEXT    NOT NULL,
        enabled      INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        install_path TEXT    NOT NULL,
        installed_at TEXT    NOT NULL
      );
    `)
  }
}
