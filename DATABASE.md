# DATABASE.md

本文档描述 Desktop Assistant 当前使用的 SQLite 结构、约定与 migration 流程。
内容以 `src/main/database/` 与 `src/main/repositories/` 的实际代码为准。

相关文档：[AGENTS.md](AGENTS.md)（数据库原则）、[ARCHITECTURE.md](ARCHITECTURE.md)（分层与 Schema 草案）。

---

## 1. 总览

```text
Driver        better-sqlite3（同步 API，N-API 预编译二进制）
数据库文件     <userData>/data.db
              Linux   ~/.config/desktop-assistant/data.db
              Windows %APPDATA%\Desktop Assistant\data.db
读取位置       Electron app.getPath('userData')
连接配置       journal_mode = WAL
              foreign_keys = ON
              busy_timeout / 其它 pragma：未设置（单进程独占，MVP 不必要）
```

原则（见 AGENTS.md §5）：

- SQLite 只保存 **Workspace / Directory Mapping / Todo / Rule / Shortcut / Note / Setting**、
  文件操作历史与「最近打开」。
- **文件内容与文件列表不进入数据库**，文件只在运行时由 `FileService` 读取。
- 结构变化只新增 migration，不修改历史版本。
- **升级前先备份**（`VACUUM INTO`），版本回退时用备份覆盖 `data.db`。
- 数据库不放在项目目录，卸载应用时保留数据（`nsis.deleteAppDataOnUninstall: false`）。

---

## 2. 连接与生命周期

`src/main/database/connection.ts`

```ts
openDatabase(filePath)
  → 非 :memory: 时先 mkdirSync(dirname, { recursive: true })
  → new Database(filePath)
  → pragma journal_mode = WAL
  → pragma foreign_keys = ON
```

`src/main/services/DatabaseService.ts` 负责生命周期：

```text
constructor(filePath)  → openDatabase()
                       → 读 schema_migration 的最大 version（数据库版本）
                       → 数据库版本 > 程序支持的版本 → 直接报错，不打开数据
                       → 数据库版本 < 程序支持的版本 → 先自动备份，再 migrate()
connection             → 已关闭时抛 ServiceError('DB_ERROR')
schemaVersion          → 本次启动应用完 migration 后的结构版本
upgradeBackup          → 本次升级自动生成的备份路径（没升级则为 null）
backup(label)          → 手动备份，返回备份文件路径
close()                → 幂等，重复调用安全
```

连接在主进程启动时创建一次（`src/main/index.ts` → `bootstrap()`），
在 `before-quit` 时关闭。渲染进程永远不直接访问 SQLite。

`bootstrap()` 抛错（例如数据库版本过新、文件损坏）时弹出系统错误框并退出，
不会带着半初始化的状态继续启动。

---

## 3. Migration 机制

`src/main/database/migration.ts`

```text
schema_migration(version PK, name, applied_at)
  ↓ 存放已应用的版本
migrations: Migration[]   // 按 version 升序执行，每个 migration 一个事务
```

流程：

1. `CREATE TABLE IF NOT EXISTS schema_migration`
2. 读取已应用的 version 集合
3. 过滤出未应用的 migration，按 `version` 升序
4. 每个 migration 在独立事务中执行：`up(db)` + 写入 `schema_migration`
5. 返回本次应用的 migration 数量（重复启动返回 `0`）

### 当前版本

| version | name | 文件 | 内容 |
| --- | --- | --- | --- |
| 1 | `init` | `migrations/001-init.ts` | `workspace` / `mapped_directory` / `todo` / `setting` |
| 2 | `rule` | `migrations/002-rule.ts` | `rule`（自动整理规则） |
| 3 | `file_operation` | `migrations/003-file-operation.ts` | `file_operation`（操作历史 / 撤销） |
| 4 | `shortcut` | `migrations/004-shortcut.ts` | `shortcut`（快捷入口） |
| 5 | `note` | `migrations/005-note.ts` | `note`（备忘） |
| 6 | `recent-file` | `migrations/006-recent-file.ts` | `recent_file`（最近打开） |

