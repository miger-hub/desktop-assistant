# ARCHITECTURE.md

# Desktop Assistant Architecture

## 1. Architecture Decision

第一版采用：

```text
Electron
+
Vue 3
+
Vuetify 4
+
TypeScript
+
SQLite
```

不设置独立后端。

整体结构：

```text
┌──────────────────────────────┐
│          Vue 3 UI            │
│          Renderer            │
├──────────────────────────────┤
│         Preload API          │
│         IPC Bridge           │
├──────────────────────────────┤
│       Electron Main          │
│                              │
│  File Service                │
│  Workspace Service           │
│  Todo Service                │
│  Rule Service（自动整理）      │
│  Operation Service（撤销）     │
│  Watcher Service（目录监听）   │
│  Database Service             │
│  System Service               │
├──────────────────────────────┤
│           SQLite             │
│       Local File System      │
└──────────────────────────────┘
```

---

# 2. 为什么不需要后端

当前产品的核心需求都是本地能力：

```text
文件管理
目录映射
Todo
SQLite
桌面管理
系统通知
快捷操作
```

Electron Main Process 可以直接提供这些能力。

因此没有必要增加：

```text
Vue
 ↓
HTTP
 ↓
Java/Go Server
 ↓
SQLite
```

而是：

```text
Vue
 ↓
IPC
 ↓
Electron Main
 ↓
SQLite / File System
```

这样：

* 架构更简单
* 开发更快
* 不需要启动后端
* 不需要端口
* 不需要 API
* 不需要序列化 HTTP 数据
* 更适合个人桌面工具

---

# 3. Electron Process Model

## Renderer

负责：

```text
UI
交互
状态
页面
拖拽
展示
```

Renderer 不直接操作系统。

---

## Main

负责：

```text
文件系统
SQLite
窗口
系统通知
系统托盘
应用生命周期
```

---

## Preload

负责提供安全的 API：

```ts
window.desktop.files
window.desktop.workspace
window.desktop.todo
window.desktop.rule
window.desktop.shortcut
window.desktop.note
window.desktop.operations
window.desktop.settings
window.desktop.system
window.desktop.window
```

Renderer 只使用这些 API。

---

# 4. 推荐项目结构

```text
desktop-assistant/
│
├── src/
│   │
│   ├── main/
│   │   ├── index.ts
│   │   │
│   │   ├── ipc/
│   │   │   ├── file.ts
│   │   │   ├── workspace.ts
│   │   │   ├── todo.ts
│   │   │   ├── rule.ts
│   │   │   ├── shortcut.ts
│   │   │   ├── note.ts
│   │   │   ├── settings.ts
│   │   │   └── window.ts
│   │   │
│   │   ├── services/
│   │   │   ├── FileService.ts
│   │   │   ├── WorkspaceService.ts
│   │   │   ├── TodoService.ts
│   │   │   ├── RuleService.ts
│   │   │   ├── ShortcutService.ts
│   │   │   ├── NoteService.ts
│   │   │   ├── RecentService.ts
│   │   │   ├── OperationService.ts
│   │   │   ├── WatcherService.ts
│   │   │   ├── TrayService.ts
│   │   │   ├── SettingsService.ts
│   │   │   ├── SystemService.ts
│   │   │   └── DatabaseService.ts
│   │   │
│   │   ├── repositories/
│   │   │   ├── WorkspaceRepository.ts
│   │   │   ├── TodoRepository.ts
│   │   │   ├── RuleRepository.ts
│   │   │   ├── ShortcutRepository.ts
│   │   │   ├── NoteRepository.ts
│   │   │   ├── RecentRepository.ts
│   │   │   ├── OperationRepository.ts
│   │   │   └── MappingRepository.ts
│   │   │
│   │   └── database/
│   │       ├── connection.ts
│   │       ├── migration.ts
│   │       ├── backup.ts
│   │       └── migrations/
│   │
│   ├── preload/
│   │   ├── index.ts
│   │   └── api.ts
│   │
│   └── renderer/
│       ├── main.ts
│       ├── App.vue
│       │
│       ├── plugins/
│       │   └── vuetify.ts
│       │
│       ├── views/
│       │   ├── Workspace.vue
│       │   ├── Desktop.vue
│       │   ├── Todo.vue
│       │   ├── Notes.vue
│       │   ├── Clipboard.vue
│       │   ├── Rules.vue
│       │   └── Settings.vue
│       │
│       ├── components/
│       │   ├── TitleBar.vue
│       │   ├── FileBrowser.vue
│       │   ├── AppDialog.vue
│       │   ├── AppSidebar.vue
│       │   └── ToastStack.vue
│       ├── stores/
│       ├── composables/
│       └── styles/
│
├── tests/
│
├── package.json
├── AGENTS.md
├── GOALS.md
└── ARCHITECTURE.md
```

