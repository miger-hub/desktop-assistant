import type { Todo, TodoFilter, TodoInput, TodoPatch, TodoPriority, TodoStatus } from '../../shared/types'
import { invalidArgument, notFound } from '../errors'
import { t } from '../i18n'
import type { TodoRepository } from '../repositories/TodoRepository'
import type { WorkspaceRepository } from '../repositories/WorkspaceRepository'

const STATUSES: TodoStatus[] = ['todo', 'doing', 'done']
const PRIORITIES: TodoPriority[] = ['low', 'normal', 'high']
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeTitle(title: string): string {
  const trimmed = (title ?? '').trim()
  if (!trimmed) throw invalidArgument(t('svc.todoTitleRequired'))
  if (trimmed.length > 200) throw invalidArgument(t('svc.todoTitleTooLong', { max: 200 }))
  return trimmed
}

function normalizeDueDate(dueDate: string | null | undefined): string | null {
  if (dueDate === undefined || dueDate === null || dueDate === '') return null
  if (!DUE_DATE_PATTERN.test(dueDate)) throw invalidArgument(t('svc.dueDateInvalid'))
  return dueDate
}

function normalizeStatus(status: TodoStatus | undefined, fallback: TodoStatus): TodoStatus {
  if (status === undefined) return fallback
  if (!STATUSES.includes(status)) throw invalidArgument(t('svc.unknownStatus', { value: status }))
  return status
}

function normalizePriority(priority: TodoPriority | undefined, fallback: TodoPriority): TodoPriority {
  if (priority === undefined) return fallback
  if (!PRIORITIES.includes(priority)) throw invalidArgument(t('svc.unknownPriority', { value: priority }))
  return priority
}

export class TodoService {
  constructor(
    private readonly todos: TodoRepository,
    private readonly workspaces: WorkspaceRepository
  ) {}

  list(filter: TodoFilter = {}): Todo[] {
    if (filter.workspaceId !== undefined && filter.workspaceId !== null) {
      this.requireWorkspace(filter.workspaceId)
    }
    if (filter.status !== undefined && !STATUSES.includes(filter.status)) {
      throw invalidArgument(t('svc.unknownStatus', { value: filter.status }))
    }
    return this.todos.find(filter)
  }

  create(input: TodoInput): Todo {
    const workspaceId = this.normalizeWorkspaceId(input.workspaceId ?? null)

    return this.todos.insert({
      workspaceId,
      title: normalizeTitle(input.title),
      description: (input.description ?? '').trim(),
      status: normalizeStatus(input.status, 'todo'),
      priority: normalizePriority(input.priority, 'normal'),
      dueDate: normalizeDueDate(input.dueDate)
    })
  }

  update(id: number, patch: TodoPatch): Todo {
    const current = this.requireTodo(id)
    const next: TodoPatch = {}

    if (patch.title !== undefined) next.title = normalizeTitle(patch.title)
    if (patch.description !== undefined) next.description = patch.description.trim()
    if (patch.status !== undefined) next.status = normalizeStatus(patch.status, current.status)
    if (patch.priority !== undefined) next.priority = normalizePriority(patch.priority, current.priority)
    if (patch.dueDate !== undefined) next.dueDate = normalizeDueDate(patch.dueDate)
    if (patch.workspaceId !== undefined) next.workspaceId = this.normalizeWorkspaceId(patch.workspaceId)

    const updated = this.todos.update(id, next)
    if (!updated) throw notFound(t('svc.notExist', { what: t('svc.todo'), value: id }))
    return updated
  }

  remove(id: number): void {
    if (!this.todos.delete(id)) throw notFound(t('svc.notExist', { what: t('svc.todo'), value: id }))
  }

  private requireTodo(id: number): Todo {
    const todo = this.todos.findById(id)
    if (!todo) throw notFound(t('svc.notExist', { what: t('svc.todo'), value: id }))
    return todo
  }

  private requireWorkspace(id: number): void {
    if (!this.workspaces.findById(id)) throw notFound(t('svc.notExist', { what: t('svc.workspace'), value: id }))
  }

  /** null 表示收件箱（不属于任何工作区） */
  private normalizeWorkspaceId(workspaceId: number | null | undefined): number | null {
    if (workspaceId === undefined || workspaceId === null) return null
    if (!Number.isInteger(workspaceId)) throw invalidArgument(t('svc.workspaceIdInvalid'))
    this.requireWorkspace(workspaceId)
    return workspaceId
  }
}
