import type { NoteInput, NotePatch } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

export function registerNoteIpc(context: AppContext): void {
  const { notes } = context

  registerHandler(IPC.noteList, () => notes.list())
  registerHandler(IPC.noteCreate, (input: NoteInput) => notes.create(input))
  registerHandler(IPC.noteUpdate, (id: number, patch: NotePatch) => notes.update(id, patch))
  registerHandler(IPC.noteRemove, (id: number) => notes.remove(id))
  registerHandler(IPC.noteMarkLinkUsed, (id: number) => notes.markLinkUsed(id))
}