### 新增 migration 的步骤

1. 新建 `src/main/database/migrations/<下一个版本>-<name>.ts`，导出 `Migration` 对象（版本号递增）。
2. 在 `migration.ts` 的 `migrations` 数组中追加。
3. **不要修改** 已发布的 `001-init.ts`。
4. 在 `tests/database.test.ts` 补一条断言（新表 / 新列 / 幂等性 / 升级后 `schemaVersion` 正确）。
5. 涉及数据回填时，在 migration 内部用 SQL 完成，不要依赖应用层代码。

SQLite 的 `ALTER TABLE` 能力有限（例如不能直接删除或改约束），
必要时使用官方推荐的重建流程：建新表 → 复制数据 → 删旧表 → 重命名。

### 版本升级流程（应用升级时会发生什么）

```text
启动应用
  ↓
打开 data.db（WAL + foreign_keys=ON）
  ↓
读数据库版本 DB = MAX(schema_migration.version)
读程序版本 APP = MAX(migrations[].version)
  ↓
DB > APP  → 报错退出："数据库结构版本比当前程序支持的更新"
             （用户装了旧版本应用；拒绝启动是为了不让旧代码写坏新结构）
  ↓
DB == APP → 什么都不做，正常启动
  ↓
DB < APP  → VACUUM INTO 备份到 <userData>/backups/
            → 逐个执行未应用的 migration（每个一个事务，失败即回滚）
            → schema_migration 记录版本
```

约定：

- **版本号只看 `schema_migration`**，与 `package.json` 的应用版本号解耦。
  应用版本可以随便跳，结构版本只跟着 migration 递增。
- **升级前自动备份**：文件名形如 `data-v1-to-v2-20260922-131500.db`，
  备份目录最多保留最近 5 份（`src/main/database/backup.ts` 的 `pruneBackups`）。
  备份失败不阻塞升级，只在控制台留 warning（迁移本身在事务里）。
- **全新数据库不备份**：`DB == 0` 时没有数据可丢。
- **回滚**：退出应用 → 用备份文件覆盖 `<userData>/data.db` →
  删除同目录下的 `data.db-wal` / `data.db-shm` → 重新启动（会再次执行 migration）。
- **不要为了让 migration "跑通"而改历史文件**：已发布的 migration 只能追加，不能修改。

---

## 4. 表结构

### 4.1 `schema_migration`

Migration 记录表，由代码创建，不属于 `001-init`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `version` | INTEGER | PRIMARY KEY | migration 版本号 |
| `name` | TEXT | NOT NULL | migration 名称 |
| `applied_at` | TEXT | NOT NULL | ISO 8601 时间 |

### 4.2 `workspace`

逻辑分组，**不要求对应真实目录**。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `name` | TEXT | NOT NULL UNIQUE | 工作区名称 |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | 列表排序；新建时 `MAX+10`，拖拽排序后按新顺序写成 `(index+1)*10` |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |

对应代码：`WorkspaceRepository` / `WorkspaceService`（`name` 最长 60 字符）。

注意：`UNIQUE` 约束区分大小写，而 `WorkspaceService` 用 `findByName()`（`COLLATE NOCASE`）做重复校验。
正常走服务层时 `Dev` 与 `dev` 会被拒绝；绕过服务层直接写库不受此保护。

### 4.3 `mapped_directory`

Workspace 到真实目录的映射关系。数据库只保存映射，不保存目录内容。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `workspace_id` | INTEGER | NOT NULL REFERENCES `workspace(id)` ON DELETE CASCADE | 所属工作区 |
| `name` | TEXT | NOT NULL | 展示名，默认取目录 basename |
| `path` | TEXT | NOT NULL | 绝对路径（`path.resolve` 后的结果） |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |
| — | — | UNIQUE (`workspace_id`, `path`) | 同一工作区不能重复映射同一路径 |
| — | — | INDEX `idx_mapped_directory_workspace` (`workspace_id`) | |

