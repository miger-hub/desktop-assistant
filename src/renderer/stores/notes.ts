import { reactive } from 'vue'
import type { Note, NoteInput, NotePatch } from '@shared/types'
import { t } from '../i18n'
import { useUi } from './ui'

const state = reactive({
  items: [] as Note[],
  loading: false,
  /** 由全局搜索发起的定位请求（高亮这条备忘） */
  focusId: null as number | null
})

async function load(): Promise<void> {
  state.loading = true
  try {
    state.items = await window.desktop.note.list()
  } catch (error) {
    useUi().handleError(error, t('error.readNotes'))
  } finally {
    state.loading = false
  }
}

async function create(input: NoteInput): Promise<boolean> {
  try {
    await window.desktop.note.create(input)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.createNote'))
    return false
  }
}

async function update(id: number, patch: NotePatch): Promise<boolean> {
  try {
    await window.desktop.note.update(id, patch)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.saveNote'))
    return false
  }
}

async function remove(id: number): Promise<boolean> {
  try {
    await window.desktop.note.remove(id)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.removeNote'))
    return false
  }
}

export function useNotes() {
  return {
    state,
    load,
    create,
    update,
    remove,
    /** 从搜索结果跳过来：定位到这条备忘 */
    focus: (id: number) => {
      state.focusId = id
    }
  }
}
