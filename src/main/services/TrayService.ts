import { Menu, Tray, globalShortcut, nativeImage } from 'electron'
import type { AppSettings, GlobalShortcutEntry, GlobalShortcutStatus } from '../../shared/types'
import { DEFAULT_SHORTCUTS, formatAccelerator } from '../../shared/accelerator'
import { t } from '../i18n'
import { TRAY_ICON_DATA_URL } from './trayIcon'

/** 全局快捷键：在应用外也能用（macOS 上 Alt 即 ⌥） */
export const TOGGLE_WINDOW_ACCELERATOR = DEFAULT_SHORTCUTS.toggle
export const OPEN_SEARCH_ACCELERATOR = DEFAULT_SHORTCUTS.search

type ShortcutAction = keyof Pick<TrayActions, 'toggleWindow' | 'openSearch'>

interface ShortcutDefinition {
  /** 调用的窗口动作 */
  action: ShortcutAction
  accelerator: string
  /** 给用户看的按键文案 */
  keys: string
}

/** 全局快捷键可以在设置里改，这里按当前设置拼出要注册的两条 */
function shortcutDefinitions(
  settings: Pick<AppSettings, 'toggleShortcut' | 'searchShortcut'>
): ShortcutDefinition[] {
  return [
    {
      action: 'toggleWindow',
      accelerator: settings.toggleShortcut,
      keys: formatAccelerator(settings.toggleShortcut)
    },
    {
      action: 'openSearch',
      accelerator: settings.searchShortcut,
      keys: formatAccelerator(settings.searchShortcut)
    }
  ]
}

/** 快捷键做什么：读的时候再取文案，语言切换后设置页刷新一次就跟着变 */
function actionDescription(action: ShortcutAction): string {
  return action === 'toggleWindow' ? t('main.toggleShortcutAction') : t('main.searchShortcutAction')
}

export interface TrayActions {
  /** 显示 / 隐藏主窗口（托盘菜单点击，立即生效） */
  toggleWindow: () => void
  /** 全局快捷键触发的显示 / 隐藏（带重复按键去重） */
  toggleWindowByShortcut: () => void
  /** 显示主窗口并呼出全局搜索 */
  openSearch: () => void
  /** 显示主窗口并跳到设置页 */
  openSettings: () => void
  quit: () => void
}

/**
 * 一次注册的结果。原因不存成成品字符串，只记「哪种原因 + 平台细节」，
 * 等设置页读取时再按当前语言拼出来。
 */
interface ShortcutEntryState {
  shortcut: ShortcutDefinition
  registered: boolean
  failure: { wayland: boolean; detail: string | null } | null
}

/**
 * 注册失败的常见原因。
 *
 * Linux 下 `globalShortcut` 依赖桌面环境：Wayland 要靠 xdg-desktop-portal 的
 * GlobalShortcuts 后端，没有这个后端的桌面环境无论按键有没有被占用都注册不上。
 * Electron 不告诉我们具体是哪种，所以两者都提一句，由用户自己判断怎么配置。
 */
function isWayland(): boolean {
  return (
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE === 'wayland' || Boolean(process.env.WAYLAND_DISPLAY))
  )
}

/** 注册失败原因：按当前语言拼出来（可能带上平台给的具体信息） */
function failureReason(failure: { wayland: boolean; detail: string | null }): string {
  const base = failure.wayland ? t('main.conflictWayland') : t('main.conflictBusy')
  return failure.detail ? `${base}${t('main.conflictDetail', { detail: failure.detail })}` : base
}

/**
 * 系统托盘与全局快捷键。
 *
 * 两者都是可以关掉的系统集成能力：注册失败（例如 Linux Wayland 下的全局快捷键、
 * 没有托盘的环境）只记日志，不影响应用本身。
 */
export class TrayService {
  private tray: Tray | null = null
  private registered: string[] = []
  private entries: ShortcutEntryState[] = []
  private trayEnabled = false
  private shortcutsEnabled = false
  /** 当前生效的快捷键定义，设置里改了要重新注册 */
  private definitions: ShortcutDefinition[] = shortcutDefinitions({
    toggleShortcut: TOGGLE_WINDOW_ACCELERATOR,
    searchShortcut: OPEN_SEARCH_ACCELERATOR
  })

  constructor(private readonly actions: TrayActions) {}

  /** 托盘是否真的可用（创建失败的环境下为 false） */
  get active(): boolean {
    return this.tray !== null
  }

  /** 全局快捷键注册情况，设置页与启动提示用它告诉用户为什么按键没反应 */
  get shortcutStatus(): GlobalShortcutStatus {
    return {
      enabled: this.shortcutsEnabled,
      // 这里的 action / reason 现取现拼，语言切换后重新读取即可拿到新语言
      entries: this.entries.map<GlobalShortcutEntry>((entry) => ({
        accelerator: entry.shortcut.accelerator,
        keys: entry.shortcut.keys,
        action: actionDescription(entry.shortcut.action),
        registered: entry.registered,
        reason: entry.registered || !entry.failure ? null : failureReason(entry.failure)
      }))
    }
  }

