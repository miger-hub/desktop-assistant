import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, GlobalShortcutStatus } from '../src/shared/types'
import { DEFAULT_SHORTCUTS } from '../src/shared/accelerator'

/**
 * TrayService 直接依赖 electron，这里把 globalShortcut 换成可编程的替身，
 * 只测「注册结果怎么记录」——启动时的冲突提示就是靠它。
 */
const electron = vi.hoisted(() => ({
  register: vi.fn<(accelerator: string, handler: () => void) => boolean>(),
  unregister: vi.fn(),
  isRegistered: vi.fn(),
  menuTemplate: [] as Array<{ label?: string; type?: string; click?: () => void }>
}))

vi.mock('electron', () => ({
  globalShortcut: {
    register: electron.register,
    unregister: electron.unregister,
    isRegistered: electron.isRegistered
  },
  Tray: class {
    setToolTip(): void {}
    setContextMenu(): void {}
    on(): void {}
    destroy(): void {}
  },
  Menu: {
    buildFromTemplate: (template: Array<{ label?: string; type?: string; click?: () => void }>) => {
      electron.menuTemplate = template
      return {}
    }
  },
  nativeImage: { createFromDataURL: () => ({}) }
}))

const { OPEN_SEARCH_ACCELERATOR, TOGGLE_WINDOW_ACCELERATOR, TrayService } = await import(
  '../src/main/services/TrayService'
)

type TraySettings = Pick<
  AppSettings,
  'trayEnabled' | 'globalShortcutsEnabled' | 'toggleShortcut' | 'searchShortcut'
>

/** TrayService.apply 需要的设置片段 */
function traySettings(overrides: Partial<TraySettings> = {}): TraySettings {
  return {
    trayEnabled: false,
    globalShortcutsEnabled: true,
    toggleShortcut: DEFAULT_SHORTCUTS.toggle,
    searchShortcut: DEFAULT_SHORTCUTS.search,
    ...overrides
  }
}

function createService() {
  const actions = {
    toggleWindow: vi.fn(),
    toggleWindowByShortcut: vi.fn(),
    openSearch: vi.fn(),
    openSettings: vi.fn(),
    quit: vi.fn()
  }
  const service = new TrayService(actions)
  service.apply(traySettings())
  return { actions, service }
}

function failed(status: GlobalShortcutStatus): string[] {
  return status.entries.filter((entry) => !entry.registered).map((entry) => entry.accelerator)
}