实际开发过程中可以继续简化，不要求一开始就创建所有目录。

---

# 5. Layering

采用简单的三层：

```text
UI
 ↓
Service
 ↓
Repository / Platform
```

例如 Todo：

```text
Todo.vue
   ↓
TodoService
   ↓
TodoRepository
   ↓
SQLite
```

文件：

```text
FileList.vue
   ↓
FileService
   ↓
Node fs
```

---

# 6. Service

Service 表示业务操作。

例如：

```ts
class WorkspaceService {
  list()
  create()
  update()
  remove()
  addDirectory()
  removeDirectory()
}
```

Service 不应该关心 Vue。

---

# 7. Repository

Repository 只负责数据库。

例如：

```ts
WorkspaceRepository

findAll()
findById()
insert()
update()
delete()
```

Repository 不负责：

```text
UI
文件操作
Electron Window
```

---

# 8. File Service

文件操作统一通过 FileService。

```ts
interface FileService {
  list(path: string): Promise<FileItem[]>
  exists(path: string): Promise<boolean>
  move(source: string, target: string): Promise<void>
  copy(source: string, target: string): Promise<void>
  rename(path: string, name: string): Promise<void>
  delete(path: string): Promise<void>
  mkdir(path: string): Promise<void>
}
```

具体实现使用 Node.js 文件系统 API。

---

# 9. SQLite

SQLite 是本地数据中心。

推荐数据库位置：

```text
Electron app.getPath('userData')
```

例如：

```text
<userData>/data.db
```

不要把数据库放在项目目录。

---

# 10. Database Schema

MVP：

```sql
workspace

id
name
sort_order
created_at
updated_at
```

```sql
mapped_directory

id
workspace_id
name
path
created_at
updated_at
```

```sql
todo

id
workspace_id
title
description
status
priority
due_date
created_at
updated_at
```

后续再增加：

```text
tag
```

已实现（见 [DATABASE.md](DATABASE.md) §4）：

```text
workspace          工作区
mapped_directory   目录映射
todo               待办
rule               自动整理规则（v2，列表按 sort_order 升序，新建的排在最小 sort_order 之前 → 最新在最上面，执行顺序同列表）
file_operation     文件操作历史 / 撤销（v3）
shortcut           快捷入口：常用文件 / 目录 / 工作区置顶（v4）
note               备忘：文本 + 可选链接（v5，列表按 sort_order 升序，新建的排在最小 sort_order 之前 → 最新在最上面）
recent_file        最近打开（v6，供搜索弹框用）
setting            设置
schema_migration   migration 记录
```

---

# 11. File Model

文件不进入数据库。

使用运行时对象：

```ts
interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: number
}
```

数据库只保存目录映射。

---

# 12. Workspace Model

Workspace 是逻辑概念。

例如：

```text
Development
```

可以映射：

```text
~/Workspace/code
~/Projects
~/Documents/Development
```

不要求 Workspace 对应真实目录。

---

# 13. IPC

Renderer 不允许：

```ts
import fs from 'fs'
```

也不允许直接访问：

```ts
sqlite
process
child_process
```

统一通过 IPC。

例如：

```ts
window.desktop.files.list(path)
```

内部：

```text
Renderer
 ↓
Preload
 ↓
IPC
 ↓
Main
 ↓
FileService
```

---

# 14. IPC API

建议 API 保持业务化，而不是暴露底层 Electron API。

推荐：

```ts
window.desktop.workspace.list()

window.desktop.workspace.create(data)

window.desktop.workspace.addDirectory(
  workspaceId,
  path
)

window.desktop.files.list(path)

window.desktop.files.move(source, target)

window.desktop.todo.list(workspaceId)

window.desktop.todo.create(data)

window.desktop.shortcut.add({ kind: 'directory', path })

window.desktop.clipboard.copy(id)

window.desktop.note.create({ title, content, url })
```

