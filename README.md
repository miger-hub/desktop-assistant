# WorkMeta

简单、本地优先的跨平台个人工作台（MVP）。

核心能力：

- **Home**：一页查看常用系统应用、待办、备忘链接与工作日历；日报按完成 / 未完成 / 问题 / 默认分栏，周报汇总工作项并支持显示、复制和导出
- **Workspace**：逻辑分组，把多个真实目录映射到一个工作区
- **Desktop**：整理桌面文件（列表 / 打开 / 单条与批量重命名 / 移动到映射目录 / 回收站）
- **Rules（自动整理）**：配置「按扩展名 / 名称关键字 → 移动到目标目录」的规则，先预览再执行；执行结果可撤销
- **Todo**：待办管理（工作区 / 状态 / 优先级 / 截止日期 / 搜索，点击归属标签跳回对应工作区；添加与搜索区固定在页面顶部）
- **Notes（笔记 / 备忘）**：文件型 Markdown 笔记使用 Milkdown 单页所见即所得编辑，支持目录、文章目录（TOC）、图片附件和工作区标记；
  “备忘”标签保留原有随手文本 / 链接功能。笔记和错误处理见下文「笔记文件」
- **Clipboard（剪贴板历史）**：记录最近复制的文本与文件（默认 10 条，可在设置里改，上限 50），支持再次复制；只在内存里，退出应用即清空
- **快捷入口**：把常用文件、目录、工作区置顶到侧边栏，文件列表与工作区上都有「置顶」按钮
- **全局搜索**：`Ctrl/Cmd + K` 打开搜索（默认是**独立的小窗口**，不显示主界面、失焦自动收起），搜本地已安装的应用（带系统图标，回车直接启动）、文件名、待办、笔记、备忘、工作区、映射目录；
  支持按类型与归属工作区过滤，输入为空时显示「最近打开」；这里只记录从搜索结果打开的文件、目录和备忘，连续输入有防抖（默认 200ms）、
  结果默认展示 20 条（都能在设置里改，超出的点「展开」查看更多）；关掉弹框后默认保留上次的关键字，
  也可以在设置里改成「关闭搜索后清空关键字与结果」
- **撤销**：`Ctrl/Cmd + Z` 撤销最近一次移动 / 重命名 / 整理规则执行（把文件移回原位）
- **系统托盘 / 全局快捷键**（可关闭）：关闭窗口收进托盘，`Ctrl/Cmd + Alt + A` 显示隐藏窗口，`Ctrl/Cmd + Alt + K` 呼出搜索
- **Settings**：主题（system / light / dark / dracula）、界面大小、隐藏文件、删除确认、剪贴板历史条数、全局搜索防抖、搜索结果条数、隐藏时是否收起搜索、关闭搜索后是否清空关键字、搜索是否显示在主界面里、数据备份 / 导出、系统路径

技术栈：Electron + Vue 3 + Vuetify 4 + TypeScript + SQLite（better-sqlite3）+ Vite（electron-vite）+ pnpm。
没有 HTTP 服务、没有独立后端，核心功能完全离线可用。

窗口使用 `frame: false` 无系统边框，标题栏由渲染进程实现（拖动、最小化 / 最大化 / 关闭、双击最大化）。

## 架构约定

```text
Vue 3 UI (Renderer)
      ↓  window.desktop.*
Preload API（contextIsolation + sandbox，不暴露 fs / process / ipcRenderer）
      ↓  IPC（统一 Result 信封，错误带错误码）
Electron Main
  ├── services/    业务层：HomeService / WorkLogService / FileService / WorkspaceService / TodoService / RuleService / ShortcutService / ClipboardService / NoteService / NoteDocumentService / RecentService / OperationService / WatcherService / TrayService / SettingsService / SystemService / DatabaseService
  ├── plugins/     PluginService / PluginRepository / manifest 校验（只管理安装，不执行插件代码）
  ├── repositories/ 只有 SQL 读写：HomeShortcut / WorkLog / Workspace / Mapping / Todo / Rule / Shortcut / Note / Recent / Operation / Setting
  └── database/    连接 + migration + 升级前备份
      ↓
SQLite（userData/data.db） + 本地文件系统
```

