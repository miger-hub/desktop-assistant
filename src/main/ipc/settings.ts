import { app, BrowserWindow } from 'electron'
import type { AppSettings, SearchNavigation, SearchOptions } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { applyLanguageSetting } from '../i18n'
import { registerHandler } from './handle'

export function registerSettingsIpc(context: AppContext): void {
  const { settings, system, shell, apps } = context

  registerHandler(IPC.settingsGet, () => settings.get())
  registerHandler(IPC.settingsUpdate, (patch: Partial<AppSettings>) => {
    const updated = settings.update(patch)
    // 语言变了：主进程（托盘等）跟着换
    applyLanguageSetting(updated.language, app.getLocale())
    // 托盘 / 全局快捷键跟着设置即时生效，不用重启
    shell.apply(updated)
    // 剪贴板历史条数改小后要立刻裁掉多余的条目
    if (patch.clipboardHistoryLimit !== undefined) context.clipboard.setLimit(updated.clipboardHistoryLimit)
    // 广播给所有窗口：独立搜索窗口没有自己的设置界面，只能靠这条通知跟着换主题 / 缩放
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC.eventSettingsChanged, { at: Date.now() })
    }
    return updated
  })
  registerHandler(IPC.appPaths, () => system.paths())
  registerHandler(IPC.appOpenDataDir, () => system.openDataDir())
  registerHandler(IPC.appOpenUrl, (url: string) => system.openUrl(url))
  registerHandler(IPC.appOpenNoteUrl, (noteId: number, url: string) => system.openNoteUrl(noteId, url))
  registerHandler(IPC.appSearch, (keyword: string, options?: SearchOptions) => system.search(keyword, options))
  registerHandler(IPC.appRecent, (limit?: number) => system.recent(limit))
  registerHandler(IPC.appClearRecent, () => system.clearRecent())
  // 搜索弹框里回车：启动系统里已安装的应用
  registerHandler(IPC.appOpenApplication, (target: string) => apps.open(target))
  // 主界面里的快捷键兜底：呼出搜索（和托盘 / 全局快捷键同一套行为）
  registerHandler(IPC.appShowSearch, () => shell.showSearch())
  // 独立搜索窗口点了需要跳转到主界面的结果
  registerHandler(IPC.appNavigate, (target: SearchNavigation) => shell.navigate(target))
  registerHandler(IPC.appHideSearch, () => shell.hideSearch())
  // 独立搜索窗口按内容调整高度
  registerHandler(IPC.appResizeSearch, (height: number) => shell.resizeSearch(height))
  registerHandler(IPC.appInfo, () => system.info(shell.shortcutStatus()))
  registerHandler(IPC.appRecheckShortcuts, () => shell.recheckShortcuts())
  registerHandler(IPC.appBackupDatabase, () => system.backupDatabase())
  registerHandler(IPC.appOpenBackupDir, () => system.openBackupDir())
  registerHandler(IPC.appExportTodos, () => system.exportTodos())
}