主进程还会主动推送两类事件（渲染进程只订阅，不轮询）：

```ts
window.desktop.files.onDirectoryChanged(listener)  // fs.watch 目录变化
window.desktop.system.onOpenSearch(listener)       // 托盘 / 全局快捷键要求呼出搜索
window.desktop.clipboard.onChanged(listener)       // 剪贴板历史有变化
```

不推荐：

```ts
window.desktop.ipc.invoke(...)
```

让 Renderer 自己拼 IPC channel。

---

# 15. State Management

MVP 可以使用：

```text
Pinia
```

只保存 UI 状态。

例如：

```text
currentWorkspace
selectedFile
sidebarCollapsed
searchKeyword
```

数据库数据仍然通过 Service API 获取。

不要让 Pinia 成为第二个数据库。

---

# 16. File Watching

已实现最小可用的目录监听（`src/main/services/WatcherService.ts`）：

```text
渲染进程打开目录
 ↓
files.watch(path)   → 主进程 fs.watch({ persistent: false })
 ↓
变化事件防抖 300ms
 ↓
webContents.send('file:changed', { path })
 ↓
当前目录的 FileBrowser 重新读取（保留仍然存在的选中项）
```

- 只监听**一个**目录（渲染进程当前打开的目录）：切换目录时替换监听，
  组件卸载时 `files.unwatch()`，不会累积监听句柄。
- `fs.watch` 不可用（网络盘 / 特殊挂载点）或目录被删除时返回 `false` / 自动停止，
  UI 退化成手动刷新（`F5` / 刷新按钮），不影响浏览。
- 撤销、整理规则执行后除了目录事件，还会通过 `ui.requestRefresh()` 主动触发刷新，
  不依赖文件监听是否可用。

不要为了 MVP 提前引入复杂文件索引系统。

---

# 17. Search

MVP 使用简单搜索。

第一阶段：

```text
文件名搜索
Todo 标题搜索
Workspace 名称搜索
备忘标题与内容搜索
已安装应用搜索
```

搜索结果按类型（应用 / 文件 / 目录 / 工作区 / 待办 / 备忘）与归属工作区过滤，
过滤在渲染进程本地完成，主进程只返回候选结果；
输入框为空时展示「最近打开」（`recent_file`，最多 15 条，可一键清空）。
文件打开由 `SystemService.openPath` 记一笔最近记录。

### 已安装应用（`AppService`）

按平台扫描「用户能启动的应用」，结果缓存 5 分钟（装了新应用不用重启，最迟 5 分钟后可见），
应用列表在 `bootstrap()` 里预热一次，第一次搜索不用等 IO：

| 平台 | 来源 | 启动方式 |
| --- | --- | --- |
| Linux | `$XDG_DATA_HOME` + `$XDG_DATA_DIRS` 下的 `applications/*.desktop`（覆盖系统包、Flatpak） | 拆 `Exec=`（去掉 `%U` 这类占位符）后 `spawn` 分离子进程 |
| Windows | 开始菜单里的 `.lnk`（ProgramData + 用户） | `shell.openPath()` |
| macOS | `/Applications`、`/System/Applications`、`~/Applications` 下的 `.app` | `shell.openPath()` |

- 只收 `Type=Application`、`NoDisplay`/`Hidden` 不为 true、`Exec` 能解析出命令的条目；
  同名 `.desktop` 以用户目录优先（用户改过的不会被系统里的覆盖）。
- 名字取本地化的 `Name[<locale>]`（`app.getLocale()`），其余语言的 `Name[...]` 一并当关键字，
  所以中文系统里搜「演示」和英文名都能命中；命令名（如 `clash-verge`）也是关键字。
- 排序在 `rankApps()` 里做：完全相同 > 名字前缀 > 名字包含 > 关键字命中，同级短名优先，
  一次最多返回 `MAX_APP_RESULTS`（12）条。
- **图标**：Linux 先按 freedesktop 约定解析 `Icon=`（`<dataDir>/icons/<theme>/<size>/apps/`
  再退到 `pixmaps`），PNG 用 `nativeImage` 缩到 32px，SVG 直接内联；macOS 直接
  `app.getFileIcon(.app)`。统一转成 **data URL** 交给渲染进程
  ——渲染进程有 CSP（`img-src 'self' data:`），本地文件路径加载不进来。