- Renderer 不直接访问 Node、fs、sqlite；所有能力通过 `src/shared/ipc.ts` 定义的业务化 API。
- 文件不进入数据库，数据库只存首页应用 / 日报 / Workspace / 目录映射 / Todo / 规则 / 快捷入口 / 备忘 / 搜索最近打开 / 操作历史 / Setting。
- 文件型笔记的正文、目录和图片都直接保存在本地文件系统；SQLite 不保存笔记正文。
- 结构变化只新增 migration（`src/main/database/migrations/`），不修改历史版本；
  升级前自动备份（`VACUUM INTO`），数据库版本高于程序时拒绝启动，详见 [DATABASE.md](DATABASE.md)。
- 文件操作集中在 `FileService`，冲突默认不覆盖，删除默认走系统回收站，跨磁盘移动自动降级为复制 + 删除。
- UI 组件统一用 Vuetify（在 `src/renderer/plugins/vuetify.ts` 显式注册），主题在 `src/renderer/plugins/vuetify.ts` 里集中定义：light / dark 用 Vuetify 官方调色板，外加 Dracula 主题，可选 system / light / dark / dracula。
- 窗口控制、系统对话框、回收站等能力都在主进程，渲染进程只调用业务化 IPC。
- 系统托盘与全局快捷键同样在主进程（`TrayService`），两个开关都在设置页，注册失败只记日志。

## 目录结构

```text
src/
├── main/          主进程：窗口、IPC、services、repositories、database
├── preload/       只暴露 window.desktop 业务 API
├── renderer/      Vue 3 UI（views / components / stores / composables / styles）
└── shared/        主进程与渲染进程共用的类型与 IPC 通道定义
tests/             核心逻辑单测（文件操作、Workspace、Todo、数据库 migration、Settings）
```

## 开发

```bash
pnpm install        # 首次会下载 Electron 运行时
pnpm dev            # 启动开发模式（HMR）
pnpm run typecheck  # 主进程 + 渲染进程类型检查
pnpm test           # 运行单测
pnpm run build      # 类型检查 + 打包到 out/
pnpm start          # 用构建产物启动
```

Windows 打包（安装包 / 绿色版 / 交叉打包）见 [docs/build-windows.md](docs/build-windows.md)：

```bash
pnpm run build:win           # Windows 上生成 NSIS 安装包
pnpm run build:win:portable  # Windows 上生成免安装单文件 exe
pnpm run build:win:cross     # Linux 上（无 wine）生成 win-unpacked 免安装目录
```

其它平台：

```bash
pnpm run build:linux         # AppImage + deb（见 docs/build-linux.md）
pnpm run build:linux:dir     # 只生成 linux-unpacked 免安装目录
pnpm run build:mac           # dmg + zip，x64 与 arm64（见 docs/build-macos.md）
```

### 关于 Node 版本

`better-sqlite3@13` 要求 Node >= 22，而 `pnpm test` 需要加载它。
为了避免额外引入 `electron-rebuild`，测试入口 `scripts/test.mjs` 直接用 **Electron 自带的 Node** 运行 vitest：

```bash
pnpm test           # 用 Electron 的 Node 跑（任何 Node 版本都能用）
pnpm run test:node  # 本机 Node >= 22 时可以直接跑
```

`better-sqlite3@13` 使用 N-API 预编译二进制，Node 与 Electron 通用，因此不需要 rebuild 步骤。

## 数据位置

- 数据库：`<userData>/data.db`（Linux 一般是 `~/.config/desktop-assistant/data.db`；应用更名后会优先沿用已有 `Desktop Assistant` / `desktop-assistant` 旧目录，避免升级丢失数据）
- 笔记：`<userData>/notes/`。每篇笔记是一个 `.md` 文件，工作区标记写在文件 frontmatter 的 `workmetaWorkspaceId`；
  图片复制到该笔记同目录的 `attachments/`，Markdown 中保存相对路径。删除笔记或目录时走系统回收站。
