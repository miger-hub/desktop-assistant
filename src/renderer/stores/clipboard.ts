import { reactive } from 'vue'
import type { ClipboardEntry } from '@shared/types'
import { t } from '../i18n'
import { useUi } from './ui'

const state = reactive({
  items: [] as ClipboardEntry[],
  loading: false
})

async function load(): Promise<void> {
  state.loading = true
  try {
    state.items = await window.desktop.clipboard.list()
  } catch (error) {
    useUi().handleError(error, t('error.readClipboard'))
  } finally {
    state.loading = false
  }
}

/** 再次复制：主进程把它写回系统剪贴板，并提到历史最前 */
async function copy(id: number): Promise<void> {
  try {
    await window.desktop.clipboard.copy(id)
    await load()
    useUi().toast(t('toast.copiedClipboard'), 'success')
  } catch (error) {
    useUi().handleError(error, t('error.copy'))
  }
}

async function remove(id: number): Promise<void> {
  try {
    await window.desktop.clipboard.remove(id)
    await load()
  } catch (error) {
    useUi().handleError(error, t('error.removeItem'))
  }
}

async function clear(): Promise<void> {
  try {
    await window.desktop.clipboard.clear()
    await load()
    useUi().toast(t('toast.clipboardCleared'), 'success')
  } catch (error) {
    useUi().handleError(error, t('error.clearClipboard'))
  }
}

/** 订阅主进程的「历史有变化」，返回取消订阅的函数 */
function subscribe(listener: () => void): () => void {
  return window.desktop.clipboard.onChanged(listener)
}

export function useClipboard() {
  return { state, load, copy, remove, clear, subscribe }
}
