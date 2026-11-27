import type {
  NoteDocumentCreateInput,
  NoteDocumentPatch,
  NoteInput,
  NotePatch
} from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { ServiceError } from '../errors'
import { registerHandler } from './handle'

export function registerNoteIpc(context: AppContext): void {
  const { notes, noteDocs, system } = context

  const trashOne = async (path: string): Promise<void> => {
    const result = await system.trash([path])
    const failure = result.failed[0]
    if (failure) throw new ServiceError('IO_ERROR', failure.message)
  }

  registerHandler(IPC.noteList, () => notes.list())
  registerHandler(IPC.noteCreate, (input: NoteInput) => notes.create(input))
  registerHandler(IPC.noteUpdate, (id: number, patch: NotePatch) => notes.update(id, patch))
  registerHandler(IPC.noteRemove, (id: number) => notes.remove(id))
  registerHandler(IPC.noteMarkLinkUsed, (id: number) => notes.markLinkUsed(id))

  registerHandler(IPC.noteDocumentTree, () => noteDocs.list())
  registerHandler(IPC.noteDocumentRead, (path: string) => noteDocs.read(path))
  registerHandler(IPC.noteDocumentCreate, (input: NoteDocumentCreateInput) => noteDocs.create(input))
  registerHandler(IPC.noteDocumentSave, (path: string, patch: NoteDocumentPatch) => noteDocs.save(path, patch))
  registerHandler(IPC.noteDocumentRemove, async (path: string) => {
    await trashOne(noteDocs.absolutePath(path, 'note'))
  })
  registerHandler(IPC.noteDocumentCreateFolder, async (parentPath: string, name: string) => {
    await noteDocs.createFolder(parentPath, name)
  })
  registerHandler(IPC.noteDocumentRenameFolder, async (path: string, name: string) => {
    return (await noteDocs.renameFolder(path, name)).path
  })
  registerHandler(IPC.noteDocumentRemoveFolder, async (path: string) => {
    await trashOne(noteDocs.absolutePath(path, 'folder'))
  })
  registerHandler(IPC.noteDocumentUploadAsset, (path: string, fileName: string, data: ArrayBuffer | Uint8Array) =>
    noteDocs.uploadAsset(path, fileName, data)
  )
  registerHandler(IPC.noteDocumentReveal, (path: string) => system.revealPath(noteDocs.revealPath(path)))
}
