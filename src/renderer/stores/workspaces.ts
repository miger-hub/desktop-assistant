import { computed, reactive } from 'vue'
import type { WorkspaceDetail } from '@shared/types'
import { t } from '../i18n'
import { useUi } from './ui'

const state = reactive({
  items: [] as WorkspaceDetail[],
  currentId: null as number | null,
  /** 由搜索等其它页面发起的目录跳转请求 */
  focusDirectoryId: null as number | null,
  loading: false
})

const current = computed(() => state.items.find((item) => item.id === state.currentId) ?? null)

/** 所有工作区下的映射目录，用于"移动到…"等场景 */
const allDirectories = computed(() =>
  state.items.flatMap((workspace) =>
    workspace.directories.map((directory) => ({ workspace, directory }))
  )
)

async function load(): Promise<void> {
  state.loading = true
  try {
    state.items = await window.desktop.workspace.list()
    if (state.currentId === null || !state.items.some((item) => item.id === state.currentId)) {
      state.currentId = state.items[0]?.id ?? null
    }
  } catch (error) {
    useUi().handleError(error, t('error.readWorkspaces'))
  } finally {
    state.loading = false
  }
}

async function create(name: string): Promise<WorkspaceDetail | null> {
  try {
    const workspace = await window.desktop.workspace.create({ name })
    await load()
    state.currentId = workspace.id
    return workspace
  } catch (error) {
    useUi().handleError(error, t('error.createWorkspace'))
    return null
  }
}

async function rename(id: number, name: string): Promise<boolean> {
  try {
    await window.desktop.workspace.update(id, { name })
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.renameWorkspace'))
    return false
  }
}

async function remove(id: number): Promise<boolean> {
  try {
    await window.desktop.workspace.remove(id)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.removeWorkspace'))
    return false
  }
}

/** 返回是否成功，调用方据此决定是否提示成功（失败时 store 已经弹过错误） */
async function addDirectory(workspaceId: number, path: string, name?: string): Promise<boolean> {
  try {
    await window.desktop.workspace.addDirectory(workspaceId, path, name)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.addDirectory'))
    return false
  }
}

async function removeDirectory(mappingId: number): Promise<boolean> {
  try {
    await window.desktop.workspace.removeDirectory(mappingId)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.removeDirectory'))
    return false
  }
}

/** 拖拽排序：传入完整的新顺序 */
async function reorder(ids: number[]): Promise<boolean> {
  try {
    await window.desktop.workspace.reorder(ids)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.saveOrder'))
    await load()
    return false
  }
}

export function useWorkspaces() {
  return {
    state,
    current,
    allDirectories,
    load,
    create,
    rename,
    remove,
    reorder,
    addDirectory,
    removeDirectory,
    focusDirectory: (id: number | null) => {
      state.focusDirectoryId = id
    },
    /** 从待办等其它页面跳到某个工作区 */
    focusWorkspace: (id: number) => {
      state.currentId = id
    }
  }
}
