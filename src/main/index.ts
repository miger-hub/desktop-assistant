import path from 'node:path'
import { app, BrowserWindow, dialog, Notification } from 'electron'
import { IPC } from '../shared/ipc'
import type { SearchNavigation, WindowToggleResult } from '../shared/types'
import { formatAccelerator } from '../shared/accelerator'
import type { AppContext } from './context'
import { registerIpc } from './ipc'
import { applyLanguageSetting, t } from './i18n'
import { AppService } from './services/AppService'
import { MappingRepository } from './repositories/MappingRepository'
import { NoteRepository } from './repositories/NoteRepository'
import { OperationRepository } from './repositories/OperationRepository'
import { PluginRepository } from './plugins/PluginRepository'
import { PluginService } from './plugins/PluginService'
import { RecentRepository } from './repositories/RecentRepository'
import { RuleRepository } from './repositories/RuleRepository'
import { SettingRepository } from './repositories/SettingRepository'
import { ShortcutRepository } from './repositories/ShortcutRepository'
import { TodoRepository } from './repositories/TodoRepository'
import { WorkspaceRepository } from './repositories/WorkspaceRepository'
import { DatabaseService } from './services/DatabaseService'
import { FileService } from './services/FileService'
import { ClipboardService } from './services/ClipboardService'
import { NoteService } from './services/NoteService'
import { OperationService } from './services/OperationService'
import { RecentService } from './services/RecentService'
import { RuleService } from './services/RuleService'
import { SettingsService } from './services/SettingsService'
import { ShortcutService } from './services/ShortcutService'
import { SystemService } from './services/SystemService'
import { SystemClipboardSource } from './services/SystemClipboard'
import { TodoService } from './services/TodoService'
import { TOGGLE_WINDOW_ACCELERATOR, TrayService } from './services/TrayService'
import { SearchWindow } from './searchWindow'
import { WorkspaceService } from './services/WorkspaceService'
import { createMainWindow } from './window'

/**
 * Wayland 下 Electron 的 globalShortcut 默认走不通（X11 grab 收不到按键），
 * 必须启用 xdg-desktop-portal 的 GlobalShortcuts 后端。
 * 必须在 app ready 之前设置；已经带了这个 feature 时不重复追加。
 */
if (process.platform === 'linux') {
  const features = app.commandLine.getSwitchValue('enable-features')
  if (!features.includes('GlobalShortcutsPortal')) {
    app.commandLine.appendSwitch(
      'enable-features',
      features ? `${features},GlobalShortcutsPortal` : 'GlobalShortcutsPortal'
    )
  }
}

let context: AppContext | null = null
let shell: TrayService | null = null
let mainWin: BrowserWindow | null = null
let searchSheet: SearchWindow | null = null
/** 真正退出（而不是收进托盘）时置为 true */
let quitting = false

