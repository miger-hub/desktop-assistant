import type { ShortcutInput } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

export function registerShortcutIpc(context: AppContext): void {
  const { shortcuts } = context

  registerHandler(IPC.shortcutList, () => shortcuts.list())
  registerHandler(IPC.shortcutAdd, (input: ShortcutInput) => shortcuts.add(input))
  registerHandler(IPC.shortcutRemove, (id: number) => shortcuts.remove(id))
}
