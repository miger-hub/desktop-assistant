import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

/** 自定义标题栏需要的窗口控制（无系统边框窗口） */
export function registerWindowIpc(context: AppContext): void {
  const { system, shell } = context

  registerHandler(IPC.windowMinimize, () => system.minimizeWindow())
  registerHandler(IPC.windowToggleMaximize, () => system.toggleMaximizeWindow())
  // 应用内兜底：全局快捷键不可用时（Wayland、被占用）仍然能隐藏 / 显示窗口
  registerHandler(IPC.windowToggle, () => shell.toggleWindow())
  registerHandler(IPC.windowClose, () => system.closeWindow())
  registerHandler(IPC.windowIsMaximized, () => system.isWindowMaximized())
  registerHandler(IPC.windowSetZoom, (factor: number) => system.setWindowZoom(factor))
}