- **Windows 的图标顺序**（`readWindowsIcon()`）：只对 `.lnk` 取图标拿到的是「快捷方式」自己
  那个带小箭头的图标，所以顺序是 ① 快捷方式自带的 `icon` 文件（`.ico` 能直接读）→
  ② `shell.readShortcutLink()` 的目标程序（`.exe` 自己的图标，没有箭头）→
  ③ 兜底才用 `.lnk` 自己的图标。开始菜单里的 `.lnk` 都是 Win32 程序的快捷方式（UWP 不在磁盘上），
  所以优先目标程序不会认错应用。
- 拿不到图标（或 data URL 加载失败）时，渲染进程退回内置的 `mdi-application-outline`
  （`<img>` 的 `error` 事件记录到 `brokenIcons`，换回 `v-icon`，行高与文字位置不变）。
- **行的排版**：应用图标用 `<v-icon :style="background-image">` 承载，而不是直接放 `<img>`：
  Vuetify 只给 `.v-icon` 加 prepend 的尺寸与左右边距，裸 `<img>` 会让标题比其它行左移
  （实测 332.7px vs 363.3px）。图标铺满 21.6px 的方框，标题就与其它行对齐。
  另外应用的注释是说明文字而不是路径，副标题不加 `.mono`（路径 / 命令仍用等宽）。
- 回车打开：没按方向键时直接打开第一条（`GlobalSearchDialog.activate()`），
  应用字段是 `path`，走 `app:open-application` → `AppService.open()`。

关闭弹框时要不要清空关键字由 `setting.clearSearchOnClose` 决定（默认 false，保留上次关键字方便接着找）：
`GlobalSearchDialog.close()` 里命中开关就调 `resetSearch()`（清关键字、结果、高亮，`requestSeq` 自增，
路上返回的旧请求不再写回结果）；`closeSearchOnHide` 触发的收起走的是同一个 `close()`。

### 搜索窗口（与主界面解耦）

搜索不再依附主界面：默认走**独立搜索窗口**（`src/main/searchWindow.ts`），呼出搜索不显示主界面，
主界面开着也不会被关掉、收起来也不会被叫出来；`setting.searchInMainWindow`（默认 false）打开后
才回到「先显示主界面，弹框显示在主界面里」的老路径。两条路都用同一个
`GlobalSearchDialog.vue`，所以行为一致。

- 同一个渲染进程产物跑在两个窗口里：主界面从 `index.html` 进入，搜索窗口加载 `index.html#search`；
  `App.vue` 按 `location.hash === '#search'` 判断，搜索模式只渲染搜索弹框（并给 `<body>` 加
  `search-window` 类，去掉为浮层写的留白 / 高度上限 / 遮罩变暗）。
- 窗口 `show: false / frame: false / skipTaskbar / alwaysOnTop / resizable: false`，尺寸 800×500
  （宽度按「界面放大到最大档 125% 后过滤行还放得下」留的余量）；**失焦自动 hide**、
  `close` 事件在没退出应用时改成 hide，窗口只创建一次（启动 1.5s 后预热），所以后续呼出是瞬间的。
- 弹框在窗口里**铺满**：`body.search-window` 下盖掉 Vuetify 给 `.v-dialog > .v-overlay__content`
  留的 24px 边距与 `width/max-width: calc(100% - 48px)`、卡片圆角、遮罩变暗；
  chip 行 `overflow-x: auto`，窗口再窄也不会把「归属」筛选挤到下一行。
- **高度按内容自适应**：卡片不再固定 `100vh`（`--v-card-height: auto`），结果区最多 360px
  超出内部滚动（结果区 `flex: 0 0 auto`，不参与"窗口变高 → 卡片再变"的循环）；
  弹框高度用 `ResizeObserver`（60ms 防抖）**加上内容变化主动上报**量出来后走
  `system.resizeSearch(cssHeight)`，主进程 `SearchWindow.resize()` 把 CSS px × 当前 `getZoomFactor()`
  换成 DIP，只改高度、顶边不动（差 2px 以内不动，避免抖动）。浮层**不能**按窗口高度
  `max-height: 100%` 截断，否则卡片永远长不大、窗口一直很矮。
  量高度必须用 `offsetHeight`（布局高度）：弹框有"放大出现"的过渡，
  `getBoundingClientRect()` 会带上缩放而偏小，而缩放变化不触发 `ResizeObserver`，
  窗口会停在偏矮的高度、卡片下沿被切掉。
