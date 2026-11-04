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

async function moveOne(name: string): Promise<{ source: string; target: string }> {
  const source = path.join(root, 'source', name)
  const target = path.join(root, 'target', name)
  await mkdir(path.dirname(source), { recursive: true })
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(source, 'x')
  await context.files.move(source, target)
  return { source, target }
}

describe('OperationService', () => {
  it('没有记录时返回 null', async () => {
    expect(context.operations.listBatches(10)).toEqual([])
    expect(await context.operations.undoLast()).toBeNull()
  })

  it('撤销把文件移回原位，并把批次标记为已撤销', async () => {
    const { source, target } = await moveOne('a.txt')
    const batchId = context.operations.record({
      entries: [{ source, target }],
      kind: 'move',
      origin: 'manual'
    })

    expect(batchId).not.toBeNull()
    expect(context.operations.listBatches(10)[0]).toMatchObject({ count: 1, pending: 1, origin: 'manual' })

    const undone = await context.operations.undoLast()
    expect(undone?.batchId).toBe(batchId)
    expect(undone?.result.failed).toEqual([])
    expect(await context.files.exists(source)).toBe(true)
    expect(await context.files.exists(target)).toBe(false)

    const batch = context.operations.listBatches(10)[0]
    expect(batch.pending).toBe(0)
    // 已经撤销过的批次不会重复撤销
    await expect(context.operations.undo(batchId!)).rejects.toThrow(/已经没有可撤销/)
  })

  it('原位置被占用时该条目失败，其余条目继续撤销', async () => {
    const first = await moveOne('a.txt')
    const second = await moveOne('b.txt')
    const batchId = context.operations.record({
      entries: [first, second],
      kind: 'move',
      origin: 'manual'
    })!

    // 占住 a.txt 的原位置
    await writeFile(first.source, 'occupied')

    const result = await context.operations.undo(batchId)
    expect(result.failed.map((item) => item.path)).toEqual([first.target])
    expect(result.succeeded).toEqual([second.source])
    expect(await context.files.exists(second.source)).toBe(true)

    // 只把成功的条目记为已撤销，失败的还留着
    expect(context.operations.listBatches(10)[0].pending).toBe(1)
  })

  it('目标文件已经不在时给出可读错误', async () => {
    const { source, target } = await moveOne('a.txt')
    const batchId = context.operations.record({ entries: [{ source, target }], kind: 'move', origin: 'manual' })!
    await context.files.remove([target])

    const result = await context.operations.undo(batchId)
    expect(result.failed[0].message).toContain('原文件已不在')
    expect(result.succeeded).toEqual([])
  })
})
