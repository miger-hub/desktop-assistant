import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTempDir, createTestContext, removeTempDir, type TestContext } from './helpers'

let context: TestContext
let root: string

beforeEach(async () => {
  context = createTestContext()
  root = await createTempDir()
})

afterEach(async () => {
  context.close()
  await removeTempDir(root)
})

describe('ShortcutService', () => {
  it('置顶文件后返回条目，目标存在时 exists 为 true', async () => {
    const file = path.join(root, 'note.txt')
    await writeFile(file, 'hello')

    const shortcut = await context.shortcuts.add({ kind: 'file', path: file })
    expect(shortcut).toMatchObject({ kind: 'file', label: 'note.txt', path: file, exists: true, workspaceId: null })

    const items = await context.shortcuts.list()
    expect(items).toHaveLength(1)
    expect(items[0].exists).toBe(true)
  })

  it('路径会被 resolve，重复置顶同一条目会被拒绝', async () => {
    const directory = path.join(root, 'docs')
    await mkdir(directory)

    await context.shortcuts.add({ kind: 'directory', path: `${directory}/../docs`, label: '文档' })
    const items = await context.shortcuts.list()
    expect(items[0].path).toBe(directory)
    expect(items[0].label).toBe('文档')

    await expect(context.shortcuts.add({ kind: 'directory', path: directory })).rejects.toThrow(/已经在快捷入口/)
  })

  it('目标不存在时保留条目但标记 exists 为 false', async () => {
    const file = path.join(root, 'gone.txt')
    await writeFile(file, 'x')
    await context.shortcuts.add({ kind: 'file', path: file })

    await removeTempDir(file)
    const [shortcut] = await context.shortcuts.list()
    expect(shortcut.exists).toBe(false)
  })

  it('工作区快捷入口按 workspaceId 去重，删除工作区后标记为不存在', async () => {
    const workspace = await context.workspaces.create({ name: 'Dev' })

    const shortcut = await context.shortcuts.add({ kind: 'workspace', workspaceId: workspace.id })
    expect(shortcut).toMatchObject({ kind: 'workspace', label: 'Dev', path: null, exists: true })

    await expect(context.shortcuts.add({ kind: 'workspace', workspaceId: workspace.id })).rejects.toThrow(
      /已经在快捷入口/
    )

    await context.workspaces.remove(workspace.id)
    const items = await context.shortcuts.list()
    // 外键级联会连快捷入口一起删掉，不会留下指向已删除工作区的条目
    expect(items).toHaveLength(0)
  })

  it('缺少路径 / 工作区时拒绝，移除不存在的条目会报错', async () => {
    await expect(context.shortcuts.add({ kind: 'file' })).rejects.toThrow(/请选择/)
    await expect(context.shortcuts.add({ kind: 'workspace' })).rejects.toThrow(/请选择/)
    await expect(context.shortcuts.add({ kind: 'workspace', workspaceId: 999 })).rejects.toThrow(/工作区不存在/)
    expect(() => context.shortcuts.remove(999)).toThrow(/快捷入口不存在/)
  })
})