function bootstrap(): Omit<AppContext, 'shell'> {
  const databasePath = path.join(app.getPath('userData'), 'data.db')
  const database = new DatabaseService(databasePath)
  const connection = database.connection

  const workspaceRepository = new WorkspaceRepository(connection)
  const mappingRepository = new MappingRepository(connection)
  const todoRepository = new TodoRepository(connection)
  const noteRepository = new NoteRepository(connection)
  const pluginRepository = new PluginRepository(connection)
  const settingRepository = new SettingRepository(connection)
  const ruleRepository = new RuleRepository(connection)
  const operationRepository = new OperationRepository(connection)
  const shortcutRepository = new ShortcutRepository(connection)
  const recentRepository = new RecentRepository(connection)

  // FileService 只碰文件系统；回收站属于系统能力，放在 SystemService
  const files = new FileService()
  const operations = new OperationService(operationRepository, files)
  const recent = new RecentService(recentRepository)
  const settings = new SettingsService(settingRepository)
  const notes = new NoteService(noteRepository)
  const plugins = new PluginService(
    pluginRepository,
    path.join(app.getPath('userData'), 'plugins'),
    () => notifyPluginChanged()
  )
  const apps = new AppService()
  // 先扫一遍已安装应用：第一次搜索不用等 IO（扫不到也不影响其它功能）
  void apps.list().catch(() => undefined)

  // 剪贴板没有「内容变化」事件，只能定时轮询；历史一变就推给渲染进程
  const clipboard = new ClipboardService(new SystemClipboardSource(), () => notifyClipboardChanged())
  clipboard.setLimit(settings.get().clipboardHistoryLimit)

  return {
    database,
    files,
    workspaces: new WorkspaceService(workspaceRepository, mappingRepository, files),
    todos: new TodoService(todoRepository, workspaceRepository),
    rules: new RuleService(ruleRepository, files, operations),
    shortcuts: new ShortcutService(shortcutRepository, workspaceRepository, files),
    clipboard,
    notes,
    plugins,
    operations,
    settings,
    apps,
    system: new SystemService(
      files,
      workspaceRepository,
      mappingRepository,
      todoRepository,
      notes,
      plugins,
      clipboard,
      recent,
      settings,
      database,
      apps,
      () => mainWindow()
    )
  }
}

/**
 * 主窗口；被托盘隐藏时窗口仍然存在，真正关闭后为 null。
 * 这里必须用创建时记住的引用：搜索窗口是另一个 BrowserWindow，
 * getAllWindows()[0] 有可能拿到搜索窗口，主窗口的显示 / 隐藏就全乱了。
 */
function mainWindow(): BrowserWindow | null {
  return mainWin && !mainWin.isDestroyed() ? mainWin : null
}

/** 搜索窗口（懒创建，创建后一直复用，只 hide / show） */
function searchWindow(): SearchWindow {
  if (!searchSheet) searchSheet = new SearchWindow({ isQuitting: () => quitting })
  return searchSheet
}

/** 创建主窗口并记住引用（真正关闭后清空，下次 showMainWindow 会重建） */
function createMain(): BrowserWindow {
  const window = createMainWindow({ hideOnClose: shouldHideOnClose })
  mainWin = window
  window.on('closed', () => {
    mainWin = null
  })
  return window
}

/** 剪贴板历史变了 → 通知渲染进程刷新（没有窗口时不用管） */
function notifyClipboardChanged(): void {
  mainWindow()?.webContents.send(IPC.eventClipboardChanged, { at: Date.now() })
}

/** 插件安装 / 卸载 / 启用状态变化 → 通知主界面刷新工具列表 */
function notifyPluginChanged(): void {
  mainWindow()?.webContents.send(IPC.eventPluginChanged, { at: Date.now() })
}

/** 系统剪贴板没有「内容变化」事件，只能轮询；1 秒足够灵敏，读一次也很便宜 */
const CLIPBOARD_POLL_MS = 1000
let clipboardTimer: NodeJS.Timeout | null = null

async function pollClipboard(): Promise<void> {
  if (!context) return
  try {
    await context.clipboard.capture()
  } catch {
    // 没有图形会话等场景下读剪贴板会失败，跳过这一轮即可
  }
}

/**
 * 显示窗口（必要时恢复 / 重新创建）。
 *
 * 无边框窗口在 Wayland / X11 下被隐藏或最小化后，单纯 show() 不一定真的回到前台，
 * 所以这里按「恢复最小化 → 显示 → 置顶 → 聚焦」的顺序处理，
 * 保证全局快捷键与托盘都能把窗口叫回来（隐藏之后就找不回来是最糟糕的结果）。
 */
function showMainWindow(): BrowserWindow {
  const existing = mainWindow()
  if (!existing) return createMain()

  if (existing.isMinimized()) existing.restore()
  if (process.platform === 'darwin') app.focus({ steal: true })
  existing.show()
  existing.moveTop()
  existing.focus()
  return existing
}