`MappedDirectory.exists` **不是数据库字段**：每次读取时由 `WorkspaceService.decorate()`
调用文件系统实时判断（目录被删除 / 移动后仍保留映射，只标记为不存在）。这是有意的设计，
避免数据库保存会失效的文件系统状态。

### 4.4 `todo`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `workspace_id` | INTEGER | REFERENCES `workspace(id)` ON DELETE CASCADE，可为 NULL | NULL = 收件箱 |
| `title` | TEXT | NOT NULL | 最长 200 字符（服务层校验） |
| `description` | TEXT | NOT NULL DEFAULT '' | |
| `status` | TEXT | NOT NULL DEFAULT `'todo'`，CHECK IN (`todo`,`doing`,`done`) | |
| `priority` | TEXT | NOT NULL DEFAULT `'normal'`，CHECK IN (`low`,`normal`,`high`) | |
| `due_date` | TEXT | 可为 NULL | `YYYY-MM-DD`（服务层正则校验） |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |
| — | — | INDEX `idx_todo_workspace` (`workspace_id`) | |
| — | — | INDEX `idx_todo_status` (`status`) | |

列表排序（`TodoRepository.find`）：

```sql
ORDER BY (status = 'done') ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC,
         COALESCE(due_date, '9999-12-31') ASC,
         id DESC
```

