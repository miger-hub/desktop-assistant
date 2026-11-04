import type { Migration } from '../migration'

/**
 * 自动整理规则：把某个目录里「按扩展名 / 名称」命中的文件移动到目标目录。
 * 只存路径，不存文件系统状态（目录是否存在由应用层实时判断）。
 */
export const migration002: Migration = {
  version: 2,
  name: 'rule',
  up(db) {
    db.exec(`
      CREATE TABLE rule (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        enabled     INTEGER NOT NULL DEFAULT 1,
        source_path TEXT    NOT NULL,
        match_type  TEXT    NOT NULL
                    CHECK (match_type IN ('extension', 'name')),
        pattern     TEXT    NOT NULL,
        target_path TEXT    NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );

      CREATE INDEX idx_rule_order ON rule (sort_order, id);
    `)
  }
}