/**
 * 同一次按键可能被处理两次：全局快捷键（macOS、Wayland 的 portal 不会抢走按键）和应用内兜底
 * 都会调到这里，一收一放等于没变，用户看到的就是「按了没反应」。
 * 所以极短时间内的重复切换只认第一次（正常连按两次不会落在这么短的时间里）。
 */
const TOGGLE_DEBOUNCE_MS = 120
let lastToggleAt = 0

function toggleMainWindow(): void {
  const now = Date.now()
  if (now - lastToggleAt < TOGGLE_DEBOUNCE_MS) return
  lastToggleAt = now

  applyToggleWindow()
}

/**
 * 隐藏之后还有没有能把窗口叫回来的方式（托盘图标 / 注册成功的全局快捷键）。
 *
 * 窗口隐藏后收不到应用内兜底的按键，所以托盘图标和全局快捷键都没有时不能隐藏，
 * 否则窗口直接失联、只能重启应用。
 */
function canRestoreWindow(): boolean {
  return shell?.canRestoreWindow() ?? false
}

/** 真正做显示 / 隐藏（重复按键的去重在调用方） */
function applyToggleWindow(): WindowToggleResult {
  const window = mainWindow()
  if (!window) {
    showMainWindow()
    return { hidden: false, reason: null }
  }

  // 搜索窗口也是应用的一部分：它开着的时候焦点在它身上，但用户按
  // 「显示 / 隐藏主窗口」显然是想把主界面收起来，所以这两种情况都算「在前台」。
  // 其余情况（最小化、被别的程序压住、收进托盘）一律走 showMainWindow()，
  // 避免出现「按了快捷键窗口回不来」的死角。
  const searchWindowOpen = searchSheet?.active ?? false
  if (window.isVisible() && !window.isMinimized() && (window.isFocused() || searchWindowOpen)) {
    if (!canRestoreWindow()) {
      return {
        hidden: false,
        reason: t('svc.hideRejected')
      }
    }
    // 收起主界面时把独立搜索窗口一起收掉，不然屏幕上还剩个搜索框
    searchSheet?.hide()
    window.hide()
    return { hidden: true, reason: null }
  }

  showMainWindow()
  return { hidden: false, reason: null }
}

/**
 * 快捷键触发的显示 / 隐藏（全局快捷键与应用内兜底都走这里）。
 */
function toggleMainWindowByShortcut(): WindowToggleResult {
  const now = Date.now()
  if (now - lastToggleAt < TOGGLE_DEBOUNCE_MS) return { hidden: false, reason: null }
  lastToggleAt = now

  return applyToggleWindow()
}

/**
 * 渲染进程发起的显示 / 隐藏（窗口聚焦时的 Ctrl/Cmd + Alt + A 兜底）。
 *
 * 这个手势只在窗口聚焦时有效，隐藏之后用户没法再用同一个手势把窗口叫回来，
 * 所以第一次隐藏时用系统通知提示一次唤回方式，避免「窗口藏起来就找不回来」的错觉。
 */
function toggleWindowFromRenderer(): WindowToggleResult {
  const result = toggleMainWindowByShortcut()
  if (result.hidden) notifyRestoreHint()
  return result
}

let restoreHintShown = false

function notifyRestoreHint(): void {
  if (restoreHintShown) return
  restoreHintShown = true

  try {
    const keys = formatAccelerator(context?.settings.get().toggleShortcut ?? TOGGLE_WINDOW_ACCELERATOR)
    new Notification({
      title: t('svc.hiddenTitle'),
      body: t('svc.hiddenBody', { keys })
    }).show()
  } catch {
    // 系统通知不可用（部分环境没有通知服务）就算了，不影响隐藏本身
  }
}

/**
 * 托盘 / 全局快捷键呼出搜索。
 *
 * 默认只在独立的搜索窗口里显示（不碰主界面：主界面开着也不会被关掉、
 * 收起来也不会被叫出来）；设置里打开「搜索显示在主界面里」才走老路径
 * ——先显示主界面，再让主界面里的渲染进程打开搜索弹框。
 */
