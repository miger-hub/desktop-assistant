import type { Migration } from '../migration'

/** 初始结构：workspace / mapped_directory / todo / setting */
export const migration001: Migration = {
  version: 1,
  name: 'init',
  up(db) {
    db.exec(`
      CREATE TABLE workspace (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );

      CREATE TABLE mapped_directory (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
        name         TEXT    NOT NULL,
        path         TEXT    NOT NULL,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        UNIQUE (workspace_id, path)
      );

      CREATE INDEX idx_mapped_directory_workspace ON mapped_directory (workspace_id);

      CREATE TABLE todo (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER REFERENCES workspace (id) ON DELETE CASCADE,
        title        TEXT    NOT NULL,
        description  TEXT    NOT NULL DEFAULT '',
        status       TEXT    NOT NULL DEFAULT 'todo'
                     CHECK (status IN ('todo', 'doing', 'done')),
        priority     TEXT    NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low', 'normal', 'high')),
        due_date     TEXT,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL
      );

      CREATE INDEX idx_todo_workspace ON todo (workspace_id);
      CREATE INDEX idx_todo_status ON todo (status);

      CREATE TABLE setting (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }
}
