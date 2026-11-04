import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { TestContext } from './helpers'
import { createTempDir, createTestContext, removeTempDir } from './helpers'

let root = ''
let context: TestContext

beforeAll(async () => {
  root = await createTempDir()
  await mkdir(path.join(root, 'code'))
  await writeFile(path.join(root, 'file.txt'), 'x')
})

afterAll(async () => {
  await removeTempDir(root)
})

beforeEach(() => {
  context = createTestContext()
})

describe('WorkspaceService', () => {
  it('创建并列出工作区', async () => {
    await context.workspaces.create({ name: 'Development' })
    const list = await context.workspaces.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Development')
    expect(list[0].directories).toEqual([])
  })

  it('名称重复时抛 EXISTS，空名称抛 INVALID_ARGUMENT', async () => {
    await context.workspaces.create({ name: 'Dev' })
    await expect(context.workspaces.create({ name: 'dev' })).rejects.toMatchObject({ code: 'EXISTS' })
    await expect(context.workspaces.create({ name: '   ' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
  })

  it('重命名工作区', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })
    const updated = await context.workspaces.update(workspace.id, { name: 'Code' })
    expect(updated.name).toBe('Code')
  })

  it('映射真实目录并标记存在状态', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })
    const mapping = await context.workspaces.addDirectory(workspace.id, path.join(root, 'code'))

    expect(mapping.name).toBe('code')
    expect(mapping.exists).toBe(true)

    const detail = await context.workspaces.get(workspace.id)
    expect(detail.directories).toHaveLength(1)
    expect(detail.directories[0].path).toBe(path.resolve(root, 'code'))
  })

  it('重复映射、映射不存在的目录会被拒绝', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })
    await context.workspaces.addDirectory(workspace.id, root)

    await expect(context.workspaces.addDirectory(workspace.id, root)).rejects.toMatchObject({ code: 'EXISTS' })
    await expect(context.workspaces.addDirectory(workspace.id, path.join(root, 'nope'))).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
    await expect(context.workspaces.addDirectory(workspace.id, path.join(root, 'file.txt'))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    })
  })

  it('移除映射只删除记录，不动真实目录', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })
    const mapping = await context.workspaces.addDirectory(workspace.id, path.join(root, 'code'))

    context.workspaces.removeDirectory(mapping.id)

    expect((await context.workspaces.get(workspace.id)).directories).toHaveLength(0)
    expect(await context.files.exists(path.join(root, 'code'))).toBe(true)
  })

  it('删除工作区会级联删除映射与待办', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })
    await context.workspaces.addDirectory(workspace.id, path.join(root, 'code'))
    context.todos.create({ title: '整理项目', workspaceId: workspace.id })

    context.workspaces.remove(workspace.id)

    expect(await context.workspaces.list()).toHaveLength(0)
    expect(context.todos.list()).toHaveLength(0)
    expect(await context.files.exists(path.join(root, 'code'))).toBe(true)
  })

  it('拖拽排序后按新顺序返回并持久化', async () => {
    const first = await context.workspaces.create({ name: 'A' })
    const second = await context.workspaces.create({ name: 'B' })
    const third = await context.workspaces.create({ name: 'C' })
    expect((await context.workspaces.list()).map((item) => item.name)).toEqual(['A', 'B', 'C'])

    const reordered = await context.workspaces.reorder([third.id, first.id, second.id])

    expect(reordered.map((item) => item.name)).toEqual(['C', 'A', 'B'])
    expect((await context.workspaces.list()).map((item) => item.name)).toEqual(['C', 'A', 'B'])
  })

  it('排序列表不完整、重复或含未知 ID 时被拒绝且不改顺序', async () => {
    const first = await context.workspaces.create({ name: 'A' })
    const second = await context.workspaces.create({ name: 'B' })

    await expect(context.workspaces.reorder([])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(context.workspaces.reorder([first.id, first.id])).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    })
    await expect(context.workspaces.reorder([first.id])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(context.workspaces.reorder([first.id, 999])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    await expect(context.workspaces.reorder([first.id, second.id, second.id])).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    })

    expect((await context.workspaces.list()).map((item) => item.name)).toEqual(['A', 'B'])
  })
})
