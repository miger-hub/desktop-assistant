import { BrowserWindow, dialog } from 'electron'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { t } from '../i18n'
import { registerHandler } from './handle'

function parentWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

async function pickFolder(): Promise<string | null> {
  const window = parentWindow()
  const options: Electron.OpenDialogOptions = {
    title: t('plugin.pickFolderTitle'),
    properties: ['openDirectory']
  }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths[0] ?? null
}

async function pickZip(): Promise<string | null> {
  const window = parentWindow()
  const options: Electron.OpenDialogOptions = {
    title: t('plugin.pickZipTitle'),
    properties: ['openFile'],
    filters: [{ name: 'Zip', extensions: ['zip'] }]
  }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths[0] ?? null
}

/** 插件安装 / 管理：所有安装内容都复制到 userData/plugins 下 */
export function registerPluginIpc(context: AppContext): void {
  const { plugins } = context

  registerHandler(IPC.pluginList, () => plugins.listDescriptors())
  registerHandler(IPC.pluginInstallFolder, async () => {
    const folder = await pickFolder()
    return folder ? plugins.installFromFolder(folder) : null
  })
  registerHandler(IPC.pluginInstallZip, async () => {
    const file = await pickZip()
    return file ? plugins.installFromZip(file) : null
  })
  registerHandler(IPC.pluginSetEnabled, (id: string, enabled: boolean) => plugins.setEnabled(id, enabled))
  registerHandler(IPC.pluginUninstall, (id: string) => plugins.uninstall(id))
  registerHandler(IPC.pluginEntrySource, (id: string) => plugins.entrySource(id))
}