关键字过滤在 SQL 中用 `LIKE ... ESCAPE '\'`，并对 `%` `_` `\` 做转义，属于子串匹配，不是全文搜索。

### 4.5 `setting`

简单的 key-value 表，读取时由 `SettingsService` 补默认值。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `key` | TEXT | PRIMARY KEY | |
| `value` | TEXT | NOT NULL | 一律以字符串存储 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |

当前已知 key：

| key | 取值 | 默认值 |
| --- | --- | --- |
| `language` | `system` / `zh-CN` / `zh-TW` / `en` | `system` |
| `theme` | `light` / `dark` / `dracula` / `system` | `system` |
| `uiScale` | `small` / `normal` / `large` / `x-large` | `normal` |
| `showHiddenFiles` | `'true'` / `'false'` | `false` |
| `confirmDelete` | `'true'` / `'false'` | `true` |
| `trayEnabled` | `'true'` / `'false'` | `true` |
| `globalShortcutsEnabled` | `'true'` / `'false'` | `true` |
| `toggleShortcut` | Electron accelerator（至少一个修饰键） | `CommandOrControl+Alt+A` |
| `searchShortcut` | Electron accelerator（至少一个修饰键） | `CommandOrControl+Alt+K` |
| `clipboardHistoryLimit` | `1` ~ `50` 的整数 | `10` |
| `searchDebounceMs` | `0` ~ `1000` 的整数（毫秒） | `200` |
| `searchResultLimit` | `5` ~ `60` 的整数（条） | `20` |
| `closeSearchOnHide` | `'true'` / `'false'` | `true` |
| `clearSearchOnClose` | `'true'` / `'false'` | `false` |
| `searchInMainWindow` | `'true'` / `'false'` | `false` |
| `openWithRules` | JSON 数组：`[{"extension":"md","program":"/usr/bin/…"}]` | `[]` |

写入使用 `INSERT ... ON CONFLICT(key) DO UPDATE`，多 key 更新在一个事务内完成。
未知 key 会被原样保留，但不会被读取。

### 4.6 `rule`

自动整理规则：把源目录里命中的文件移动到目标目录。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | 规则名称，最长 60 字符（服务层校验） |
| `enabled` | INTEGER | NOT NULL DEFAULT 1 | `1` / `0`；SQLite 没有布尔类型 |
| `source_path` | TEXT | NOT NULL | 要整理的目录（绝对路径） |
| `match_type` | TEXT | NOT NULL，CHECK IN (`extension`,`name`) | 按扩展名 / 按名称关键字 |
| `pattern` | TEXT | NOT NULL | `png, .jpg` 或 `截图, screenshot`（逗号 / 空格分隔，最长 200 字符） |
| `target_path` | TEXT | NOT NULL | 命中后移动到这里（绝对路径） |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | 新建时 `MIN-10`（列表顺序，也是执行顺序：新建的排在最前面） |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |
| — | — | INDEX `idx_rule_order` (`sort_order`, `id`) | |

与 `mapped_directory` 一样，**只存路径**，不存目录是否存在。
源 / 目标目录是否可用由 `RuleService.preview()` 实时判断，
UI 里用 `files.exists` 给规则打「目录不存在」标记。

规则只作用于普通文件：目录、符号链接、隐藏文件都不参与整理（`matchesRule`）。
同名冲突不会覆盖，执行时按失败计入 `BulkResult.failed`，预览阶段就会标出来。

对应代码：`RuleRepository` / `RuleService`（`src/main/services/RuleService.ts`）。

### 4.7 `file_operation`

文件操作历史，一次批量操作（移动 / 重命名 / 整理规则执行）写成同一个 `batch_id`，
每个条目一行「原路径 → 新路径」，供「撤销」使用。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `batch_id` | TEXT | NOT NULL | 批次 ID（`randomUUID`） |
| `kind` | TEXT | NOT NULL，CHECK IN (`move`,`rename`) | 用于在历史里显示「移动 / 重命名」 |
| `origin` | TEXT | NOT NULL，CHECK IN (`manual`,`rule`) | 手动操作还是整理规则执行 |
| `rule_id` | INTEGER | REFERENCES `rule(id)` ON DELETE SET NULL | 规则执行时的来源；删规则不删历史 |
| `source_path` | TEXT | NOT NULL | 操作前的路径 |
| `target_path` | TEXT | NOT NULL | 操作后的路径 |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `undone_at` | TEXT | 可为 NULL | 已撤销时间；NULL 表示还能撤销 |
| — | — | INDEX `idx_file_operation_batch` (`batch_id`) | |
| — | — | INDEX `idx_file_operation_created` (`created_at`) | |

约定：

- **删除不进历史**：删除走系统回收站，恢复交给系统文件管理器，应用不做「撤销删除」。
- **撤销 = 反向移动**：把 `target_path` 移回 `source_path`，逐条执行；
  原位置被占用、目标已不在的条目会失败，其余条目继续，只有成功的条目写入 `undone_at`。
- 撤销本身不再写一条新历史（避免「撤销的撤销」套娃）。
- 历史不做自动清理（体量很小），最近 20 条批次在整理页展示。

对应代码：`OperationRepository` / `OperationService`（`src/main/services/OperationService.ts`）。

### 4.8 `shortcut`

快捷入口：把常用文件、目录、工作区置顶到侧边栏。只存引用，
**路径是否存在由应用层实时判断**（`ShortcutService.exists`），不落库。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `kind` | TEXT | NOT NULL，CHECK IN (`file`,`directory`,`workspace`) | |
| `label` | TEXT | NOT NULL | 显示名称（默认取文件名 / 工作区名） |
| `path` | TEXT | 可为 NULL | 文件 / 目录的绝对路径；`workspace` 类型为 NULL |
| `workspace_id` | INTEGER | REFERENCES `workspace(id)` ON DELETE CASCADE | 工作区置顶；其它类型为 NULL |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | 追加时取 `MAX+10` |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| — | — | CHECK | 文件 / 目录必须有 `path` 且 `workspace_id` 为空；工作区条目相反 |
| — | — | UNIQUE `idx_shortcut_path` (`path`) WHERE `path IS NOT NULL` | 同一路径只置顶一次 |
| — | — | UNIQUE `idx_shortcut_workspace` (`workspace_id`) WHERE `workspace_id IS NOT NULL` | |
| — | — | INDEX `idx_shortcut_order` (`sort_order`, `id`) | |

约定：

- 重复置顶同一路径 / 工作区会被拒绝（`EXISTS`），UI 上「置顶」按钮直接置灰。
- 删除工作区时快捷入口随外键级联一起删除。
- 目标在磁盘上被移走后条目仍然保留，列表里显示「（不存在）」，由用户自行移除。

对应代码：`ShortcutRepository` / `ShortcutService`。

### 4.9 `note`

备忘：一段文本，可选带一个链接。链接在写入前规范化（补 `https://`，只允许 http / https）。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `title` | TEXT | NOT NULL | 最多 120 字 |
| `content` | TEXT | NOT NULL DEFAULT '' | 最多 20000 字 |
| `url` | TEXT | NOT NULL DEFAULT '' | 空串表示没有链接 |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | 追加时取 `MAX+10` |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 |
| — | — | INDEX `idx_note_order` (`sort_order`, `id`) | |

