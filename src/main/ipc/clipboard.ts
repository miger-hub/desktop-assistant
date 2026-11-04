import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

/** 剪贴板历史：读取 / 再次复制 / 删除 / 清空 */
export function registerClipboardIpc(context: AppContext): void {
  const { clipboard } = context

  registerHandler(IPC.clipboardList, () => clipboard.list())
  registerHandler(IPC.clipboardReadText, () => clipboard.readText())
  registerHandler(IPC.clipboardCopy, (id: number) => clipboard.copy(id))
  registerHandler(IPC.clipboardRemove, (id: number) => clipboard.remove(id))
  registerHandler(IPC.clipboardClear, () => clipboard.clear())
}
