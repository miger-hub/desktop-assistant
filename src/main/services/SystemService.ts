import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import type {
  AppInfo,
  BulkResult,
  ClipboardEntry,
  GlobalShortcutStatus,
  PathInfo,
  RecentEntry,
  SaveTextOptions,
  SearchOptions,
  SearchResult,
  Todo
} from '../../shared/types'
import { fromFsError, invalidArgument, notFound } from '../errors'
import { t } from '../i18n'
import { MAX_APP_RESULTS, type AppService } from './AppService'
import type { ClipboardService } from './ClipboardService'
import type { MappingRepository } from '../repositories/MappingRepository'
import type { NoteService } from './NoteService'
import type { NoteDocumentService } from './NoteDocumentService'
import type { PluginService } from '../plugins/PluginService'
import type { TodoRepository } from '../repositories/TodoRepository'
import type { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import type { DatabaseService } from './DatabaseService'
import type { FileService } from './FileService'
import { resolveOpenWith } from './openWith'
import { clampRecentLimit, mergeRecent, type RecentService } from './RecentService'
import type { SettingsService } from './SettingsService'
import { WatcherService } from './WatcherService'
import { IPC } from '../../shared/ipc'

const MAX_FILE_RESULTS = 60

/** 剪贴板条目的搜索展示：文本取第一行，文件取第一个文件名 */
function clipboardTitle(entry: ClipboardEntry): string {
  if (entry.kind === 'files') {
    const first = entry.paths[0] ? path.basename(entry.paths[0]) : t('svc.clipboardFile')
    return entry.paths.length > 1
      ? t('svc.clipboardFilesCount', { first, count: entry.paths.length })
      : first
  }
  const line = entry.text.split('\n').find((value) => value.trim())?.trim() ?? ''
  return line.length > 80 ? `${line.slice(0, 80)}…` : line || t('svc.clipboardFallback')
}

function clipboardSubtitle(entry: ClipboardEntry): string {
  if (entry.kind === 'files') return entry.paths.join('  ')
  const lines = entry.text.split('\n').length
  const meta = lines > 1 ? t('svc.clipboardLines', { count: lines }) : t('svc.clipboardChars', { count: entry.text.length })
  return t('svc.clipboardText', { meta })
}

/**
 * 用指定程序打开一个文件（设置里的「打开方式」）。
 * macOS 的 .app 是目录，直接用 `open -a` 交给系统；其它平台按可执行文件启动并传文件路径。
 */
function launchProgram(program: string, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'darwin' && program.endsWith('.app') ? 'open' : program
    const args = command === 'open' ? ['-a', program, target] : [target]
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', (error) => reject(fromFsError(error, program)))
    child.once('spawn', () => {
      // 打开的程序独立运行，本程序退出不影响它
      child.unref()
      resolve()
    })
  })
}

/**
 * 系统相关能力：路径、打开文件、回收站、系统对话框。
 * 只有这一层直接依赖 Electron API。
 */
export class SystemService {
  private readonly watcher = new WatcherService((directory) => this.notifyDirectoryChanged(directory))

  constructor(
    private readonly files: FileService,
    private readonly workspaces: WorkspaceRepository,
    private readonly mappings: MappingRepository,
    private readonly todos: TodoRepository,
    private readonly notes: NoteService,
    private readonly noteDocs: NoteDocumentService,
    private readonly plugins: PluginService,
    private readonly clipboard: ClipboardService,
    private readonly recents: RecentService,
    private readonly settings: SettingsService,
    private readonly database: DatabaseService,
    private readonly apps: AppService,
    /** 主窗口（独立搜索窗口不在这一层管，它只负责显示 / 隐藏自己） */
    private readonly mainWindow: () => BrowserWindow | null
  ) {}

  /** 只监听一个目录：渲染进程切换目录时替换上一个监听 */
  watchDirectory(target: string): boolean {
    return this.watcher.watchDirectory(target)
  }

  unwatchDirectory(target: string): void {
    this.watcher.unwatchIf(target)
  }