- 备份：`<userData>/backups/`（升级前自动备份 + 设置页手动备份，最多保留 5 份）
- 设置里可以直接打开该目录；数据库不放在项目目录中。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + 1~8` | 切换 Home / Workspace / Desktop / Todo / Notes / Clipboard / Rules / Tools |
| `Ctrl/Cmd + ,` | 打开 Settings（与菜单数字快捷键分开） |
| `Ctrl/Cmd + K` | 打开全局搜索弹框（应用 / 文件 / 目录 / 工作区 / 待办 / 笔记 / 备忘，可按类型与归属过滤；搜到应用回车直接启动） |
| `Ctrl/Cmd + +` / `Ctrl/Cmd + -` / `Ctrl/Cmd + 0` | 放大 / 缩小 / 恢复界面大小 |
| `Ctrl/Cmd + F` | 过滤当前文件列表（只作用于当前目录，Esc 退出） |
| `Ctrl/Cmd + ←↑→↓` | 板块间跳转：工作区列表 / 映射目录 / 文件列表（跳过去之后方向键只作用于该板块，焦点板块有描边） |
| `Ctrl/Cmd + Z` | 撤销最近一次移动 / 重命名 / 整理规则执行（光标在输入框里时保留文本撤销） |
| `Ctrl/Cmd + Alt + A` | 显示 / 隐藏窗口：应用在后台时是全局快捷键，窗口聚焦时也能用（默认值，**可在设置里改成别的组合**） |
| `Ctrl/Cmd + Alt + K` | 呼出搜索：默认只显示独立搜索窗口（不显示主界面），可在设置里改成显示在主界面里（默认值，可在设置里改；全局 + 应用内兜底） |
| `↑` / `↓` | 侧边栏切换页面；工作区列表切换；文件列表与搜索结果移动选择 |
| `Shift + ↑/↓` | 文件列表从锚点扩展选择 |
| `Home` / `End` | 文件列表跳到第一项 / 最后一项 |
| `Ctrl/Cmd + A` | 文件列表全选 |
| `Enter` / `F2` / `Delete` | 打开选中项 / 重命名（多选时为批量重命名）/ 移到回收站 |
| `F5` / `Esc` | 刷新当前目录 / 取消选择 |
| 双击 | 打开文件 / 进入目录；标题栏双击最大化 |
| 拖拽 | 文件拖到目录行或当前目录完成移动（支持从系统拖入）；工作区列表拖拽排序（拖到列表下方空白处即排到最后） |

文件列表的快捷键不需要先点击列表即生效；`Shift` 连选、`Ctrl/Cmd` 点选。
批量重命名采用「统一名称 + 自增序号」模板（可保留扩展名），提交前有结果预览。
设置页内置同一份快捷键映射表。

## MVP 边界（刻意不做）

- 未实现全文搜索 / 文件内容索引
- 批量重命名只支持「统一名称 + 自增序号」，不支持正则或查找替换
- 只撤销移动 / 重命名 / 整理规则执行；删除不进历史（回收站里的文件手动还原，永久删除不可恢复）
- 整理规则只支持「按扩展名 / 名称关键字移动到目录」，不做定时执行、正则替换、标签条件
- 标签（Todo 与文件的轻量标签）尚未实现
- macOS 尚未在真机上验证；打包未做代码签名与公证，首次打开需要手动放行（见 docs/build-macos.md）
- Todo 与文件之间不做自动关联
- 目录监听只覆盖当前打开的目录（非递归），网络盘等不支持 `fs.watch` 的位置退化为手动刷新
- 搜索仍是名称 / 标题级匹配，不做全文索引；「最近打开」只记录从搜索结果打开的文件、目录和备忘