- 搜索窗口里的卡片给 8px 圆角：`outline` 会跟随 `border-radius`，
  描边沿圆角走，不会被窗口 / 合成器的四角遮罩切掉一截。
- 搜索窗口是**透明窗口**（`transparent: true`，不设不透明 `backgroundColor`），
  卡片圆角以外完全透明：Windows 的 DWM 不会给无边框窗口加圆角（除非走原生 API），
  所以"窗口圆角"只能靠透明实现。渲染进程里 `html / body / .v-application` 的铺底都设成
  `transparent`，只让卡片自己画背景；实测四角像素 alpha ≈ 0、卡片区域 alpha = 1。
- 卡片描边在窗口模式下给宽度留 **1px 余量**（`width: calc(100% - 1px)`）：
  卡片右边正好压在窗口边缘时，分数像素缩放（如 1.2）会让右侧那 1px 描边画不出来。
- 搜索窗口没有自己的设置界面：`settings:changed` 事件广播给所有窗口，搜索窗口收到后重新读设置
  （主题、界面大小、搜索防抖 / 条数、关闭后是否清空都跟着主界面走）。
- **「关闭」有两种**：Esc / 打开结果走弹框的 `close()`，失焦被主进程收起走窗口的 `blur`
  （`GlobalSearchDialog.onWindowBlur()`），两种都要按 `setting.clearSearchOnClose` 决定是否清空，
  否则"关了还留着上次的搜索结果"。
- **每次呼出都要刷新数据并重量高度**：窗口是常驻复用的，"最近打开"只在第一次打开时取过，
  高度也可能停在上一轮的矮值上（例如上次搜不到内容）——所以搜索窗口里额外订阅
  `app:open-search`（`unsubscribeSummon`），每次呼出重新 `loadRecents()` 并 `reportSearchWindowHeight()`；
  隐藏期间算出的高度存在 `SearchWindow.pendingHeight`，下次 `show()` 时补上，
  避免"算高度时窗口已经收起"导致这次调整被丢掉。
- **位置**：创建时请求「水平居中、约工作区高度 10% 处」（`SearchWindow.topCenterPosition()`）。
  Wayland 协议不允许客户端指定窗口位置（合成器决定，请求会被忽略），所以那里靠**拖动**：
  卡片是 `-webkit-app-region: drag`，输入框 / 按钮 / chip / 列表行 `no-drag`；
  拖动后本会话保持（按内容调高度时只改高度、不动 x/y）。
- 「显示 / 隐藏主窗口」（托盘 / 全局快捷键）判定里，**搜索窗口开着也算主界面在前台**：
  这种时候切换是把主界面和搜索窗口一起收起来，不会出现"按了没反应 / 关不掉"。
- 搜索窗口不在主界面里，所以「工作区 / 目录 / 待办 / 备忘」这类结果不能自己跳：
  `system.navigate(target)` → `index.ts` 的 `navigateMainWindow()` 显示主窗口并把
  `app:navigate-to` 事件发给主窗口的渲染进程，由 `App.vue` 的 `applySearchNavigation()` 执行；
  文件与已安装应用直接由搜索窗口打开（`files:reveal` / `app:open-application`）。
- 主窗口引用改为创建时记住（`index.ts` 的 `createMain()` / `mainWindow()`）：
  `BrowserWindow.getAllWindows()[0]` 可能拿到搜索窗口，主窗口的显示 / 隐藏都会打偏。
  同理 `SystemService.activeWindow()` 也固定用主窗口（标题栏动作、文件对话框、目录变化通知）。
- 界面大小（`window:set-zoom`）改成对所有窗口生效，搜索窗口也跟着设置缩放。

连续输入有**可配置的防抖**（`setting.searchDebounceMs`，默认 200ms、0 表示按下即搜，
上限 1 秒，设置页「全局搜索防抖」）：停止输入后才发搜索，避免每敲一个键就刷新一遍结果；
等待期间按「搜索中」处理（显示进度条、保留上一次结果），不会闪一下「没有匹配」。
返回时用请求序号比对，只认最后一次的结果，旧请求不会盖掉新结果。

