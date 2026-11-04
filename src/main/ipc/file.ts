import type {
  ListFilesOptions,
  RemoveOptions,
  RenameEntry,
  SaveTextOptions,
  TransferOptions
} from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

export function registerFileIpc(context: AppContext): void {
  const { files, operations } = context

  /** 移动 / 重命名成功后写一条操作历史，供「撤销」使用 */
  const remember = (
    kind: 'move' | 'rename',
    entries: Array<{ source: string; target: string }> | undefined
  ): void => {
    operations.record({ entries: entries ?? [], kind, origin: 'manual' })
  }

  registerHandler(IPC.fileList, (target: string, options?: ListFilesOptions) => files.list(target, options))
  registerHandler(IPC.fileStat, (target: string) => files.stat(target))
  registerHandler(IPC.fileExists, (target: string) => files.exists(target))
  registerHandler(IPC.fileMove, async (source: string, target: string, options?: TransferOptions) => {
    const item = await files.move(source, target, options)
    remember('move', [{ source, target: item.path }])
    return item
  })
  registerHandler(IPC.fileCopy, (source: string, target: string, options?: TransferOptions) =>
    files.copy(source, target, options)
  )
  registerHandler(IPC.fileRename, async (target: string, name: string, options?: TransferOptions) => {
    const item = await files.rename(target, name, options)
    remember('rename', [{ source: target, target: item.path }])
    return item
  })
  registerHandler(IPC.fileRenameMany, async (entries: RenameEntry[], options?: TransferOptions) => {
    const result = await files.renameMany(entries, options)
    remember('rename', result.entries)
    return result
  })
  registerHandler(IPC.fileRemove, (targets: string[], options?: RemoveOptions) =>
    options?.permanent ? files.remove(targets) : context.system.trash(targets)
  )
  registerHandler(IPC.fileCreateDirectory, (parentPath: string, name: string) => files.createDirectory(parentPath, name))
  registerHandler(IPC.fileMoveInto, async (paths: string[], targetDirectory: string, options?: TransferOptions) => {
    const result = await files.moveIntoMany(paths, targetDirectory, options)
    remember('move', result.entries)
    return result
  })
  registerHandler(IPC.fileParent, (target: string) => files.parentOf(target))
  registerHandler(IPC.fileSplitPath, (root: string, target: string) => files.splitPath(root, target))
  registerHandler(IPC.fileOpen, (target: string) => context.system.openPath(target))
  registerHandler(IPC.fileSaveText, (options: SaveTextOptions) => context.system.saveText(options))
  registerHandler(IPC.fileReveal, (target: string) => context.system.revealPath(target))
  registerHandler(IPC.filePickDirectory, (options?: { title?: string }) => context.system.pickDirectory(options))
  registerHandler(IPC.filePickFiles, (options?: { title?: string }) => context.system.pickFiles(options))
  registerHandler(IPC.fileWatch, (target: string) => context.system.watchDirectory(target))
  registerHandler(IPC.fileUnwatch, (target: string) => context.system.unwatchDirectory(target))
}
