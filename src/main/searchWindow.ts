import path from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { IPC } from '../shared/ipc'
import { t } from './i18n'

const isDev = !process.env.NODE_ENV?.includes('production')

/**
 * 搜索窗口尺寸：够放下弹框（结果多时内部滚动），不要占满屏幕。
 * 宽度按「界面放大到最大档（125%）后，过滤行仍然放得下」留的余量。
 */
const SEARCH_WINDOW_WIDTH = 800
/** 初始高度：真正显示时渲染进程会按内容把窗口调成合适高度 */
const SEARCH_WINDOW_HEIGHT = 500
/** 高度范围：至少放得下输入框与过滤行，最多别占满整屏 */
const SEARCH_WINDOW_MIN_HEIGHT = 130
const SEARCH_WINDOW_MAX_HEIGHT = 560

export interface SearchWindowOptions {
  /** 真正退出应用时为 true，"关闭"才不会被改成隐藏 */
  isQuitting: () => boolean
}

/**
 * 独立的搜索窗口。
 *
 * 全局搜索和主界面解耦：默认呼出搜索只显示这个窗口，主界面开不开都不受影响
 * （主界面开着也不会被关掉）。窗口只创建一次，收起只是 hide，
 * 下次呼出不用重新加载页面。
 *
 * 渲染进程用 `location.hash === '#search'` 判断自己是搜索窗口，只渲染搜索弹框。
 */
export class SearchWindow {
  private window: BrowserWindow | null = null
  /** 隐藏期间算好的高度：等下次呼出时再应用，否则这次调整就丢了 */
  private pendingHeight: number | null = null

  constructor(private readonly options: SearchWindowOptions) {}

  /** 显示并聚焦；需要时先创建窗口 */
  show(): BrowserWindow {
    const window = this.prepare()
    // 隐藏期间如果内容变了（比如清空关键字后换成「最近打开」），把当时算好的高度补上
    if (this.pendingHeight !== null) {
      const pending = this.pendingHeight
      this.pendingHeight = null
      const bounds = window.getBounds()
      if (Math.abs(pending - bounds.height) >= 2) {
        window.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: pending })
      }
    }
    window.show()
    window.focus()
    // 每次呼出都让渲染进程重新打开弹框（上次可能是按 Esc 关掉的）
    const open = (): void => window.webContents.send(IPC.eventOpenSearch, { at: Date.now() })
    if (window.webContents.isLoading()) window.webContents.once('did-finish-load', open)
    else open()
    return window
  }

  /**
   * 呼出位置：水平居中、靠近屏幕上方（大约工作区高度的 10%），
   * 后面按内容变高时顶边不动、往下长，所以位置只需要定一次。
   * 用户拖动过之后就一直用拖动后的位置（只在创建窗口时摆位置）。
   */
  private topCenterPosition(width: number): { x: number; y: number } {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const area = display.workArea
    return {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + Math.max(48, area.height * 0.1))
    }
  }

  /** 先创建并加载好页面（启动后预热，第一次呼出不用等） */
  prepare(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window

    const position = this.topCenterPosition(SEARCH_WINDOW_WIDTH)
    const window = new BrowserWindow({
      ...position,
      width: SEARCH_WINDOW_WIDTH,
      height: SEARCH_WINDOW_HEIGHT,
      show: false,
      frame: false,
      /*
       * 透明窗口：面板本身有 8px 圆角，窗口四角保持透明，看起来就是圆角窗口。
       * Windows 的 DWM 不会给无边框窗口加圆角（除非改用原生 API），这样才能和面板一致；
       * 注意不要设不透明的 backgroundColor，否则圆角外会被填成黑/底色。
       */
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: t('svc.searchWindowTitle'),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    })

    // 失焦就收起来：和常见的「呼出式搜索」一致，不会挡着别的窗口
    window.on('blur', () => window.hide())
    window.on('close', (event) => {
      if (this.options.isQuitting()) return
      event.preventDefault()
      window.hide()
    })

    const devServerUrl = process.env.ELECTRON_RENDERER_URL
    if (isDev && devServerUrl) {
      void window.loadURL(`${devServerUrl}#search`)
    } else {
      void window.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'search' })
    }

    this.window = window
    return window
  }

  hide(): void {
    this.window?.hide()
  }

  /**
   * 按内容调整高度（渲染进程量好弹框高度、传 CSS px 进来）：
   * 宽度与顶边不动，往下长 / 往上收，所以窗口像是"贴在上面往下展开"。
   */
  resize(cssHeight: number): void {
    const window = this.window
    if (!window || window.isDestroyed() || !Number.isFinite(cssHeight)) return

    // 界面放大（setZoom）后 CSS px 与窗口 DIP 不是 1:1，这里换回 DIP
    const height = cssHeight * window.webContents.getZoomFactor()
    const target = Math.round(Math.min(SEARCH_WINDOW_MAX_HEIGHT, Math.max(SEARCH_WINDOW_MIN_HEIGHT, height)))
    if (!window.isVisible()) {
      this.pendingHeight = target
      return
    }
    const bounds = window.getBounds()
    // 差 2px 以内不动，免得跟着渲染抖动反复 setBounds
    if (Math.abs(target - bounds.height) < 2) return
    window.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: target })
  }

  get active(): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible())
  }

  destroy(): void {
    this.window?.destroy()
    this.window = null
  }
}
