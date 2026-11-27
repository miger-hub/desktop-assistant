import { ipcRenderer, webUtils } from 'electron'
import type { DesktopApi } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import type { Result, SearchNavigation } from '../shared/types'

/** 把主进程的 Result 信封还原成异常，渲染进程只看到普通错误对象 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (result?.ok) return result.data

  const error = new Error(result?.error?.message ?? '操作失败') as Error & { code?: string }
  error.code = result?.error?.code ?? 'UNKNOWN'
  throw error
}

/**
 * 业务化 API：渲染进程不接触 ipcRenderer，也不接触 fs / sqlite。
 */
export function createApi(): DesktopApi {
  return {
    files: {
      list: (path, options) => call(IPC.fileList, path, options),
      stat: (path) => call(IPC.fileStat, path),
      exists: (path) => call(IPC.fileExists, path),
      move: (source, target, options) => call(IPC.fileMove, source, target, options),
      copy: (source, target, options) => call(IPC.fileCopy, source, target, options),
      rename: (path, name, options) => call(IPC.fileRename, path, name, options),
      renameMany: (entries, options) => call(IPC.fileRenameMany, entries, options),
      remove: (paths, options) => call(IPC.fileRemove, paths, options),
      createDirectory: (parentPath, name) => call(IPC.fileCreateDirectory, parentPath, name),
      moveInto: (paths, targetDirectory, options) => call(IPC.fileMoveInto, paths, targetDirectory, options),
      parent: (path) => call(IPC.fileParent, path),
      splitPath: (root, target) => call(IPC.fileSplitPath, root, target),
      open: (path, options) => call(IPC.fileOpen, path, options),
      saveText: (options) => call(IPC.fileSaveText, options),
      reveal: (path) => call(IPC.fileReveal, path),
      pickDirectory: (options) => call(IPC.filePickDirectory, options),
      pickFiles: (options) => call(IPC.filePickFiles, options),
      watch: (path) => call(IPC.fileWatch, path),
      unwatch: (path) => call(IPC.fileUnwatch, path),
      onDirectoryChanged: (listener) => {
        const handler = (_event: unknown, payload: { path: string; at: number }): void => listener(payload)
        ipcRenderer.on(IPC.eventFileChanged, handler)
        return () => ipcRenderer.removeListener(IPC.eventFileChanged, handler)
      }
    },
    workspace: {
      list: () => call(IPC.workspaceList),
      create: (input) => call(IPC.workspaceCreate, input),
      update: (id, patch) => call(IPC.workspaceUpdate, id, patch),
      remove: (id) => call(IPC.workspaceRemove, id),
      reorder: (ids) => call(IPC.workspaceReorder, ids),
      addDirectory: (workspaceId, path, name) => call(IPC.workspaceAddDirectory, workspaceId, path, name),
      removeDirectory: (mappingId) => call(IPC.workspaceRemoveDirectory, mappingId)
    },
    todo: {
      list: (filter) => call(IPC.todoList, filter ?? {}),
      create: (input) => call(IPC.todoCreate, input),
      update: (id, patch) => call(IPC.todoUpdate, id, patch),
      remove: (id) => call(IPC.todoRemove, id)
    },
    rule: {
      list: () => call(IPC.ruleList),
      create: (input) => call(IPC.ruleCreate, input),
      update: (id, patch) => call(IPC.ruleUpdate, id, patch),
      remove: (id) => call(IPC.ruleRemove, id),
      preview: (ids) => call(IPC.rulePreview, ids),
      apply: (ids) => call(IPC.ruleApply, ids)
    },
    shortcut: {
      list: () => call(IPC.shortcutList),
      add: (input) => call(IPC.shortcutAdd, input),
      remove: (id) => call(IPC.shortcutRemove, id)
    },
    home: {
      list: () => call(IPC.homeShortcutList),
      add: (input) => call(IPC.homeShortcutAdd, input),
      remove: (id) => call(IPC.homeShortcutRemove, id)
    },
    workLog: {
      list: (startDate, endDate) => call(IPC.workLogList, startDate, endDate),
      save: (date, draft) => call(IPC.workLogSave, date, draft),
      exportWeek: (startDate, endDate) => call(IPC.workLogExportWeek, startDate, endDate),
      exportWeekText: (startDate, endDate) => call(IPC.workLogExportWeekText, startDate, endDate),
      copyWeekText: (startDate, endDate) => call(IPC.workLogCopyWeekText, startDate, endDate)
    },
    clipboard: {
      list: () => call(IPC.clipboardList),
      readText: () => call(IPC.clipboardReadText),
      copy: (id) => call(IPC.clipboardCopy, id),
      remove: (id) => call(IPC.clipboardRemove, id),
      clear: () => call(IPC.clipboardClear),
      onChanged: (listener) => {
        const handler = (): void => listener()
        ipcRenderer.on(IPC.eventClipboardChanged, handler)
        return () => ipcRenderer.removeListener(IPC.eventClipboardChanged, handler)
      }
    },
    note: {
      list: () => call(IPC.noteList),
      create: (input) => call(IPC.noteCreate, input),
      update: (id, patch) => call(IPC.noteUpdate, id, patch),
      remove: (id) => call(IPC.noteRemove, id),
      markLinkUsed: (id) => call(IPC.noteMarkLinkUsed, id),
      onLinkUsed: (listener) => {
        const handler = (): void => listener()
        ipcRenderer.on(IPC.eventNoteLinkUsed, handler)
        return () => ipcRenderer.removeListener(IPC.eventNoteLinkUsed, handler)
      }
    },
    noteDocs: {
      tree: () => call(IPC.noteDocumentTree),
      read: (path) => call(IPC.noteDocumentRead, path),
      create: (input) => call(IPC.noteDocumentCreate, input),
      save: (path, patch) => call(IPC.noteDocumentSave, path, patch),
      remove: (path) => call(IPC.noteDocumentRemove, path),
      createFolder: (parentPath, name) => call(IPC.noteDocumentCreateFolder, parentPath, name),
      renameFolder: (path, name) => call(IPC.noteDocumentRenameFolder, path, name),
      removeFolder: (path) => call(IPC.noteDocumentRemoveFolder, path),
      uploadAsset: (path, fileName, data) => call(IPC.noteDocumentUploadAsset, path, fileName, data),
      reveal: (path) => call(IPC.noteDocumentReveal, path)
    },
    plugins: {
      list: () => call(IPC.pluginList),
      installFolder: () => call(IPC.pluginInstallFolder),
      installZip: () => call(IPC.pluginInstallZip),
      setEnabled: (id, enabled) => call(IPC.pluginSetEnabled, id, enabled),
      uninstall: (id) => call(IPC.pluginUninstall, id),
      entrySource: (id) => call(IPC.pluginEntrySource, id),
      onChanged: (listener) => {
        const handler = (): void => listener()
        ipcRenderer.on(IPC.eventPluginChanged, handler)
        return () => ipcRenderer.removeListener(IPC.eventPluginChanged, handler)
      }
    },
    operations: {
      list: (limit) => call(IPC.operationList, limit),
      undoLast: () => call(IPC.operationUndoLast),
      undo: (batchId) => call(IPC.operationUndo, batchId)
    },
    settings: {
      get: () => call(IPC.settingsGet),
      update: (patch) => call(IPC.settingsUpdate, patch)
    },
    system: {
      paths: () => call(IPC.appPaths),
      openDataDir: () => call(IPC.appOpenDataDir),
      openUrl: (url) => call(IPC.appOpenUrl, url),
      openNoteUrl: (noteId, url) => call(IPC.appOpenNoteUrl, noteId, url),
      search: (keyword, options) => call(IPC.appSearch, keyword, options),
      recent: (limit) => call(IPC.appRecent, limit),
      clearRecent: () => call(IPC.appClearRecent),
      onOpenSearch: (listener) => {
        const handler = (): void => listener()
        ipcRenderer.on(IPC.eventOpenSearch, handler)
        return () => ipcRenderer.removeListener(IPC.eventOpenSearch, handler)
      },
      onOpenSettings: (listener) => {
        const handler = (): void => listener()
        ipcRenderer.on(IPC.eventOpenSettings, handler)
        return () => ipcRenderer.removeListener(IPC.eventOpenSettings, handler)
      },
      info: () => call(IPC.appInfo),
      recheckShortcuts: () => call(IPC.appRecheckShortcuts),
      backupDatabase: () => call(IPC.appBackupDatabase),
      openBackupDir: () => call(IPC.appOpenBackupDir),
      exportTodos: () => call(IPC.appExportTodos),
      showSearch: () => call(IPC.appShowSearch),
      navigate: (target) => call(IPC.appNavigate, target),
      hideSearch: () => call(IPC.appHideSearch),
      resizeSearch: (height) => call(IPC.appResizeSearch, height),
      onSettingsChanged: (listener) => {
        const handler = (): void => listener()
        ipcRenderer.on(IPC.eventSettingsChanged, handler)
        return () => ipcRenderer.removeListener(IPC.eventSettingsChanged, handler)
      },
      onNavigate: (listener) => {
        const handler = (_event: unknown, payload: SearchNavigation): void => listener(payload)
        ipcRenderer.on(IPC.eventNavigate, handler)
        return () => ipcRenderer.removeListener(IPC.eventNavigate, handler)
      },
      // 拖拽文件时取系统路径；webUtils 留在 preload，不暴露 Node 能力
      getPathForFile: (file) => webUtils.getPathForFile(file)
    },
    apps: {
      list: () => call(IPC.appListApplications),
      open: (target) => call(IPC.appOpenApplication, target)
    },
    window: {
      minimize: () => call(IPC.windowMinimize),
      toggleMaximize: () => call(IPC.windowToggleMaximize),
      toggle: () => call(IPC.windowToggle),
      close: () => call(IPC.windowClose),
      isMaximized: () => call(IPC.windowIsMaximized),
      setZoom: (factor) => call(IPC.windowSetZoom, factor),
      zoomBy: (delta) => call(IPC.windowZoomBy, delta),
      onHidden: (listener) => {
        const handler = (): void => listener()
        ipcRenderer.on(IPC.eventWindowHidden, handler)
        return () => ipcRenderer.removeListener(IPC.eventWindowHidden, handler)
      }
    }
  }
}
