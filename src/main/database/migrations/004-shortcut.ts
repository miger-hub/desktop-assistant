import type { Migration } from '../migration'

/**
 * 快捷入口：把常用文件 / 目录 / 工作区置顶到侧边栏。
 * 只存引用（路径或工作区 id），文件系统状态由应用层实时判断。
 */
export const migration004: Migration = {
  version: 4,
  name: 'shortcut',
  up(db) {
    db.exec(`
      CREATE TABLE shortcut (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        kind         TEXT    NOT NULL
                     CHECK (kind IN ('file', 'directory', 'workspace')),
        label        TEXT    NOT NULL,
        path         TEXT,
        workspace_id INTEGER REFERENCES workspace (id) ON DELETE CASCADE,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL,
        -- 文件 / 目录必须有路径且不能带工作区；工作区条目必须有 workspace_id
        CHECK (
          (kind IN ('file', 'directory') AND path IS NOT NULL AND workspace_id IS NULL)
          OR (kind = 'workspace' AND path IS NULL AND workspace_id IS NOT NULL)
        )
      );

      -- 同一个路径 / 工作区只允许置顶一次
      CREATE UNIQUE INDEX idx_shortcut_path ON shortcut (path) WHERE path IS NOT NULL;
      CREATE UNIQUE INDEX idx_shortcut_workspace ON shortcut (workspace_id) WHERE workspace_id IS NOT NULL;
      CREATE INDEX idx_shortcut_order ON shortcut (sort_order, id);
    `)
  }
}
