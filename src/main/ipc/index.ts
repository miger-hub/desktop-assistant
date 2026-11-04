import type { AppContext } from '../context'
import { registerClipboardIpc } from './clipboard'
import { registerFileIpc } from './file'
import { registerNoteIpc } from './note'
import { registerPluginIpc } from './plugin'
import { registerRuleIpc } from './rule'
import { registerSettingsIpc } from './settings'
import { registerShortcutIpc } from './shortcut'
import { registerTodoIpc } from './todo'
import { registerWindowIpc } from './window'
import { registerWorkspaceIpc } from './workspace'

export function registerIpc(context: AppContext): void {
  registerFileIpc(context)
  registerWorkspaceIpc(context)
  registerTodoIpc(context)
  registerRuleIpc(context)
  registerShortcutIpc(context)
  registerClipboardIpc(context)
  registerNoteIpc(context)
  registerPluginIpc(context)
  registerSettingsIpc(context)
  registerWindowIpc(context)
}
