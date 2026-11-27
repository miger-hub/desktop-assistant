import { reactive } from 'vue'
import type {
  NoteDocument,
  NoteDocumentCreateInput,
  NoteDocumentPatch,
  NoteDocumentTree
} from '@shared/types'
import { t } from '../i18n'
import { useUi } from './ui'

const state = reactive({
  tree: { folders: [], notes: [] } as NoteDocumentTree,
  current: null as NoteDocument | null,
  loading: false,
  opening: false,
  saving: false,
  dirty: false,
  tab: 'documents' as 'documents' | 'memo',
  /** 从全局搜索跳转过来的笔记路径 */
  focusPath: null as string | null
})

let openSequence = 0

async function loadTree(): Promise<void> {
  state.loading = true
  try {
    state.tree = await window.desktop.noteDocs.tree()
    if (state.current && !state.tree.notes.some((note) => note.path === state.current?.path)) {
      state.current = null
    }
  } catch (error) {
    useUi().handleError(error, t('error.readNoteDocs'))
  } finally {
    state.loading = false
  }
}

async function open(path: string): Promise<NoteDocument | null> {
  const sequence = ++openSequence
  state.opening = true
  try {
    const document = await window.desktop.noteDocs.read(path)
    if (sequence !== openSequence) return null
    state.current = document
    state.dirty = false
    return document
  } catch (error) {
    if (sequence === openSequence) useUi().handleError(error, t('error.readNoteDocs'))
    return null
  } finally {
    if (sequence === openSequence) state.opening = false
  }
}

async function create(input: NoteDocumentCreateInput): Promise<NoteDocument | null> {
  try {
    const document = await window.desktop.noteDocs.create(input)
    await loadTree()
    state.current = document
    state.dirty = false
    return document
  } catch (error) {
    useUi().handleError(error, t('error.createNoteDoc'))
    return null
  }
}

async function save(path: string, patch: NoteDocumentPatch): Promise<NoteDocument | null> {
  state.saving = true
  try {
    const document = await window.desktop.noteDocs.save(path, patch)
    state.current = document
    state.dirty = false
    await loadTree()
    return document
  } catch (error) {
    useUi().handleError(error, t('error.saveNoteDoc'))
    return null
  } finally {
    state.saving = false
  }
}

async function remove(path: string): Promise<boolean> {
  try {
    await window.desktop.noteDocs.remove(path)
    if (state.current?.path === path) {
      state.current = null
      state.dirty = false
    }
    await loadTree()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.removeNoteDoc'))
    return false
  }
}

export function useNoteDocuments() {
  return {
    state,
    loadTree,
    open,
    create,
    save,
    remove,
    focus: (path: string) => {
      state.focusPath = path
      state.tab = 'documents'
    },
    showMemo: () => {
      state.tab = 'memo'
    },
    showDocuments: () => {
      state.tab = 'documents'
    }
  }
}