约定：备忘只存文本，不存文件内容；关键字搜索覆盖标题、内容与链接（`NoteRepository.find`）。

对应代码：`NoteRepository` / `NoteService`。

### 4.10 `recent_file`

最近打开的文件 / 目录，给全局搜索弹框的「最近打开」用。同一路径去重、累加打开次数，
只保留固定条数（`RECENT_KEEP = 50`）。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `path` | TEXT | PRIMARY KEY | 绝对路径（`path.resolve` 后写入） |
| `name` | TEXT | NOT NULL | 文件名 / 目录名 |
| `kind` | TEXT | NOT NULL，CHECK IN (`file`,`directory`) | |
| `opened_at` | TEXT | NOT NULL | 最近一次打开时间（ISO 8601） |
| `count` | INTEGER | NOT NULL DEFAULT 1 | 累计打开次数 |
| — | — | INDEX `idx_recent_file_opened` (`opened_at` DESC) | |

约定：

- 只有**用户主动打开**文件 / 目录才会记录；打开数据目录、备份目录不计入。
- 文件被删除后条目仍然保留，直到被淘汰或用户「清空」。

对应代码：`RecentRepository` / `RecentService`（`SystemService.openPath` 里调用 `touch`）。

---

### 4.11 `plugin`

已安装工具插件的状态。只保存安装信息与启用状态，**不保存插件输入 / 结果**。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | 插件 manifest 里的唯一 id |
| `version` | TEXT | NOT NULL | 安装的版本 |
| `enabled` | INTEGER | NOT NULL DEFAULT 1，CHECK IN (0,1) | 是否在工具页 / 全局搜索里启用 |
| `install_path` | TEXT | NOT NULL | `<userData>/plugins/<id>` 的绝对路径 |
| `installed_at` | TEXT | NOT NULL | 安装 / 更新时间（ISO 8601） |

约定：

- 插件文件复制到 userData 下，运行的是副本；原目录可以被删除。
- 卸载会删除安装目录并移除对应记录。
- 工具输入 / 结果只在内存里，不写这张表，也不写其它表。

对应代码：`PluginRepository` / `PluginService`。

---

## 5. 关系图

```text
workspace
 ├─ 1:N ─ mapped_directory   (ON DELETE CASCADE)
 ├─ 1:N ─ todo               (ON DELETE CASCADE, workspace_id 可为 NULL)
 └─ 1:N ─ shortcut           (ON DELETE CASCADE，仅 kind = 'workspace')

rule            独立表；source_path / target_path 只存路径，不外键到 mapped_directory
                 ↑ 1:N（可空）
file_operation  ── rule_id（ON DELETE SET NULL）：历史不随规则删除消失

note            独立表；只有文本与可选链接
recent_file     独立表；按 path 去重的最近打开记录
plugin          独立表；已安装插件的状态
setting          独立 key-value 表，无外键
schema_migration 独立表，由 migration 代码维护
```

删除 Workspace 会级联删除其目录映射与 Todo，**不会触碰真实文件**。
Todo 可以不属于任何 Workspace（收件箱）。

---

## 6. 数据约定

- **时间**：全部用 `new Date().toISOString()` 写入 TEXT，UTC、带毫秒，比较与排序按字符串进行。
- **布尔值**：`setting.value` 存 `'true'` / `'false'` 字符串，读取时显式比较。
- **枚举**：`status` / `priority` 由 CHECK 约束与服务层双重校验；`theme` / `uiScale` 由服务层白名单校验（未知值读回时回退默认）。
- **路径**：存绝对路径，统一由 `node:path` 生成，不手工拼接分隔符（见 AGENTS.md §7）。
- **不存库**：文件本身、目录内容、`FileItem`、`exists` 之类的实时文件系统状态。

