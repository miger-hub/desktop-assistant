import type {
  AppInfo,
  AppSettings,
  BulkResult,
  ClipboardEntry,
  FileItem,
  GlobalShortcutStatus,
  ListFilesOptions,
  MappedDirectory,
  Note,
  NoteDocument,
  NoteDocumentCreateInput,
  NoteDocumentPatch,
  NoteDocumentTree,
  NoteInput,
  NotePatch,
  HomeShortcut,
  HomeShortcutInput,
  InstalledAppSummary,
  OperationBatch,
  PathInfo,
  RecentEntry,
  RemoveOptions,
  RenameEntry,
  Rule,
  RuleInput,
  RulePatch,
  RulePreview,
  RuleRunResult,
  SaveTextOptions,
  SearchOptions,
  SearchResult,
  SearchNavigation,
  Shortcut,
  ShortcutInput,
  Todo,
  TodoFilter,
  TodoInput,
  TodoPatch,
  TransferOptions,
  WorkLog,
  WorkLogDraft,
  WindowToggleResult,
  WorkspaceDetail,
  WorkspaceInput,
  WorkspacePatch
} from './types'
import type { ToolDescriptor } from './tools/types'

/** IPC 通道名集中管理，避免字符串散落在各处 */
export const IPC = {
  appPaths: 'app:paths',
  appOpenDataDir: 'app:open-data-dir',
  appOpenUrl: 'app:open-url',
  /** 打开备忘里的链接，同时把这条备忘记为「刚从搜索打开」 */
  appOpenNoteUrl: 'app:open-note-url',
  appSearch: 'app:search',
  appRecent: 'app:recent',
  appClearRecent: 'app:clear-recent',
  /** 打开系统里已安装的应用（搜索弹框里回车） */
  appOpenApplication: 'app:open-application',
  /** 首页添加常用应用时的已安装应用列表 */
  appListApplications: 'app:list-applications',
  /** 呼出全局搜索（主界面里的 Ctrl/Cmd + Alt + K 兜底走这里） */
  appShowSearch: 'app:show-search',
  /** 搜索窗口点结果：显示主界面并跳过去 */
  appNavigate: 'app:navigate',
  /** 收起独立搜索窗口 */
  appHideSearch: 'app:hide-search',
  /** 独立搜索窗口按内容调整高度 */
  appResizeSearch: 'app:resize-search',
  /** 主进程 → 主窗口：执行搜索结果对应的跳转 */
  eventNavigate: 'app:navigate-to',
  /** 主进程 → 所有窗口：设置变了（独立搜索窗口要跟着换主题 / 缩放） */
  eventSettingsChanged: 'settings:changed',
  appInfo: 'app:info',
  appRecheckShortcuts: 'app:recheck-shortcuts',
  appBackupDatabase: 'app:backup-database',
  appOpenBackupDir: 'app:open-backup-dir',
  appExportTodos: 'app:export-todos',
  /** 主进程推送：托盘 / 全局快捷键要求打开搜索 */
  eventOpenSearch: 'app:open-search',
  /** 主进程推送：托盘菜单要求跳到设置页 */
  eventOpenSettings: 'app:open-settings',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowToggle: 'window:toggle',
  windowSetZoom: 'window:set-zoom',
  windowZoomBy: 'window:zoom-by',
  /** 主进程推送：窗口被隐藏（收进托盘 / 全局快捷键隐藏） */
  eventWindowHidden: 'window:hidden',

  fileList: 'file:list',
  fileStat: 'file:stat',
  fileExists: 'file:exists',
  fileMove: 'file:move',
  fileCopy: 'file:copy',
  fileRename: 'file:rename',
  fileRenameMany: 'file:rename-many',
  fileRemove: 'file:remove',
  fileCreateDirectory: 'file:create-directory',
  fileMoveInto: 'file:move-into',
  fileParent: 'file:parent',
  fileSplitPath: 'file:split-path',
  fileOpen: 'file:open',
  fileSaveText: 'file:save-text',
  fileReveal: 'file:reveal',
  filePickDirectory: 'file:pick-directory',
  filePickFiles: 'file:pick-files',
  fileWatch: 'file:watch',
  fileUnwatch: 'file:unwatch',
  /** 主进程推送：当前监听的目录发生变化 */
  eventFileChanged: 'file:changed',

  workspaceList: 'workspace:list',
  workspaceCreate: 'workspace:create',
  workspaceUpdate: 'workspace:update',
  workspaceRemove: 'workspace:remove',
  workspaceReorder: 'workspace:reorder',
  workspaceAddDirectory: 'workspace:add-directory',
  workspaceRemoveDirectory: 'workspace:remove-directory',

  todoList: 'todo:list',
  todoCreate: 'todo:create',
  todoUpdate: 'todo:update',
  todoRemove: 'todo:remove',

  ruleList: 'rule:list',
  ruleCreate: 'rule:create',
  ruleUpdate: 'rule:update',
  ruleRemove: 'rule:remove',
  rulePreview: 'rule:preview',
  ruleApply: 'rule:apply',

  shortcutList: 'shortcut:list',
  shortcutAdd: 'shortcut:add',
  shortcutRemove: 'shortcut:remove',

  homeShortcutList: 'home-shortcut:list',
  homeShortcutAdd: 'home-shortcut:add',
  homeShortcutRemove: 'home-shortcut:remove',

  workLogList: 'work-log:list',
  workLogSave: 'work-log:save',
  workLogExportWeek: 'work-log:export-week',
  workLogExportWeekText: 'work-log:export-week-text',
  workLogCopyWeekText: 'work-log:copy-week-text',

  clipboardList: 'clipboard:list',
  clipboardReadText: 'clipboard:read-text',
  clipboardCopy: 'clipboard:copy',
  clipboardRemove: 'clipboard:remove',
  clipboardClear: 'clipboard:clear',
  /** 主进程推送：剪贴板历史有变化 */
  eventClipboardChanged: 'clipboard:changed',

  noteList: 'note:list',
  noteCreate: 'note:create',
  noteUpdate: 'note:update',
  noteRemove: 'note:remove',
  noteMarkLinkUsed: 'note:mark-link-used',
  noteDocumentTree: 'note-document:tree',
  noteDocumentRead: 'note-document:read',
  noteDocumentCreate: 'note-document:create',
  noteDocumentSave: 'note-document:save',
  noteDocumentRemove: 'note-document:remove',
  noteDocumentCreateFolder: 'note-document:create-folder',
  noteDocumentRenameFolder: 'note-document:rename-folder',
  noteDocumentRemoveFolder: 'note-document:remove-folder',
  noteDocumentUploadAsset: 'note-document:upload-asset',
  noteDocumentReveal: 'note-document:reveal',
  /** 主进程推送：全局搜索打开备忘链接后，首页常用链接需要刷新排序 */
  eventNoteLinkUsed: 'note:link-used',

  pluginList: 'plugin:list',
  pluginInstallFolder: 'plugin:install-folder',
  pluginInstallZip: 'plugin:install-zip',
  pluginSetEnabled: 'plugin:set-enabled',
  pluginUninstall: 'plugin:uninstall',
  pluginEntrySource: 'plugin:entry-source',
  /** 主进程推送：插件安装 / 卸载 / 启用状态变化 */
  eventPluginChanged: 'plugin:changed',

  operationList: 'operation:list',
  operationUndoLast: 'operation:undo-last',
  operationUndo: 'operation:undo',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update'
} as const

