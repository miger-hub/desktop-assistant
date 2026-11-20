import { computed, reactive } from 'vue'
import type { Todo, TodoFilter, TodoInput, TodoPatch, TodoStatus } from '@shared/types'
import { t } from '../i18n'
import { useUi } from './ui'

export interface TodoViewFilter {
  workspaceId: number | null | 'all'
  status: TodoStatus | 'all'
  keyword: string
}

const state = reactive({
  items: [] as Todo[],
  loading: false,
  /** 由首页待办标题跳转过来时要定位的条目 */
  focusId: null as number | null,
  filter: { workspaceId: 'all', status: 'all', keyword: '' } as TodoViewFilter
})

const pending = computed(() => state.items.filter((todo) => todo.status !== 'done'))
const done = computed(() => state.items.filter((todo) => todo.status === 'done'))

function toQuery(): TodoFilter {
  const filter: TodoFilter = {}
  if (state.filter.workspaceId !== 'all') filter.workspaceId = state.filter.workspaceId
  if (state.filter.status !== 'all') filter.status = state.filter.status
  if (state.filter.keyword.trim()) filter.keyword = state.filter.keyword.trim()
  return filter
}

async function load(): Promise<void> {
  state.loading = true
  try {
    state.items = await window.desktop.todo.list(toQuery())
  } catch (error) {
    useUi().handleError(error, t('error.readTodos'))
  } finally {
    state.loading = false
  }
}

/** 返回是否成功，调用方据此决定是否清空输入（失败时 store 已经弹过错误） */
async function create(input: TodoInput): Promise<boolean> {
  try {
    await window.desktop.todo.create(input)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.createTodo'))
    return false
  }
}

async function update(id: number, patch: TodoPatch): Promise<boolean> {
  try {
    await window.desktop.todo.update(id, patch)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.updateTodo'))
    return false
  }
}

async function remove(id: number): Promise<boolean> {
  try {
    await window.desktop.todo.remove(id)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.removeTodo'))
    return false
  }
}

/** 在 todo / doing / done 之间轮转 */
async function cycleStatus(todo: Todo): Promise<void> {
  const next: TodoStatus = todo.status === 'todo' ? 'doing' : todo.status === 'doing' ? 'done' : 'todo'
  await update(todo.id, { status: next })
}

export function useTodos() {
  return {
    state,
    pending,
    done,
    load,
    create,
    update,
    remove,
    cycleStatus,
    focus: (id: number) => {
      state.focusId = id
    }
  }
}