---

## 7. 备份与恢复

数据库开启 WAL，运行时文件由三部分组成：

```text
data.db        data.db-wal        data.db-shm
```

### 应用内备份（推荐）

`DatabaseService.backup()` 用 SQLite 的 **`VACUUM INTO`** 生成快照：

```text
<userData>/backups/data-<label>-<yyyyMMdd-HHmmss>.db
```

- 运行中也能安全备份：快照包含全部已提交数据（含尚未 checkpoint 的 WAL 内容），
  不像直接复制 `data.db` 那样可能丢最近的写入。
- 自动保留最近 5 份（`BACKUP_KEEP`），旧的自动删除。
- 入口：设置页「数据与备份 → 立即备份 / 打开备份目录」；
  **结构升级前会自动备份一份**，文件名带 `v<旧>-to-v<新>`。

### 手动复制

不用应用内备份时，先退出应用再复制这三个文件（或至少 `data.db` + `data.db-wal`），
否则可能拿到不一致的状态。设置页「打开数据目录」可以快速定位。

### 恢复（回滚）

```text
1. 退出应用
2. 备份文件覆盖 <userData>/data.db
3. 删除同目录的 data.db-wal 与 data.db-shm
4. 重新启动：会按需重新执行 migration
```

---

## 8. 尚未建表（规划中）

ARCHITECTURE.md §10 提到的后续表，目前**尚未实现**，实现时须新增 migration：

| 表 | 用途 |
| --- | --- |
| `tag` | 标签及 Todo / 文件关联 |

新增这些表时保持同一风格：整数自增主键、`created_at` / `updated_at` TEXT、
枚举用 CHECK、外键显式声明 `ON DELETE` 行为，并为常用查询条件建索引。

（`rule`、文件操作历史、`shortcut`、`note`、`recent_file` 已分别于 v2 ~ v6 落地，见 §4.6 ~ §4.10。）

---

## 9. 测试

`tests/database.test.ts` 覆盖：

- 初始化后创建全部表（`file_operation` / `mapped_directory` / `note` / `recent_file` / `rule` /
  `schema_migration` / `setting` / `shortcut` / `todo` / `workspace`）
- 重复执行 migration 返回 `0`，不会重复应用
- 外键级联：删除 Workspace 会清掉映射与 Todo
- 升级前自动备份：备份文件存在，且里面是升级前的结构（没有 `rule` / `file_operation` 等新表）
- 版本过新保护：数据库版本高于程序支持时抛错，不会继续启动
- 手动备份：备份里能读到已写入的数据，且只保留最近 5 份

其它相关测试：

- `tests/rule-service.test.ts`：扩展名 / 名称匹配（大小写、目录与隐藏文件不动）、
  预览、执行、同名冲突不覆盖、目录不存在、字段校验、只执行启用规则
- `tests/operation-service.test.ts`：记录 / 撤销、原位置被占用时部分失败、目标已不存在
- `tests/watcher-service.test.ts`：目录变化通知、防抖合并、`unwatch` 后不再通知
- `tests/shortcut-service.test.ts`：文件 / 目录 / 工作区置顶、路径 resolve、重复置顶被拒、
  目标消失后标记 `exists: false`、删除工作区时级联清理
- `tests/note-service.test.ts`：标题 / 内容校验、链接规范化（补 https、拒绝非 http 协议）、
  更新与删除、关键字搜索覆盖标题 / 内容 / 链接
- `tests/recent-service.test.ts`：同一路径去重并累加次数、按时间倒序、条数上限、清空
- `tests/ipc-result.test.ts`：文件 IPC 成功后写入操作历史（撤销依赖它）

`tests/helpers.ts` 的 `createTestContext()` 统一使用 `:memory:` 数据库，
文件相关测试使用 `os.tmpdir()` 下的临时目录，不触碰真实用户数据。