/** 暴露给渲染进程的 API（window.desktop） */
export interface DesktopApi {
  files: {
    list(path: string, options?: ListFilesOptions): Promise<FileItem[]>
    stat(path: string): Promise<FileItem | null>
    exists(path: string): Promise<boolean>
    move(source: string, target: string, options?: TransferOptions): Promise<FileItem>
    copy(source: string, target: string, options?: TransferOptions): Promise<FileItem>
    rename(path: string, name: string, options?: TransferOptions): Promise<FileItem>
    /** 批量重命名：只改文件名，留在原目录 */
    renameMany(entries: RenameEntry[], options?: TransferOptions): Promise<BulkResult>
    remove(paths: string[], options?: RemoveOptions): Promise<BulkResult>
    /** 在 parentPath 下新建目录，路径拼接留在主进程 */
    createDirectory(parentPath: string, name: string): Promise<FileItem>
    /** 批量移动进某个目录，目标名沿用原文件名 */
    moveInto(paths: string[], targetDirectory: string, options?: TransferOptions): Promise<BulkResult>
    parent(path: string): Promise<string>
    splitPath(root: string, target: string): Promise<Array<{ label: string; path: string }>>
    /** 打开文件 / 目录；只有全局搜索发起时才把 `remember` 设为 true */
    open(path: string, options?: { remember?: boolean }): Promise<void>
    /** 走系统保存对话框写文本文件；取消时返回 null */
    saveText(options: SaveTextOptions): Promise<string | null>
    reveal(path: string): Promise<void>
    pickDirectory(options?: { title?: string }): Promise<string | null>
    pickFiles(options?: { title?: string }): Promise<string[]>
    /** 监听当前目录的外部变化；返回是否支持监听（不支持时退化为手动刷新） */
    watch(path: string): Promise<boolean>
    /** 停止监听（只在该目录仍是当前监听目录时生效） */
    unwatch(path: string): Promise<void>
    /** 订阅目录变化推送，返回取消订阅的函数 */
    onDirectoryChanged(listener: (event: { path: string; at: number }) => void): () => void
  }
  workspace: {
    list(): Promise<WorkspaceDetail[]>
    create(input: WorkspaceInput): Promise<WorkspaceDetail>
    update(id: number, patch: WorkspacePatch): Promise<WorkspaceDetail>
    remove(id: number): Promise<void>
    /** 拖拽排序：传入全部工作区的新顺序 */
    reorder(ids: number[]): Promise<WorkspaceDetail[]>
    addDirectory(workspaceId: number, path: string, name?: string): Promise<MappedDirectory>
    removeDirectory(mappingId: number): Promise<void>
  }
  todo: {
    list(filter?: TodoFilter): Promise<Todo[]>
    create(input: TodoInput): Promise<Todo>
    update(id: number, patch: TodoPatch): Promise<Todo>
    remove(id: number): Promise<void>
  }
  rule: {
    list(): Promise<Rule[]>
    create(input: RuleInput): Promise<Rule>
    update(id: number, patch: RulePatch): Promise<Rule>
    remove(id: number): Promise<void>
    /** 预览规则会移动哪些文件（不修改磁盘） */
    preview(ids?: number[]): Promise<RulePreview[]>
    /** 执行规则；不传 ids 表示全部启用的规则 */
    apply(ids?: number[]): Promise<RuleRunResult>
  }
  /** 快捷入口：常用文件 / 目录 / 工作区置顶 */
  shortcut: {
    list(): Promise<Shortcut[]>
    add(input: ShortcutInput): Promise<Shortcut>
    remove(id: number): Promise<void>
  }
  /** 首页快捷访问的系统应用 */
  home: {
    list(): Promise<HomeShortcut[]>
    add(input: HomeShortcutInput): Promise<HomeShortcut>
    remove(id: number): Promise<void>
  }
  /** 每日工作记录 */
  workLog: {
    list(startDate: string, endDate: string): Promise<WorkLog[]>
    save(date: string, draft: WorkLogDraft): Promise<WorkLog>
    exportWeek(startDate: string, endDate: string): Promise<{ path: string; count: number } | null>
    exportWeekText(startDate: string, endDate: string): Promise<{ path: string; count: number } | null>
    copyWeekText(startDate: string, endDate: string): Promise<{ count: number }>
  }
  /** 剪贴板历史：文本 / 文件，只在内存里，退出应用即清空 */
  clipboard: {
    list(): Promise<ClipboardEntry[]>
    /** 读取当前系统剪贴板里的文本（用户主动操作，不写入历史） */
    readText(): Promise<string>
    /** 再次复制：把历史条目写回系统剪贴板 */
    copy(id: number): Promise<ClipboardEntry>
    remove(id: number): Promise<void>
    clear(): Promise<void>
    /** 订阅历史变化推送，返回取消订阅的函数 */
    onChanged(listener: () => void): () => void
  }
  /** 备忘：文本（可选链接） */
  note: {
    list(): Promise<Note[]>
    create(input: NoteInput): Promise<Note>
    update(id: number, patch: NotePatch): Promise<Note>
    remove(id: number): Promise<void>
    /** 记录一次链接打开，供首页常用链接排序 */
    markLinkUsed(id: number): Promise<void>
    /** 订阅链接使用变化，返回取消订阅的函数 */
    onLinkUsed(listener: () => void): () => void
  }
  /** 文件型 Markdown 笔记；正文和附件直接保存在 notes 目录 */
  noteDocs: {
    tree(): Promise<NoteDocumentTree>
    read(path: string): Promise<NoteDocument>
    create(input: NoteDocumentCreateInput): Promise<NoteDocument>
    save(path: string, patch: NoteDocumentPatch): Promise<NoteDocument>
    remove(path: string): Promise<void>
    createFolder(parentPath: string, name: string): Promise<void>
    renameFolder(path: string, name: string): Promise<string>
    removeFolder(path: string): Promise<void>
    /** 图片复制到当前笔记目录的 attachments/，返回 Markdown 相对路径 */
    uploadAsset(path: string, fileName: string, data: ArrayBuffer | Uint8Array): Promise<{ src: string; name: string }>
    reveal(path: string): Promise<void>
  }
  /** 工具插件（Phase 1：text / table 结果 + 可选选项） */
  plugins: {
    list(): Promise<ToolDescriptor[]>
    /** 打开文件夹选择器；取消返回 null */
    installFolder(): Promise<ToolDescriptor | null>
    /** 打开 zip 选择器；取消返回 null */
    installZip(): Promise<ToolDescriptor | null>
    setEnabled(id: string, enabled: boolean): Promise<void>
    uninstall(id: string): Promise<void>
    /** 已安装插件的入口源码，渲染进程放进 Blob Worker 执行 */
    entrySource(id: string): Promise<{ code: string }>
    onChanged(listener: () => void): () => void
  }
  operations: {
    list(limit?: number): Promise<OperationBatch[]>
    undoLast(): Promise<{ batchId: string; result: BulkResult } | null>
    undo(batchId: string): Promise<BulkResult>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  system: {
    paths(): Promise<PathInfo>
    openDataDir(): Promise<void>
    /** 用系统默认浏览器打开链接（只接受 http / https） */
    openUrl(url: string): Promise<void>
    /** 打开某条备忘里的链接；会同时把这条备忘计入「最近打开」 */
    openNoteUrl(noteId: number, url: string): Promise<void>
    search(keyword: string, options?: SearchOptions): Promise<SearchResult[]>
    /** 从搜索结果打开的文件 / 目录 / 备忘 */
    recent(limit?: number): Promise<RecentEntry[]>
    clearRecent(): Promise<void>
    /** 订阅「托盘 / 全局快捷键要求打开搜索」，返回取消订阅的函数 */
    onOpenSearch(listener: () => void): () => void
    /** 订阅「托盘菜单要求打开设置页」，返回取消订阅的函数 */
    onOpenSettings(listener: () => void): () => void
    /** 数据库版本、路径与备份目录 */
    info(): Promise<AppInfo>
    /** 重新注册一遍全局快捷键并返回结果（用户清掉冲突的按键后不用重启应用） */
    recheckShortcuts(): Promise<GlobalShortcutStatus>
    /** 立即备份数据库，返回备份文件路径 */
    backupDatabase(): Promise<{ path: string }>
    openBackupDir(): Promise<void>
    /** 导出待办为 Markdown；用户取消时返回 null */
    exportTodos(): Promise<{ path: string; count: number } | null>
    /** 拖拽文件时用：取得系统文件路径（不暴露 fs） */
    getPathForFile(file: File): string
    /** 呼出全局搜索（主界面里的快捷键兜底：走这里才能和全局快捷键一套行为） */
    showSearch(): Promise<void>
    /** 显示主界面并跳到搜索结果对应的位置（独立搜索窗口用） */
    navigate(target: SearchNavigation): Promise<void>
    /** 订阅「跳转到搜索结果」，返回取消订阅的函数 */
    onNavigate(listener: (target: SearchNavigation) => void): () => void
    /** 收起独立搜索窗口（搜索窗口自己关闭时用） */
    hideSearch(): Promise<void>
    /** 订阅「设置变了」，返回取消订阅的函数 */
    onSettingsChanged(listener: () => void): () => void
    /** 独立搜索窗口：按内容高度（CSS px）调整窗口大小 */
    resizeSearch(height: number): Promise<void>
  }
  /** 系统里已安装的应用（搜索弹框里能搜到、回车打开） */
  apps: {
    /** 首页「添加应用」用的已安装应用列表 */
    list(): Promise<InstalledAppSummary[]>
    /** `target` 是搜索结果里的 path：Linux 的 .desktop、Windows 的快捷方式、macOS 的 .app */
    open(target: string): Promise<void>
  }
  /** 无系统边框窗口的自定义标题栏控制 */
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    /** 显示 / 隐藏窗口（应用内 Ctrl/Cmd + Alt + A 兜底） */
    toggle(): Promise<WindowToggleResult>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    /** 界面大小：整体缩放当前窗口 */
    setZoom(factor: number): Promise<void>
    /** Ctrl/Cmd +/-：在所有窗口当前缩放基础上增减 */
    zoomBy(delta: number): Promise<void>
    /** 订阅「窗口被隐藏」，返回取消订阅的函数（用于按设置收起搜索弹框） */
    onHidden(listener: () => void): () => void
  }
}

declare global {
  interface Window {
    desktop: DesktopApi
  }
}