搜索弹框（`GlobalSearchDialog.vue`）贴顶部（距顶 64px），高度分两种情况：

- **有内容时固定高度** `--v-card-height: 460px`（`max-height: calc(100vh - 128px)`，小窗口收紧），
  结果区 `overflow-y: auto` —— 内容多少不应该让窗口忽大忽小，视线也不用跟着跳。
- **没有内容时按内容自适应**（不设置上面的自定义属性，并把 `max-height` 收到 320px）：
  初始只有一行提示、或者搜不到结果时，弹框就是一个矮框，不会一上来就顶着一个 460px 的空盒子；
  就算「最近打开」条目不少，初始高度也封在 320px 以内，多出来的在结果区里滚动。

Vuetify 给对话框卡片的是 `flex: 1 1 var(--v-card-height, 100%)`，
`flex-basis` 会盖掉 `height`，所以固定高度只能写在这个自定义属性上。

结果条数由 `setting.searchResultLimit` 决定（默认 20，上限 60 与
`SystemService.MAX_FILE_RESULTS` 对齐）：默认只渲染这么多行，多出来的显示「展开剩余 N 条」，
展开后仍然是固定高度、内部滚动；换关键字或换过滤条件会回到收起状态。
键盘上下键在「看得见」的行 + 最后那行「展开 / 收起」之间移动（这一行也是 `v-list-item`，
回车即展开 / 收起），移动时 `scrollIntoView({ block: 'nearest' })` 把选中行滚进可视区域。
每次重新打开弹框都会清空高亮、回到收起状态（关键字保留，方便接着找）。
带链接的备忘命中时，回车直接交给系统浏览器打开，和行尾的「打开链接」按钮同一个动作。

弹框状态活在 `GlobalSearchDialog.vue` 的 setup 里（组件一直挂载，只有 `v-dialog` 的内容会卸载），
所以「打开时重置」这件事必须显式写在 `ui.state.globalSearch` 的 watcher 里。

托盘与全局快捷键（`TrayService`）是同一层的系统集成：托盘菜单、`Ctrl/Cmd + Alt + A`
显示 / 隐藏窗口、`Ctrl/Cmd + Alt + K` 呼出搜索。注册失败（如 Wayland、被占用）只记日志，
两个开关都能在设置里关掉。

不做：

```text
全文搜索
文件内容索引
ES
SQLite FTS
```

当实际数据量证明普通搜索不够，再升级。

---

# 18. File Operations

文件操作必须处理：

```text
文件不存在
目标已存在
权限不足
目标目录不存在
跨文件系统
路径非法
```

移动前可以检查：

```text
source exists
target exists
```

对于目标冲突，提供：

```text
覆盖
重命名
取消
```

默认不要静默覆盖。

---

# 19. Security

Electron 开发必须：

```text
contextIsolation: true
nodeIntegration: false
```

Renderer 不直接拥有 Node.js 权限。

Preload 只暴露必要 API。

不要把整个：

```text
ipcRenderer
fs
process
```

暴露给 Renderer。

---

# 20. Cross-platform

路径统一使用：

```ts
path.join()
path.resolve()
```

不要手工拼接：

```ts
'/'
'\\'
```

系统目录通过 Electron：

```ts
app.getPath()
```

获取。

例如：

```text
desktop
home
documents
downloads
userData
```

---

# 21. Future Evolution

如果未来出现以下需求，再考虑增加后端：

```text
多个设备同步
多人协作
远程访问
手机控制
云端 AI
账号系统
在线数据
```

演进路线：

```text
Phase 1

Electron
├── Vue
├── SQLite
└── File System


Phase 2

Electron
├── Vue
├── SQLite
└── Local Services


Phase 3

Electron
        ↓
     API Server
        ↓
Cloud / Sync / AI
```

不要为了 Phase 3 提前实现 Phase 3。

---

# 22. Architecture Principle

当前项目最重要的架构原则：

> **能在 Electron 本地解决的问题，不引入独立后端。**

第一版的目标不是建立一个“漂亮的架构”，而是尽快得到一个真正每天能使用的桌面工具。

