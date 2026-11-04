import type { Migration } from '../migration'

/**
 * 文件操作历史：一次批量操作（移动 / 重命名 / 整理规则执行）写成一个 batch，
 * 每个条目一行「原路径 → 新路径」，用于撤销最近一次操作。
 * 不记录删除：删除走系统回收站，恢复要交给系统文件管理器。
 */
export const migration003: Migration = {
  version: 3,
  name: 'file_operation',
  up(db) {
    db.exec(`
      CREATE TABLE file_operation (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id    TEXT    NOT NULL,
        kind        TEXT    NOT NULL CHECK (kind IN ('move', 'rename')),
        origin      TEXT    NOT NULL CHECK (origin IN ('manual', 'rule')),
        rule_id     INTEGER REFERENCES rule (id) ON DELETE SET NULL,
        source_path TEXT    NOT NULL,
        target_path TEXT    NOT NULL,
        created_at  TEXT    NOT NULL,
        undone_at   TEXT
      );

      CREATE INDEX idx_file_operation_batch ON file_operation (batch_id);
      CREATE INDEX idx_file_operation_created ON file_operation (created_at);
    `)
  }
}
