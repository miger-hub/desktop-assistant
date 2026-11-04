import { beforeEach, describe, expect, it } from 'vitest'
import type { TestContext } from './helpers'
import { createTestContext } from './helpers'

let context: TestContext

beforeEach(() => {
  context = createTestContext()
})

describe('TodoService', () => {
  it('默认进入收件箱，状态为 todo', () => {
    const todo = context.todos.create({ title: '  写文档  ' })
    expect(todo.title).toBe('写文档')
    expect(todo.workspaceId).toBeNull()
    expect(todo.status).toBe('todo')
    expect(todo.priority).toBe('normal')
    expect(todo.dueDate).toBeNull()
  })

  it('标题为空时拒绝', () => {
    expect(() => context.todos.create({ title: '   ' })).toThrowError()
    expect(() => context.todos.create({ title: '' })).toThrowError()
  })

  it('校验截止日期、状态与优先级', () => {
    expect(() => context.todos.create({ title: 't', dueDate: '2026/01/01' })).toThrowError()
    expect(() =>
      context.todos.create({ title: 't', status: 'later' as unknown as 'todo' })
    ).toThrowError()
    expect(() =>
      context.todos.create({ title: 't', priority: 'urgent' as unknown as 'normal' })
    ).toThrowError()
  })

  it('指定不存在的工作区时抛 NOT_FOUND', () => {
    expect(() => context.todos.create({ title: 't', workspaceId: 999 })).toThrowError()
  })

  it('更新状态、优先级与截止日期', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })
    const todo = context.todos.create({ title: '写测试', workspaceId: workspace.id })

    const updated = context.todos.update(todo.id, { status: 'doing', priority: 'high', dueDate: '2026-10-01' })
    expect(updated.status).toBe('doing')
    expect(updated.priority).toBe('high')
    expect(updated.dueDate).toBe('2026-10-01')
    expect(updated.workspaceId).toBe(workspace.id)
  })

  it('可以把待办从工作区移到收件箱', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })
    const todo = context.todos.create({ title: 'b', workspaceId: workspace.id })
    expect(todo.workspaceId).toBe(workspace.id)

    const updated = context.todos.update(todo.id, { workspaceId: null })
    expect(updated.workspaceId).toBeNull()
  })

  it('按工作区、状态与关键字过滤', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })
    context.todos.create({ title: '整理桌面', workspaceId: workspace.id, priority: 'high' })
    context.todos.create({ title: '购买键盘' })
    const done = context.todos.create({ title: '整理书桌' })
    context.todos.update(done.id, { status: 'done' })

    expect(context.todos.list({ workspaceId: workspace.id })).toHaveLength(1)
    expect(context.todos.list({ workspaceId: null })).toHaveLength(2)
    expect(context.todos.list({ status: 'done' })).toHaveLength(1)
    expect(context.todos.list({ keyword: '整理' })).toHaveLength(2)
    expect(context.todos.list({ keyword: '桌面', workspaceId: workspace.id })).toHaveLength(1)
  })

  it('高优先级与未完成排在前面', () => {
    const low = context.todos.create({ title: '低优先级', priority: 'low' })
    const high = context.todos.create({ title: '高优先级', priority: 'high' })
    const finished = context.todos.create({ title: '已完成', priority: 'high' })
    context.todos.update(finished.id, { status: 'done' })

    const ids = context.todos.list().map((todo) => todo.id)
    expect(ids[0]).toBe(high.id)
    expect(ids[ids.length - 1]).toBe(finished.id)
    expect(ids).toContain(low.id)
  })

  it('删除待办，删除不存在的待办会报错', () => {
    const todo = context.todos.create({ title: '临时' })
    context.todos.remove(todo.id)
    expect(context.todos.list()).toHaveLength(0)
    expect(() => context.todos.remove(todo.id)).toThrowError()
  })
})