当真实使用暴露出架构问题，再针对问题演进。

---

# 23. UI Layer（Vuetify）

组件库使用 **Vuetify 4**，在 `src/renderer/plugins/vuetify.ts` 显式注册用到的组件。

约定：

- Vuetify 4 不会自动注册组件，新增组件必须同时加进 `plugins/vuetify.ts`（只注册用到的，避免整包进产物）。
- 颜色统一用 Vuetify 主题变量（`rgb(var(--v-theme-*))`），不再维护第二套配色；`src/renderer/styles/main.css` 只保留应用自己的布局与少量样式。
- 主题由 Vuetify 主题系统管理（`defaultTheme: 'system'`），设置页切换主题时调用 `vuetify.theme.change(mode)`。
- 图标使用 MDI（`@mdi/font`），不额外引入图标组件库。
- 应用级布局（`.app-body` / `.view` / 文件列表）仍由项目自己控制，避免被 Vuetify 布局系统绑死。

---

# 24. Window Chrome（无系统边框）

窗口使用 `frame: false`，标题栏由渲染进程实现：

```text
BrowserWindow({ frame: false })
        ↓
Renderer: components/TitleBar.vue（-webkit-app-region: drag）
        ↓  window.desktop.window.*
Main: SystemService.minimizeWindow() / toggleMaximizeWindow() / closeWindow() / isWindowMaximized()
        ↓
IPC: window:minimize / window:toggle-maximize / window:close / window:is-maximized
```

- 窗口控制属于系统能力，和打开文件、回收站一样留在主进程（`SystemService`）。
- 渲染进程只拿到业务化的 `window.desktop.window` API，不接触 `BrowserWindow`。

---

# 25. 系统托盘与全局快捷键

```text
设置页开关（setting.trayEnabled / globalShortcutsEnabled）
        ↓ window.desktop.settings.update()
ipc/settings.ts → context.shell.apply(settings)
        ↓
Main: TrayService（Tray + globalShortcut）
        ↓  托盘菜单 / Ctrl(Cmd) + Alt + A / + K
窗口显示隐藏、IPC.app:open-search
        ↓
Renderer: window.desktop.system.onOpenSearch() → 打开搜索弹框
```

- 托盘与全局快捷键都是**可关闭**的系统集成：注册失败（Wayland、被别的程序占用、无托盘环境）
  只在控制台留 warning，不影响应用主流程。
- Wayland 下 Chromium 默认的 X11 grab 收不到按键，启动时会开启
  `--enable-features=GlobalShortcutsPortal`，让 `globalShortcut` 走 xdg-desktop-portal。
- **启动时逐个检查全局快捷键**：`TrayService.shortcutStatus` 里每个快捷键带 `registered` 与失败原因，
  通过 `system.info().globalShortcuts` 给渲染进程。有注册不上的（被别的程序占用、桌面环境不支持）时，
  `App.vue` 启动弹出一次说明并引导用户自行配置（改掉占用按键的程序的快捷键，或关掉这个开关）；
  用户清掉冲突后可以在设置页点「重新检测」（`system.recheckShortcuts()` → `app:recheck-shortcuts`）重注册，不用重启。
- 同一次按键在 macOS / Wayland（portal 不抢按键）下会被全局快捷键与应用内兜底各处理一次，
  一收一放等于没变（表现为「按了没反应」），所以 `index.ts` 里对 250ms 内的重复切换只认第一次。
- 渲染进程同时绑定了同样的 `Ctrl/Cmd + Alt + A / K`（`window:toggle`）作为应用内兜底，
  因此即使桌面环境不支持全局快捷键，窗口聚焦时这两个键仍然有效。
- 显示与隐藏都收敛到 `index.ts` 的 `showMainWindow` / `toggleMainWindow`：托盘点击、托盘菜单、
  全局快捷键、应用内兜底（`window:toggle`）、`app.on('activate')` 走的是同一套逻辑。
  被隐藏或最小化的窗口只在 `show()` 之后不一定回到前台，所以显示路径固定为
  「恢复最小化 → 显示 → 置顶 → 聚焦」；只有窗口**确实显示且在前台**时，切换才会隐藏它。
