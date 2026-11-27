/**
 * 主进程与渲染进程共用的数据类型。
 * 这里只放纯数据描述，不引入任何运行时依赖。
 */
import type { Locale } from './i18n'

/** 界面语言：跟随系统或某个受支持的语言 */
export type LanguageSetting = 'system' | Locale

export type FileType = 'file' | 'directory' | 'symlink' | 'other'

/** 文件不进入数据库，只作为运行时对象存在 */
export interface FileItem {
  name: string
  path: string
  type: FileType
  size: number
  modifiedAt: number
  isHidden: boolean
}

/** 系统保存对话框写文本文件 */
export interface SaveTextOptions {
  title?: string
  defaultName: string
  content: string
  filters?: Array<{ name: string; extensions: string[] }>
}

export interface Workspace {
  id: number
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** Workspace 是逻辑概念，不要求对应真实目录 */
export interface MappedDirectory {
  id: number
  workspaceId: number
  name: string
  path: string
  /** 目录当前是否真实存在（文件系统实时状态，不存库） */
  exists: boolean
  createdAt: string
  updatedAt: string
}

export interface WorkspaceDetail extends Workspace {
  directories: MappedDirectory[]
}

export interface WorkspaceInput {
  name: string
  sortOrder?: number
}

export interface WorkspacePatch {
  name?: string
  sortOrder?: number
}

export type TodoStatus = 'todo' | 'doing' | 'done'
export type TodoPriority = 'low' | 'normal' | 'high'

export interface Todo {
  id: number
  workspaceId: number | null
  title: string
  description: string
  status: TodoStatus
  priority: TodoPriority
  /** YYYY-MM-DD */
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

export interface TodoInput {
  title: string
  workspaceId?: number | null
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  dueDate?: string | null
}

export interface TodoPatch {
  title?: string
  workspaceId?: number | null
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  dueDate?: string | null
}

export interface TodoFilter {
  workspaceId?: number | null
  status?: TodoStatus
  keyword?: string
}

/** 'system' 跟随系统在 light / dark 之间切换；dracula 需要显式选择 */
export type ThemeMode = 'light' | 'dark' | 'dracula' | 'system'

/** 界面大小档位（用窗口缩放实现，几档够用） */
export type UiScale = 'small' | 'normal' | 'large' | 'x-large'

export interface AppSettings {
  /** 界面语言 */
  language: LanguageSetting
  theme: ThemeMode
  /** 界面整体大小 */
  uiScale: UiScale
  /** 文件列表是否显示隐藏文件 */
  showHiddenFiles: boolean
  /** 删除前是否弹确认框 */
  confirmDelete: boolean
  /** 系统托盘：常驻托盘图标，关闭窗口时收进托盘 */
  trayEnabled: boolean
  /** 全局快捷键：在应用外显示 / 隐藏窗口、呼出搜索 */
  globalShortcutsEnabled: boolean
  /** 显示 / 隐藏窗口的全局快捷键（Electron accelerator） */
  toggleShortcut: string
  /** 呼出搜索的全局快捷键 */
  searchShortcut: string
  /** 剪贴板历史保留条数 */
  clipboardHistoryLimit: number
  /** 全局搜索防抖：停止输入多久后才真正搜索（毫秒，0 表示不延时） */
  searchDebounceMs: number
  /** 全局搜索默认展示多少条结果，超出的手动展开 */
  searchResultLimit: number
  /** 首页常用链接默认显示多少个 */
  homeLinkLimit: number
  /** 应用隐藏（收进托盘 / 全局快捷键隐藏）时，是否把全局搜索弹框一起收起 */
  closeSearchOnHide: boolean
  /** 关闭搜索弹框后，是否把关键字与结果清空（下次打开是干净的） */
  clearSearchOnClose: boolean
  /**
   * 搜索弹框显示在主界面里（默认 false）。
   * 默认：搜索用独立小窗口，呼出搜索不显示主界面，主界面开着也不会被关掉；
   * 打开后：先把主界面显示出来，搜索弹框显示在主界面里（老行为）。
   */
  searchInMainWindow: boolean
  /** 按扩展名指定打开程序；命中的文件用该程序打开，否则用系统默认程序 */
  openWithRules: OpenWithRule[]
}

/** 文件打开方式：按扩展名指定程序 */
export interface OpenWithRule {
  /** 扩展名，不含点、小写，例如 "md"、"txt"；"*" 表示所有文件 */
  extension: string
  /** 打开程序的可执行文件路径（macOS 也可以指向 .app） */
  program: string
}

/**
 * 剪贴板历史的条数上限。
 * 历史只放在内存里，但条数太多既没意义又占内存，所以给一个 50 条的硬上限。
 */
export const CLIPBOARD_HISTORY = { min: 1, max: 50, default: 10 } as const

/**
 * 全局搜索的防抖延时（毫秒）。
 * 连续输入时等这么久再发搜索，避免每敲一个键就刷新一遍结果列表；
 * 0 表示不延时（按下即搜），上限 1 秒（再久就像卡住了）。
 */
export const SEARCH_DEBOUNCE = { min: 0, max: 1000, default: 200 } as const

/**
 * 全局搜索默认展示的结果条数。
 * 默认 20 条足够扫一眼，再多就靠「展开」；
 * 上限 60 与主进程的单次搜索返回上限（`SystemService.MAX_FILE_RESULTS`）保持一致。
 */
export const SEARCH_RESULT_LIMIT = { min: 5, max: 60, default: 20 } as const

/** 首页常用链接显示数量：最近使用优先，默认 5 个 */
export const HOME_LINK_LIMIT = { min: 1, max: 20, default: 5 } as const

export interface PathInfo {
  home: string
  desktop: string
  documents: string
  downloads: string
  /** 数据库所在目录 */
  userData: string
  database: string
}

/** 数据相关的运行信息：设置页展示版本、数据库路径与备份目录 */
export interface AppInfo {
  appVersion: string
  /** 当前数据库结构版本（等于程序支持的最新 migration 版本） */
  schemaVersion: number
  database: string
  backupDir: string
  /** 全局快捷键的注册情况（wayland / 被占用时需要提示用户） */
  globalShortcuts: GlobalShortcutStatus
}

/**
 * 显示 / 隐藏窗口的结果。
 * `hidden` 为 false 且带 `reason` 时表示这次隐藏被拒绝（隐藏之后窗口会失联），
 * 由渲染进程把原因提示给用户。
 */
export interface WindowToggleResult {
  hidden: boolean
  reason: string | null
}

export interface GlobalShortcutStatus {
  /** 设置里是否开启了全局快捷键 */
  enabled: boolean
  /**
   * 每个全局快捷键的注册结果（关掉开关时为空数组）。
   * 启动时按这个判断有没有冲突 / 当前桌面环境支不支持，用来提示用户。
   */
  entries: GlobalShortcutEntry[]
}

/** 单个全局快捷键的注册结果 */
export interface GlobalShortcutEntry {
  /** Electron accelerator，例如 `CommandOrControl+Alt+A` */
  accelerator: string
  /** 给用户看的按键文案，例如 `Ctrl/Cmd + Alt + A` */
  keys: string
  /** 这个快捷键做什么，例如「显示 / 隐藏窗口」 */
  action: string
  registered: boolean
  /** 注册失败的原因（注册成功时为 null） */
  reason: string | null
}

export type SearchResultType =
  | 'workspace'
  | 'directory'
  | 'todo'
  | 'file'
  | 'note'
  | 'clipboard'
  | 'app'
  | 'tool'

export interface SearchResult {
  type: SearchResultType
  title: string
  subtitle: string
  /** 文件 / 目录的绝对路径；`type` 为 app 时是要启动的应用（.desktop / 快捷方式 / .app） */
  path?: string
  /** 剪贴板结果的条目 id（`type` 为 clipboard 时），回车用它写回系统剪贴板 */
  id?: number
  /** 文件结果所属的映射目录 id（`type` 为 file 时有）；← 跳转时用来选中正确的工作区 / 目录 */
  directoryId?: number | null
  workspaceId?: number | null
  /** 备忘的链接，搜索弹框里可以直接打开 */
  url?: string
  /** 文件型笔记相对笔记根目录的路径 */
  notePath?: string
  /** 已安装应用的图标（data URL，只有 `type` 为 app 时有），渲染进程直接当图片用 */
  iconUrl?: string
  /** 工具结果的 id（`type` 为 tool 时） */
  toolId?: string
}

/**
 * 搜索增强里的过滤条件：
 * - `workspaceId` 为 `'inbox'` 时只看没有归属工作区的条目（桌面文件、收件箱待办等）
 * 类型过滤放在渲染进程做，主进程只负责按工作区收敛结果。
 */
export interface SearchOptions {
  workspaceId?: number | 'inbox'
}

/**
 * 搜索结果的「跳转」目标。
 * 独立搜索窗口不在主界面里，跳转只能交给主进程转给主窗口执行。
 */
export interface SearchNavigation {
  kind: 'workspace' | 'directory' | 'todo' | 'note' | 'desktop' | 'path' | 'tool'
  workspaceId?: number | null
  directoryId?: number | null
  noteId?: number
  /** 文件型笔记相对笔记根目录的路径 */
  notePath?: string
  /** 待办跳转时带的过滤关键字 */
  keyword?: string
  /** `kind` 为 path 时：要进入并高亮的文件 / 目录路径 */
  path?: string
  /** `kind` 为 path 时：目标类型（目录会和文件用不同的聚焦方式） */
  pathKind?: 'file' | 'directory'
  /** `kind` 为 tool 时：要打开的工具 id */
  toolId?: string
}

/** 从搜索结果打开的文件 / 目录 / 备忘 */
export interface RecentEntry {
  path: string
  name: string
  kind: 'file' | 'directory' | 'note'
  openedAt: string
  /** 累计打开次数 */
  count: number
  /** `kind` 为 note 时的备忘 id（备忘没有路径，用 id 定位） */
  id?: number
  /** `kind` 为 note 时，当前备忘里的链接；有链接时与搜索结果一样直接打开浏览器 */
  url?: string
}

/** 快捷入口：把常用文件 / 目录 / 工作区置顶 */
export type ShortcutKind = 'file' | 'directory' | 'workspace'

/**
 * 剪贴板历史条目。
 * 文本与文件（复制文件时系统剪贴板里是 URI 列表）两类，历史只放在主进程内存里，不落库。
 */
export type ClipboardKind = 'text' | 'files'

export interface ClipboardEntry {
  id: number
  kind: ClipboardKind
  /** 文本内容（kind = 'text'），可能是多行 */
  text: string
  /** 文件 / 目录的绝对路径（kind = 'files'） */
  paths: string[]
  /** 第一次记录的时间 */
  createdAt: string
}

export interface Shortcut {
  id: number
  kind: ShortcutKind
  label: string
  /** 文件 / 目录的绝对路径；workspace 类型为 null */
  path: string | null
  workspaceId: number | null
  sortOrder: number
  createdAt: string
  /** 目标当前是否存在（实时状态，不存库） */
  exists: boolean
}

export interface ShortcutInput {
  kind: ShortcutKind
  /** 不传时按路径 / 工作区名自动取名 */
  label?: string
  path?: string
  workspaceId?: number | null
}

/** 首页快捷访问的系统应用 */
export interface HomeShortcut {
  id: number
  label: string
  /** 启动目标：Linux 的 .desktop、Windows 的 .lnk、macOS 的 .app */
  path: string
  sortOrder: number
  createdAt: string
  /** 安装目标当前是否仍然存在 */
  exists: boolean
}

export interface HomeShortcutInput {
  path: string
  label?: string
}

/** 首页「添加应用」列表里的一项 */
export interface InstalledAppSummary {
  path: string
  name: string
  comment: string
  iconUrl: string | null
}

/** 每个自然日一条工作记录；各类别里每个非空行是一条工作项 */
export interface WorkLog {
  /** YYYY-MM-DD */
  date: string
  /** 「默认」栏；沿用旧字段名，升级前的日报内容会保留在这里 */
  content: string
  /** 已完成工作项，每行一条 */
  completed: string
  /** 未完成工作项，每行一条 */
  incomplete: string
  /** 问题工作项，每行一条 */
  issues: string
  updatedAt: string
}

export interface WorkLogDraft {
  content: string
  completed: string
  incomplete: string
  issues: string
}

/** 备忘：一段文本，可选带一个链接 */
export interface Note {
  id: number
  title: string
  content: string
  /** 可选链接，规范化成 http(s) */
  url: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  /** 最后一次从全局搜索跳转打开的时间；从没跳转过为 null（「最近打开」用） */
  lastOpenedAt: string | null
  /** 最后一次从首页 / 备忘页打开链接的时间；用于首页常用链接排序 */
  lastLinkUsedAt: string | null
}

export interface NoteInput {
  title: string
  content?: string
  url?: string
  sortOrder?: number
}

export type NotePatch = Partial<NoteInput>

/** 文件型笔记的目录；path 是相对笔记根目录的 POSIX 路径，根目录用空字符串 */
export interface NoteFolder {
  name: string
  path: string
  children: NoteFolder[]
}

/** 文件型笔记列表项，不包含 Markdown 正文 */
export interface NoteDocumentSummary {
  /** 相对笔记根目录的 POSIX 路径 */
  path: string
  title: string
  /** 所属目录，根目录为空字符串 */
  folderPath: string
  workspaceId: number | null
  excerpt: string
  updatedAt: string
}

export interface NoteDocument extends NoteDocumentSummary {
  content: string
}

export interface NoteDocumentTree {
  folders: NoteFolder[]
  notes: NoteDocumentSummary[]
}

export interface NoteDocumentCreateInput {
  title: string
  /** 新建到哪个目录；不传或空字符串表示根目录 */
  folderPath?: string
  workspaceId?: number | null
  content?: string
}

export interface NoteDocumentPatch {
  title?: string
  workspaceId?: number | null
  content?: string
}

export interface NoteHeading {
  level: number
  text: string
  /** 标题在 Markdown 顶层标题序列中的下标，用来定位编辑器里的 DOM */
  index: number
}

export interface BulkResult {
  succeeded: string[]
  /** 目标已经在原位置，直接跳过（例如把文件"移动"到它所在的目录） */
  skipped: string[]
  failed: Array<{ path: string; message: string }>
  /** 成功条目的「原路径 → 新路径」，主进程用它写入操作历史（渲染进程可忽略） */
  entries?: Array<{ source: string; target: string }>
}

/** 自动整理规则的匹配方式：按扩展名 / 按名称关键字 */
export type RuleMatchType = 'extension' | 'name'

export interface Rule {
  id: number
  name: string
  enabled: boolean
  /** 要整理的目录（桌面 / 映射目录 / 任意目录） */
  sourcePath: string
  matchType: RuleMatchType
  /** 扩展名列表（逗号分隔，可带点）或名称关键字（逗号分隔，任一命中） */
  pattern: string
  /** 命中后移动到该目录 */
  targetPath: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface RuleInput {
  name: string
  enabled?: boolean
  sourcePath: string
  matchType: RuleMatchType
  pattern: string
  targetPath: string
  sortOrder?: number
}

export type RulePatch = Partial<RuleInput>

/** 规则预览里的一条命中项 */
export interface RuleMatch {
  path: string
  name: string
  targetPath: string
  /** 目标目录里已有同名条目，执行时不会被覆盖 */
  conflict: boolean
}

export interface RulePreview {
  ruleId: number
  ruleName: string
  matches: RuleMatch[]
  /** 目录不存在等导致规则无法执行的原因 */
  errors: string[]
}

export interface RuleRunResult extends BulkResult {
  /** 本次执行对应的操作批次（没有实际移动时为 null） */
  batchId: string | null
  /** 本次执行的规则名 */
  ruleNames: string[]
}

export type FileOperationKind = 'move' | 'rename'
export type FileOperationOrigin = 'manual' | 'rule'

export interface FileOperation {
  id: number
  batchId: string
  kind: FileOperationKind
  origin: FileOperationOrigin
  ruleId: number | null
  sourcePath: string
  targetPath: string
  createdAt: string
  undoneAt: string | null
}

/** 操作历史按批次聚合展示 */
export interface OperationBatch {
  batchId: string
  kind: FileOperationKind
  origin: FileOperationOrigin
  ruleId: number | null
  createdAt: string
  /** 批次里的条目总数 */
  count: number
  /** 还没撤销的条目数 */
  pending: number
  /** 前几条「原路径 → 新路径」，用于列表展示 */
  preview: string[]
}

export type ErrorCode =
  | 'NOT_FOUND'
  | 'EXISTS'
  | 'PERMISSION_DENIED'
  | 'INVALID_ARGUMENT'
  | 'INVALID_PATH'
  | 'IO_ERROR'
  | 'DB_ERROR'
  | 'UNKNOWN'

export interface SerializedError {
  code: ErrorCode
  message: string
}

/** IPC 统一返回结构：跨进程抛出的异常会丢失自定义属性，因此用信封传递错误 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: SerializedError }

export interface ListFilesOptions {
  showHidden?: boolean
}

export interface TransferOptions {
  overwrite?: boolean
}

/** 批量重命名的单个条目：只改文件名，留在原目录 */
export interface RenameEntry {
  path: string
  name: string
}

export interface RemoveOptions {
  /** true 直接永久删除，false 走系统回收站 */
  permanent?: boolean
}