describe('TrayService 全局快捷键', () => {
beforeEach(() => {
  electron.register.mockReset()
  electron.unregister.mockReset()
  electron.isRegistered.mockReset()
  electron.menuTemplate = []
})

  it('全部注册成功时状态里没有失败项', () => {
    electron.register.mockReturnValue(true)
    const { service } = createService()

    const status = service.shortcutStatus
    expect(status.enabled).toBe(true)
    expect(status.entries).toHaveLength(2)
    expect(status.entries.every((entry) => entry.registered && entry.reason === null)).toBe(true)
    expect(failed(status)).toEqual([])
    expect(electron.register).toHaveBeenCalledWith(TOGGLE_WINDOW_ACCELERATOR, expect.any(Function))
    expect(electron.register).toHaveBeenCalledWith(OPEN_SEARCH_ACCELERATOR, expect.any(Function))
  })

  it('注册失败（被占用 / 环境不支持）时记录原因，另一个仍然注册', () => {
    electron.register.mockImplementation((accelerator) => accelerator !== TOGGLE_WINDOW_ACCELERATOR)
    const { service } = createService()

    const status = service.shortcutStatus
    expect(failed(status)).toEqual([TOGGLE_WINDOW_ACCELERATOR])
    const entry = status.entries.find((item) => item.accelerator === TOGGLE_WINDOW_ACCELERATOR)
    expect(entry).toMatchObject({ keys: 'Ctrl/Cmd + Alt + A', action: '显示 / 隐藏窗口' })
    expect(entry?.reason).toBeTruthy()
    expect(status.entries.find((item) => item.accelerator === OPEN_SEARCH_ACCELERATOR)?.registered).toBe(true)
  })

  it('register 抛异常时把错误信息写进原因', () => {
    electron.register.mockImplementation((accelerator) => {
      if (accelerator === OPEN_SEARCH_ACCELERATOR) throw new Error('Wayland 不支持')
      return true
    })
    const { service } = createService()

    const entry = service.shortcutStatus.entries.find((item) => item.accelerator === OPEN_SEARCH_ACCELERATOR)
    expect(entry?.registered).toBe(false)
    expect(entry?.reason).toContain('Wayland 不支持')
  })

  it('重新检测会先注销再注册，用户清掉冲突后能恢复', () => {
    electron.register.mockReturnValue(false)
    const { service } = createService()
    expect(failed(service.shortcutStatus)).toHaveLength(2)

    electron.register.mockReturnValue(true)
    const status = service.recheckShortcuts()

    expect(failed(status)).toEqual([])
    // 第一次注册全部失败，没有需要注销的；重检测只重新注册
    expect(electron.register).toHaveBeenCalledTimes(4)
  })

  it('关掉开关后注销已注册的快捷键，状态为空', () => {
    electron.register.mockReturnValue(true)
    const { service } = createService()

    service.apply(traySettings({ globalShortcutsEnabled: false }))
    const status = service.shortcutStatus

    expect(status).toEqual({ enabled: false, entries: [] })
    expect(electron.unregister).toHaveBeenCalledWith(TOGGLE_WINDOW_ACCELERATOR)
    expect(electron.unregister).toHaveBeenCalledWith(OPEN_SEARCH_ACCELERATOR)
  })

  it('注册成功后的回调调用对应的窗口动作', () => {
    const handlers = new Map<string, () => void>()
    electron.register.mockImplementation((accelerator, handler) => {
      handlers.set(accelerator, handler)
      return true
    })
    const { actions } = createService()

    handlers.get(TOGGLE_WINDOW_ACCELERATOR)?.()
    handlers.get(OPEN_SEARCH_ACCELERATOR)?.()

    expect(actions.toggleWindowByShortcut).toHaveBeenCalledTimes(1)
    expect(actions.openSearch).toHaveBeenCalledTimes(1)
  })

  it('快捷键改掉后按新按键重新注册，状态里也是新按键', () => {
    electron.register.mockReturnValue(true)
    const { service } = createService()
    expect(electron.register).toHaveBeenCalledWith(DEFAULT_SHORTCUTS.toggle, expect.any(Function))

    electron.register.mockClear()
    service.apply(traySettings({ toggleShortcut: 'Control+Shift+T' }))

    expect(electron.unregister).toHaveBeenCalledWith(DEFAULT_SHORTCUTS.toggle)
    expect(electron.register).toHaveBeenCalledWith('Control+Shift+T', expect.any(Function))
    expect(service.shortcutStatus.entries[0]).toMatchObject({
      accelerator: 'Control+Shift+T',
      keys: 'Ctrl + Shift + T',
      registered: true
    })
  })

  it('托盘菜单里有「设置…」，点击后通知主进程跳到设置页', () => {
    electron.register.mockReturnValue(true)
    const { actions, service } = createService()

    service.apply(traySettings({ trayEnabled: true }))
    const menuLabels = electron.menuTemplate.map((item) => item.label ?? item.type)
    // 托盘菜单文案走 i18n，默认语言是简体中文
    expect(menuLabels).toEqual(['显示 / 隐藏窗口', '搜索', '设置…', 'separator', '退出'])

    electron.menuTemplate.find((item) => item.label === '设置…')?.click?.()
    expect(actions.openSettings).toHaveBeenCalledTimes(1)

    electron.menuTemplate.find((item) => item.label === '搜索')?.click?.()
    expect(actions.openSearch).toHaveBeenCalledTimes(1)
  })

  describe('canRestoreWindow：隐藏之后还能不能把窗口显示回来', () => {
    it('全局快捷键注册成功时算有唤回方式', () => {
      electron.register.mockReturnValue(true)
      const { service } = createService()

      expect(service.canRestoreWindow()).toBe(true)
    })

    it('关掉全局快捷键又没开托盘时没有唤回方式（隐藏就等于失联）', () => {
      electron.register.mockReturnValue(false)
      const { service } = createService()

      expect(service.canRestoreWindow()).toBe(false)
    })

    it('即使开了开关，一个都没注册上时也不算有唤回方式', () => {
      electron.register.mockReturnValue(false)
      const { service } = createService()
      // 开关开着，但注册全部失败（Wayland 没有 portal / 被别的程序占用）
      service.apply(traySettings({ globalShortcutsEnabled: true, toggleShortcut: 'Control+Shift+T' }))

      expect(service.canRestoreWindow()).toBe(false)
    })

    it('托盘可用时算有唤回方式，和快捷键无关', () => {
      electron.register.mockReturnValue(false)
      const { service } = createService()

      service.apply(traySettings({ trayEnabled: true, globalShortcutsEnabled: false }))

      expect(service.canRestoreWindow()).toBe(true)
    })
  })
})
