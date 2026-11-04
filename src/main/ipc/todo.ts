import type { TodoFilter, TodoInput, TodoPatch } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

export function registerTodoIpc(context: AppContext): void {
  const { todos } = context

  registerHandler(IPC.todoList, (filter?: TodoFilter) => todos.list(filter ?? {}))
  registerHandler(IPC.todoCreate, (input: TodoInput) => todos.create(input))
  registerHandler(IPC.todoUpdate, (id: number, patch: TodoPatch) => todos.update(id, patch))
  registerHandler(IPC.todoRemove, (id: number) => todos.remove(id))
}