  /**
   * 窗口隐藏之后还有没有办法再显示出来。
   *
   * 窗口聚焦时的应用内兜底只在窗口可见时收得到按键，一旦隐藏就再也听不到，
   * 所以隐藏前必须确认还有托盘图标或注册成功的全局快捷键能把窗口叫回来，
   * 否则用户只能重启应用。
   */
  canRestoreWindow(): boolean {
    if (this.tray !== null) return true
    return this.shortcutsEnabled && this.entries.some((entry) => entry.registered)
  }

  /**
   * 重新注册一遍全局快捷键并返回结果。
   * 设置页的「重新检测」用它：用户关掉占用按键的程序之后不用重启应用。
   */
  recheckShortcuts(): GlobalShortcutStatus {
    this.unregisterShortcuts()
    if (this.shortcutsEnabled) this.registerShortcuts()
    return this.shortcutStatus
  }

  /** 设置变化后调用；重复调用是安全的 */
  apply(
    settings: Pick<
      AppSettings,
      'trayEnabled' | 'globalShortcutsEnabled' | 'toggleShortcut' | 'searchShortcut'
    >
  ): void {
    this.setTrayEnabled(settings.trayEnabled)
    // 快捷键改了：即使开关没变也要重新注册
    if (
      settings.toggleShortcut !== this.definitions[0].accelerator ||
      settings.searchShortcut !== this.definitions[1].accelerator
    ) {
      this.definitions = shortcutDefinitions(settings)
      const wasEnabled = this.shortcutsEnabled
      this.unregisterShortcuts()
      if (wasEnabled) this.registerShortcuts()
    }
    this.setGlobalShortcutsEnabled(settings.globalShortcutsEnabled)
    // 语言变了要重建托盘菜单（标签是本地化的）
    if (this.tray) this.buildMenu()
  }

  destroy(): void {
    this.unregisterShortcuts()
    this.tray?.destroy()
    this.tray = null
    this.trayEnabled = false
  }

  private setTrayEnabled(enabled: boolean): void {
    if (enabled === this.trayEnabled) return
    this.trayEnabled = enabled

    if (enabled) this.createTray()
    else {
      this.tray?.destroy()
      this.tray = null
    }
  }

  private setGlobalShortcutsEnabled(enabled: boolean): void {
    if (enabled === this.shortcutsEnabled) return
    this.shortcutsEnabled = enabled

    this.unregisterShortcuts()
    if (enabled) this.registerShortcuts()
  }

  /** 逐个注册并记录结果：注册不上不抛异常，交给启动提示 / 设置页解释 */
  private registerShortcuts(): void {
    for (const shortcut of this.definitions) {
      this.register(shortcut)
    }
  }

  private register(shortcut: ShortcutDefinition): void {
    const { accelerator } = shortcut
    try {
      // 被别的程序占用、或桌面环境不支持（Wayland 没有 portal）时返回 false，不抛异常
      const handler =
        shortcut.action === 'toggleWindow'
          ? () => this.actions.toggleWindowByShortcut()
          : () => this.actions[shortcut.action]()
      const ok = globalShortcut.register(accelerator, handler)
      if (ok) {
        this.registered.push(accelerator)
        this.entries.push({ shortcut, registered: true, failure: null })
        return
      }
      this.fail(shortcut)
    } catch (error) {
      this.fail(shortcut, (error as Error).message)
    }
  }

  private fail(shortcut: ShortcutDefinition, detail?: string): void {
    const failure = { wayland: isWayland(), detail: detail ?? null }
    this.entries.push({ shortcut, registered: false, failure })
    console.warn(`[tray] 全局快捷键注册失败：${shortcut.accelerator}（${failureReason(failure)}）`)
  }

  private unregisterShortcuts(): void {
    for (const accelerator of this.registered) {
      try {
        globalShortcut.unregister(accelerator)
      } catch {
        // 退出流程里注销失败不影响结果
      }
    }
    this.registered = []
    this.entries = []
  }

  private createTray(): void {
    try {
      this.tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON_DATA_URL))
      this.buildMenu()
      // 单击托盘图标即切换窗口显示
      this.tray.on('click', () => this.actions.toggleWindow())
    } catch (error) {
      this.tray = null
      this.trayEnabled = false
      console.warn(`[tray] 托盘创建失败：${(error as Error).message}`)
    }
  }

  /** 托盘提示与右键菜单；语言变化后重新调用即可刷新文案 */
  private buildMenu(): void {
    if (!this.tray) return
    this.tray.setToolTip(t('tray.tooltip'))
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('tray.showHide'), click: () => this.actions.toggleWindow() },
        { label: t('tray.search'), click: () => this.actions.openSearch() },
        { label: t('tray.settings'), click: () => this.actions.openSettings() },
        { type: 'separator' },
        { label: t('tray.quit'), click: () => this.actions.quit() }
      ])
    )
  }
}