- 托盘图标是内嵌的 base64 PNG（`services/trayIcon.ts`），打包时不需要额外的资源目录。
- **快捷键可配置**：`setting.toggleShortcut` / `searchShortcut`（Electron accelerator 字符串），
  默认 `CommandOrControl+Alt+A` / `+Alt+K`。`TrayService.apply(settings)` 发现 accelerator 变了就重新注册；
  `shared/accelerator.ts` 负责校验（至少一个修饰键 + 一个键、两个快捷键不能相同）与展示文案，
  渲染进程用 `event.code` 把按键拼成同样的 accelerator 做应用内兜底，所以兜底键也跟着配置走。
- 托盘菜单还有「设置…」（`openSettings` → `app:open-settings` → `App.vue` 切到设置页），
  和「打开全局搜索」一样是「先显示窗口，再让渲染进程切页面」。
- **隐藏前要确保能唤回**：窗口聚焦时的应用内兜底只在窗口可见时收得到按键，隐藏之后就再也
  收不到，所以 `index.ts` 的 `applyToggleWindow()` 在隐藏前会问 `TrayService.canRestoreWindow()`
  （托盘图标可用，或至少一个全局快捷键 `registered`），两者都没有时直接拒绝隐藏，通过
  `WindowToggleResult.reason` 让渲染进程弹提示；渲染进程发起的隐藏还会用一次系统通知说明
  唤回方式（每次运行只提示一次）。`window:toggle` 返回 `{ hidden, reason }`。
  同一次物理按键可能同时被全局快捷键与应用内兜底触发，`toggleMainWindowByShortcut()` 用
  `TOGGLE_DEBOUNCE_MS`（120ms）去重；托盘菜单点击走 `toggleMainWindow()`，永远是立即切换。
- 开启托盘**且托盘创建成功**时，`BrowserWindow` 的 `close` 事件在 `window.ts` 里变成 `hide()`；
  真正退出走托盘菜单「退出」或 `Cmd + Q`（`before-quit` 里会先撤销全局快捷键与托盘）。
  托盘不可用的环境（没有托盘支持、创建失败）会退回正常关闭，避免窗口藏起来找不回来。
- 主进程不直接操作渲染进程状态：呼出搜索是「先显示窗口 → 再发 `app:open-search` 事件」，
  由 `App.vue` 订阅后调用 `ui.openGlobalSearch()`。
- 标题栏按钮使用 `-webkit-app-region: no-drag`，其余区域可拖动窗口；双击标题栏切换最大化。

---

# 26. 剪贴板历史

```text
Main: ClipboardService + SystemClipboardSource（setInterval 1s 轮询系统剪贴板）
        ↓ 历史变化 → context.clipboard 的 onChange → IPC.eventClipboardChanged
Renderer: stores/clipboard.ts 订阅 → views/Clipboard.vue 重新拉 clipboard:list
        ↓ 再次复制
Main: ClipboardService.copy → SystemClipboardSource.write（写回系统剪贴板）
```

- 系统剪贴板没有「内容变化」事件，只能轮询（1 秒一次，读文本很便宜）。
- 记录两类内容：纯文本，以及复制文件 / 目录时的路径列表（`text/uri-list`、GNOME 的
  `x-special/gnome-copied-files`、Windows 的 `FileNameW`）。图片、HTML 等格式不记录。
- 历史只放在主进程内存里（`ClipboardService.entries`），**不写 SQLite**：剪贴板里经常是密码、
  令牌一类的敏感文本，退出应用即清空比长期留在数据库里更稳妥。
- 条数默认 10、上限 50（`CLIPBOARD_HISTORY`）。设置里改小后会立刻裁剪，并通过
  `clipboard:changed` 让页面刷新。
- 再次复制会写回系统剪贴板（文件同时写 `text/uri-list` 与 `text/plain`），并把条目提到最前，
  所以下一轮轮询不会把它当成新内容重复记录。
- 隐私与体积兜底：带 `password` / `concealed` / `secret` 标记的剪贴板内容、
  超过 100 KB 的文本都不记录；用户删掉或清空的那一份内容不会被轮询重新加回来。
- Electron 边界：`SystemClipboardSource` 是唯一接触 `clipboard` / `ClipboardItem` 的地方，
  `ClipboardService` 只依赖 `ClipboardSource` 接口，因此历史逻辑可以脱离 Electron 单测
  （`tests/clipboard-service.test.ts`）。
