import path from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { IPC } from '../shared/ipc'

const isDev = !process.env.NODE_ENV?.includes('production')

export interface MainWindowOptions {
  /** 返回 true 时把「关闭」变成「隐藏到托盘」 */
  hideOnClose?: () => boolean
}

export function createMainWindow(options: MainWindowOptions = {}): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111318',
    title: 'Desktop Assistant',
    // 无系统边框：窗口拖动与最小化 / 最大化 / 关闭由渲染进程的自定义标题栏负责
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // 渲染进程不直接拥有 Node 权限
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  window.once('ready-to-show', () => window.show())

  // 窗口不再显示（收进托盘 / 全局快捷键隐藏 / 最小化）时告诉渲染进程，
  // 设置里可选是否顺手收起搜索弹框
  const notifyHidden = (): void => {
    window.webContents.send(IPC.eventWindowHidden, { at: Date.now() })
  }
  window.on('hide', notifyHidden)
  window.on('minimize', notifyHidden)

  // 开启系统托盘时，点关闭只是把窗口收起来；退出走托盘菜单
  window.on('close', (event) => {
    if (!options.hideOnClose?.()) return
    event.preventDefault()
    window.hide()
  })

  // 外部链接交给系统浏览器，不在应用内打开
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return window
}