  private notifyDirectoryChanged(directory: string): void {
    this.activeWindow()?.webContents.send(IPC.eventFileChanged, { path: directory, at: Date.now() })
  }

  paths(): PathInfo {
    return {
      home: app.getPath('home'),
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads'),
      userData: app.getPath('userData'),
      database: this.database.filePath
    }
  }

  /** 关于数据的信息：数据库版本、备份目录等，设置页用来展示与备份 */
  info(globalShortcuts: GlobalShortcutStatus): AppInfo {
    return {
      appVersion: app.getVersion(),
      schemaVersion: this.database.schemaVersion,
      database: this.database.filePath,
      backupDir: this.database.backupDirectory,
      globalShortcuts
    }
  }

  /** 手动备份数据库（VACUUM INTO 快照，运行中也能安全备份） */
  backupDatabase(): { path: string } {
    return { path: this.database.backup('manual') }
  }

  async openBackupDir(): Promise<void> {
    const directory = this.database.backupDirectory
    mkdirSync(directory, { recursive: true })
    await this.openPath(directory, { remember: false })
  }

  /** 导出待办为 Markdown，方便备份或迁移到别的工具；取消返回 null */
  async exportTodos(): Promise<{ path: string; count: number } | null> {
    const todos = this.todos.find()
    if (todos.length === 0) throw invalidArgument(t('svc.noTodosToExport'))

    const window = this.activeWindow()
    const options: Electron.SaveDialogOptions = {
      title: t('svc.exportTodosTitle'),
      defaultPath: path.join(app.getPath('documents'), `todos-${new Date().toISOString().slice(0, 10)}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null

    try {
      await writeFile(result.filePath, this.renderTodos(todos), 'utf8')
    } catch (error) {
      throw fromFsError(error, result.filePath)
    }
    return { path: result.filePath, count: todos.length }
  }

  private renderTodos(todos: Todo[]): string {
    const workspaceNames = new Map(this.workspaces.findAll().map((workspace) => [workspace.id, workspace.name]))
    const lines: string[] = [
      t('svc.exportHeading', { date: new Date().toISOString().slice(0, 10) }),
      ''
    ]

    const groups = new Map<number | null, Todo[]>()
    for (const todo of todos) {
      const key = todo.workspaceId
      const bucket = groups.get(key)
      if (bucket) bucket.push(todo)
      else groups.set(key, [todo])
    }

    for (const [workspaceId, items] of groups) {
      const title =
        workspaceId === null
          ? t('todo.inbox')
          : workspaceNames.get(workspaceId) ?? t('todo.deletedWorkspace')
      lines.push(`## ${title}`, '')
      for (const todo of items) {
        const meta = [todo.status === 'todo' ? '' : todo.status === 'doing' ? t('todo.statusDoing') : t('todo.statusDone')]
          .concat(
            todo.priority === 'normal'
              ? []
              : `${t('todo.priority')}：${todo.priority === 'high' ? t('todo.priorityHigh') : t('todo.priorityLow')}`
          )
          .concat(todo.dueDate ? `${t('todo.due')}：${todo.dueDate}` : [])
          .filter(Boolean)
          .join(' · ')
        lines.push(`- [${todo.status === 'done' ? 'x' : ' '}] ${todo.title}${meta ? `（${meta}）` : ''}`)
        if (todo.description.trim()) {
          lines.push(...todo.description.trim().split('\n').map((line) => `  > ${line}`))
        }
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * 全局搜索的「最近打开」：只包含从搜索结果打开的文件 / 目录 / 备忘。
   * 备忘没有路径，用 `note:<id>` 作为去重键，跳转时靠 id 定位。
   */
  recent(limit?: number): RecentEntry[] {
    const cap = clampRecentLimit(limit)
    const notes: RecentEntry[] = this.notes.recentlyOpened(cap).map((note) => ({
      path: `note:${note.id}`,
      name: note.title,
      kind: 'note',
      id: note.id,
      url: note.url || undefined,
      openedAt: note.lastOpenedAt ?? note.updatedAt,
      count: 1
    }))

    return mergeRecent(this.recents.list(cap), notes, cap)
  }

  clearRecent(): void {
    this.recents.clear()
    this.notes.clearRecentlyOpened()
  }

  /**
   * 打开文件或目录：文件先看设置里配的「打开方式」，没命中才交给系统默认程序。
   * 只有全局搜索发起打开时才计入「最近打开」，文件列表 / 快捷入口等入口不算。
   */
  async openPath(target: string, options: { remember?: boolean } = {}): Promise<void> {
    if (!(await this.files.exists(target))) throw notFound(t('svc.notExist', { what: t('svc.path'), value: target }))
    const item = await this.files.stat(target)

    // 只对普通文件套用「打开方式」；目录仍旧交给系统文件管理器
    const rule = item?.type === 'file' ? resolveOpenWith(this.settings.get().openWithRules, target) : null
    if (rule) {
      await launchProgram(rule.program, target)
    } else {
      const message = await shell.openPath(target)
      if (message) throw fromFsError(new Error(message), target)
    }

    if (options.remember === true) {
      this.recents.touch(target, item?.type === 'directory' ? 'directory' : 'file')
    }
  }

  /** 在系统文件管理器中定位该文件 */
  async revealPath(target: string): Promise<void> {
    if (!(await this.files.exists(target))) throw notFound(t('svc.notExist', { what: t('svc.path'), value: target }))
    shell.showItemInFolder(target)
  }

  /** 走系统保存对话框写文本文件（工具导出 CSV 等） */
  async saveText(options: SaveTextOptions): Promise<string | null> {
    if (!options || typeof options.content !== 'string' || !options.defaultName) {
      throw invalidArgument(t('svc.invalidSaveOptions'))
    }
    const window = this.activeWindow()
    const config: Electron.SaveDialogOptions = {
      title: options.title ?? t('common.save'),
      defaultPath: path.join(app.getPath('documents'), path.basename(options.defaultName)),
      filters: options.filters
    }
    const result = window ? await dialog.showSaveDialog(window, config) : await dialog.showSaveDialog(config)
    if (result.canceled || !result.filePath) return null
    try {
      await writeFile(result.filePath, options.content, 'utf8')
    } catch (error) {
      throw fromFsError(error, result.filePath)
    }
    return result.filePath
  }

  async openDataDir(): Promise<void> {
    await this.openPath(app.getPath('userData'), { remember: false })
  }

  /**
   * 用系统默认浏览器打开链接。
   * 只放行 http / https，避免备忘里存的文本被当成任意协议交给系统。
   */
  async openUrl(url: string): Promise<void> {
    let parsed: URL
    try {
      parsed = new URL(url.trim())
    } catch {
      throw invalidArgument(t('svc.urlInvalid', { value: url }))
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw invalidArgument(t('svc.urlScheme'))
    }
    await shell.openExternal(parsed.toString())
  }

  /**
   * 打开备忘里的链接，并把这条备忘记为「从搜索打开」：
   * 带了链接的备忘回车是打开浏览器，这一步同样算打开过这条备忘。
   */
  async openNoteUrl(noteId: number, url: string): Promise<void> {
    await this.openUrl(url)
    this.notes.markLinkUsed(noteId)
    this.notes.markOpened(noteId)
    this.mainWindow()?.webContents.send(IPC.eventNoteLinkUsed, { at: Date.now() })
  }

  /** 无系统边框窗口：自定义标题栏的窗口控制 */
  minimizeWindow(): void {
    this.activeWindow()?.minimize()
  }

  /** 切换最大化，返回切换后的状态 */
  toggleMaximizeWindow(): boolean {
    const window = this.activeWindow()
    if (!window) return false

    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  }

  closeWindow(): void {
    this.activeWindow()?.close()
  }

  isWindowMaximized(): boolean {
    return this.activeWindow()?.isMaximized() ?? false
  }

  /** 界面大小：缩放当前窗口内容（0.8 ~ 1.5 之间兜底，避免异常值把界面弄坏） */
  /** 界面大小：所有窗口一起缩放（主界面 + 独立搜索窗口） */
  setWindowZoom(factor: number): void {
    if (!Number.isFinite(factor)) return
    const zoom = Math.min(1.5, Math.max(0.8, factor))
    for (const window of BrowserWindow.getAllWindows()) window.webContents.setZoomFactor(zoom)
  }

  /** Ctrl/Cmd +/-：每个窗口在自己的当前缩放上增减，范围与设置页一致 */
  zoomWindowsBy(delta: number): void {
    if (!Number.isFinite(delta)) return
    for (const window of BrowserWindow.getAllWindows()) {
      const next = Math.min(1.5, Math.max(0.8, window.webContents.getZoomFactor() + delta))
      window.webContents.setZoomFactor(next)
    }
  }

  /** 走系统回收站，避免误删 */
  async trash(targets: string[]): Promise<BulkResult> {
    const result: BulkResult = { succeeded: [], skipped: [], failed: [] }

    for (const target of targets) {
      const resolved = path.resolve(target)
      try {
        if (!(await this.files.exists(resolved))) {
          throw notFound(t('svc.notExist', { what: t('svc.path'), value: resolved }))
        }
        await shell.trashItem(resolved)
        result.succeeded.push(resolved)
      } catch (error) {
        result.failed.push({ path: resolved, message: fromFsError(error, resolved).message })
      }
    }

    return result
  }

  async pickDirectory(options: { title?: string } = {}): Promise<string | null> {
    const window = this.activeWindow()
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: options.title ?? t('svc.pickDirectory'),
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: options.title ?? t('svc.pickDirectory'),
          properties: ['openDirectory', 'createDirectory']
        })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  }

  async pickFiles(options: { title?: string } = {}): Promise<string[]> {
    const window = this.activeWindow()
    const config: Electron.OpenDialogOptions = {
      title: options.title ?? t('svc.pickFiles'),
      properties: ['openFile', 'multiSelections']
    }
    const result = window
      ? await dialog.showOpenDialog(window, config)
      : await dialog.showOpenDialog(config)

    return result.canceled ? [] : result.filePaths
  }

  /**
   * MVP 搜索：只搜名称（文件名 / 待办标题 / 备忘标题与内容 / 工作区 / 映射目录），
   * 不做全文索引。`options.workspaceId` 用来按归属收敛结果（'inbox' 表示没有归属）。
   */
  async search(keyword: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const needle = keyword.trim().toLowerCase()
    if (!needle) return []

    const results: SearchResult[] = []
    const matches = (value: string): boolean => value.toLowerCase().includes(needle)
    const inWorkspace = (workspaceId: number | null): boolean => {
      if (options.workspaceId === undefined) return true
      if (options.workspaceId === 'inbox') return workspaceId === null
      return workspaceId === options.workspaceId
    }

    const workspaceList = this.workspaces.findAll()
    const workspaceNames = new Map(workspaceList.map((workspace) => [workspace.id, workspace.name]))
    /** 文件 / 目录结果前面带上归属，避免同名条目分不清（桌面单独标注） */
    const locationOf = (workspaceId: number | null): string =>
      workspaceId === null ? t('svc.desktop') : workspaceNames.get(workspaceId) ?? t('nav.workspace')

    for (const workspace of workspaceList) {
      if (matches(workspace.name) && inWorkspace(workspace.id)) {
        results.push({
          type: 'workspace',
          title: workspace.name,
          subtitle: t('search.typeWorkspace'),
          id: workspace.id,
          workspaceId: workspace.id
        })
      }
    }

    for (const mapping of this.mappings.findAll()) {
      if ((matches(mapping.name) || matches(mapping.path)) && inWorkspace(mapping.workspaceId)) {
        results.push({
          type: 'directory',
          title: mapping.name,
          subtitle: `${locationOf(mapping.workspaceId)} · ${mapping.path}`,
          path: mapping.path,
          id: mapping.id,
          workspaceId: mapping.workspaceId
        })
      }
    }

    for (const todo of this.todos.find({ keyword })) {
      if (!inWorkspace(todo.workspaceId)) continue
      results.push({
        type: 'todo',
        title: todo.title,
        subtitle: todo.status === 'done' ? t('todo.statusDone') : t('todo.statusTodo'),
        id: todo.id,
        workspaceId: todo.workspaceId
      })
    }

    for (const note of this.notes.find(keyword)) {
      results.push({
        type: 'note',
        title: note.title,
        subtitle: note.content.split('\n')[0]?.trim() || note.url || t('nav.notes'),
        id: note.id,
        workspaceId: null,
        url: note.url || undefined
      })
    }

    for (const note of await this.noteDocs.search(keyword)) {
      if (!inWorkspace(note.workspaceId)) continue
      results.push({
        type: 'note',
        title: note.title,
        subtitle:
          note.excerpt ||
          (note.workspaceId === null
            ? t('svc.noteFileLocation', { value: note.folderPath || t('svc.noteRootName') })
            : t('svc.noteFileWorkspaceLocation', {
                workspace: workspaceNames.get(note.workspaceId) ?? t('nav.workspace'),
                folder: note.folderPath || t('svc.noteRootName')
              })),
        notePath: note.path,
        workspaceId: note.workspaceId
      })
    }

    // 工具插件：只匹配元数据，禁用插件不会出现在这里
    for (const tool of await this.plugins.search(keyword)) {
      results.push({
        type: 'tool',
        title: tool.name,
        subtitle: tool.description,
        toolId: tool.id,
        workspaceId: null
      })
    }

    // 系统里已安装的应用：图标一起带上，渲染进程直接当图片用（CSP 只允许 data:）
    for (const app of await this.apps.search(keyword, MAX_APP_RESULTS)) {
      results.push({
        type: 'app',
        title: app.name,
        subtitle: app.comment || t('search.typeApp'),
        path: app.path,
        workspaceId: null,
        iconUrl: (await this.apps.iconDataUrl(app)) ?? undefined
      })
    }

    // 桌面文件没有归属工作区，映射目录里的文件归属对应工作区
    const directories: Array<{ path: string; workspaceId: number | null; directoryId: number | null }> = [
      { path: this.paths().desktop, workspaceId: null, directoryId: null },
      ...this.mappings
        .findAll()
        .map((item) => ({ path: item.path, workspaceId: item.workspaceId, directoryId: item.id }))
    ]
    for (const directory of directories) {
      if (results.length >= MAX_FILE_RESULTS) break
      if (!inWorkspace(directory.workspaceId)) continue
      if (!(await this.files.exists(directory.path))) continue
      try {
        const items = await this.files.list(directory.path, { showHidden: true })
        for (const item of items) {
          if (results.length >= MAX_FILE_RESULTS) break
          if (!matches(item.name)) continue
          results.push({
            type: 'file',
            title: item.name,
            subtitle: `${locationOf(directory.workspaceId)} · ${item.path}`,
            path: item.path,
            workspaceId: directory.workspaceId,
            // 同一个目录被映射到多个工作区时，靠这个字段区分文件来自哪条映射
            directoryId: directory.directoryId
          })
        }
      } catch {
        // 目录无法读取时跳过
      }
    }

    // 剪贴板历史（内存里，退出即清空）：文本匹配正文、文件匹配路径，回车可再次复制
    for (const entry of this.clipboard.list()) {
      const haystack = entry.kind === 'files' ? entry.paths.join('\n') : entry.text
      if (!matches(haystack)) continue
      results.push({
        type: 'clipboard',
        title: clipboardTitle(entry),
        subtitle: clipboardSubtitle(entry),
        id: entry.id,
        workspaceId: null
      })
    }

    return results
  }

  /**
   * 窗口动作的目标（标题栏按钮、文件对话框、目录变化通知）。
   * 优先主窗口：独立搜索窗口也会拿到焦点，用 getFocusedWindow() 会让这些动作打偏。
   */
  private activeWindow(): BrowserWindow | null {
    return this.mainWindow() ?? BrowserWindow.getFocusedWindow() ?? null
  }
}
