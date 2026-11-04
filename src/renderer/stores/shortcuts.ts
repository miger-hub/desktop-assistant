import { computed, reactive } from 'vue'
import type { Shortcut, ShortcutInput } from '@shared/types'
import { t } from '../i18n'
import { useUi } from './ui'

const state = reactive({
  items: [] as Shortcut[],
  loading: false
})

const paths = computed(() => new Set(state.items.map((item) => item.path).filter((path): path is string => path !== null)))

async function load(): Promise<void> {
  state.loading = true
  try {
    state.items = await window.desktop.shortcut.list()
  } catch (error) {
    useUi().handleError(error, t('error.readShortcuts'))
  } finally {
    state.loading = false
  }
}

/** 置顶：已在列表里时提示一下，不当成错误 */
async function add(input: ShortcutInput): Promise<boolean> {
  try {
    await window.desktop.shortcut.add(input)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.pin'))
    return false
  }
}

async function remove(id: number): Promise<boolean> {
  try {
    await window.desktop.shortcut.remove(id)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.removeShortcut'))
    return false
  }
}

export function useShortcuts() {
  return {
    state,
    paths,
    load,
    add,
    remove,
    /** 这个路径是不是已经置顶（文件列表按钮据此禁用） */
    hasPath: (path: string): boolean => paths.value.has(path),
    hasWorkspace: (workspaceId: number): boolean =>
      state.items.some((item) => item.kind === 'workspace' && item.workspaceId === workspaceId)
  }
}