function openGlobalSearch(): void {
  if (!context?.settings.get().searchInMainWindow) {
    searchWindow().show()
    return
  }

  const window = showMainWindow()
  const send = (): void => window.webContents.send(IPC.eventOpenSearch, { at: Date.now() })
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send)
  else send()
}

/** 搜索结果要求跳转：显示主界面，再把跳转交给主窗口的渲染进程执行 */
function navigateMainWindow(target: SearchNavigation): void {
  // 从搜索跳到备忘就算「打开过」：记下时间，「最近打开」里会带上它
  if (target.kind === 'note' && target.noteId != null && context) {
    try {
      context.notes.markOpened(target.noteId)
    } catch {
      // 备忘可能已经被删掉，忽略即可
    }
  }

  const window = showMainWindow()
  const send = (): void => window.webContents.send(IPC.eventNavigate, target)
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send)
  else send()
}

/** 托盘菜单「设置…」：先显示窗口，再跳到设置页 */
function openSettingsPage(): void {
  const window = showMainWindow()
  const send = (): void => window.webContents.send(IPC.eventOpenSettings, { at: Date.now() })
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send)
  else send()
}

/**
 * 开启了托盘、并且托盘真的创建成功时，点关闭只是收进托盘；
 * 托盘不可用的环境（例如没有托盘支持）仍然按正常关闭退出，避免窗口藏起来找不回来。
 */
function shouldHideOnClose(): boolean {
  if (quitting || !context) return false
  return context.settings.get().trayEnabled && context.shell.trayActive()
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(() => {
    let services: Omit<AppContext, 'shell'>
    try {
      services = bootstrap()
    } catch (error) {
      // 数据库版本过新、文件损坏等情况下给出可读提示，而不是静默崩溃
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox(t('main.bootErrorTitle'), `${message}\n\n${t('svc.bootDataDir', { value: app.getPath('userData') })}`)
      app.quit()
      return
    }

    // 主进程（托盘 / 窗口 / 错误信息）按设置里的语言显示
    applyLanguageSetting(services.settings.get().language, app.getLocale())

    shell = new TrayService({
      // 托盘菜单点击：立即切换，不走快捷键的去重
      toggleWindow: toggleMainWindow,
      toggleWindowByShortcut: toggleMainWindowByShortcut,
      openSearch: openGlobalSearch,
      openSettings: openSettingsPage,
      quit: () => {
        quitting = true
        app.quit()
      }
    })

    context = {
      ...services,
      shell: {
        apply: (settings) => shell?.apply(settings),
        trayActive: () => shell?.active ?? false,
        // 渲染进程里的兜底快捷键和全局快捷键按同一个键，所以走同一套去重判定
        toggleWindow: toggleWindowFromRenderer,
        shortcutStatus: () =>
          shell?.shortcutStatus ?? { enabled: false, entries: [] },
        recheckShortcuts: () => shell?.recheckShortcuts() ?? { enabled: false, entries: [] },
        // 主界面里的快捷键兜底：和托盘 / 全局快捷键走同一套「呼出搜索」
        showSearch: openGlobalSearch,
        navigate: navigateMainWindow,
        hideSearch: () => searchSheet?.hide(),
        resizeSearch: (height) => searchSheet?.resize(height)
      }
    }

    registerIpc(context)
    createMain()
    shell.apply(context.settings.get())
    // 预热搜索窗口：第一次呼出不用等窗口创建 + 页面加载（用主界面里的搜索时不必预热）
    if (!context.settings.get().searchInMainWindow) setTimeout(() => searchWindow().prepare(), 1500)
    clipboardTimer = setInterval(() => void pollClipboard(), CLIPBOARD_POLL_MS)

    app.on('activate', () => {
      showMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
    if (clipboardTimer) clearInterval(clipboardTimer)
    clipboardTimer = null
    searchSheet?.destroy()
    searchSheet = null
    shell?.destroy()
    shell = null
    context?.database.close()
    context = null
  })
}
