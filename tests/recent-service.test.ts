import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { clampRecentLimit, mergeRecent, RECENT_KEEP, RECENT_LIMIT } from '../src/main/services/RecentService'
import type { RecentEntry } from '../src/shared/types'
import type { TestContext } from './helpers'
import { createTestContext } from './helpers'

let context: TestContext

beforeEach(() => {
  context = createTestContext()
})

describe('RecentService', () => {
  it('记录打开过的文件，同一路径只保留一条并累加次数', () => {
    context.recents.touch('/tmp/a.txt', 'file')
    context.recents.touch('/tmp/a.txt', 'file')

    const items = context.recents.list()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ path: path.resolve('/tmp/a.txt'), name: 'a.txt', kind: 'file', count: 2 })
  })

  it('按打开时间倒序返回，最近的排在最前', () => {
    context.recents.touch('/tmp/old.txt', 'file')
    context.recents.touch('/tmp/new-dir', 'directory')

    const items = context.recents.list()
    expect(items[0]).toMatchObject({ name: 'new-dir', kind: 'directory' })
    expect(items[1]).toMatchObject({ name: 'old.txt', kind: 'file' })
  })

  it('同一毫秒内连续打开多个文件，顺序仍然稳定', () => {
    const names = ['a.txt', 'b.txt', 'c.txt', 'd.txt']
    for (const name of names) context.recents.touch(`/tmp/${name}`, 'file')

    expect(context.recents.list().map((entry) => entry.name)).toEqual([...names].reverse())
  })

  it('重新打开旧文件会把它顶到最前面', () => {
    context.recents.touch('/tmp/a.txt', 'file')
    context.recents.touch('/tmp/b.txt', 'file')
    context.recents.touch('/tmp/a.txt', 'file')

    expect(context.recents.list().map((entry) => entry.name)).toEqual(['a.txt', 'b.txt'])
  })

  it('只保留最近若干条，limit 会被收敛到合法范围', () => {
    for (let index = 0; index < RECENT_KEEP + 5; index += 1) {
      context.recents.touch(`/tmp/file-${index}.txt`, 'file')
    }

    expect(context.recents.list(RECENT_KEEP + 10)).toHaveLength(RECENT_KEEP)
    expect(context.recents.list(0)).toHaveLength(1)
  })

  it('清空后不返回任何条目', () => {
    context.recents.touch('/tmp/a.txt', 'file')
    context.recents.clear()
    expect(context.recents.list()).toEqual([])
  })
})

describe('mergeRecent', () => {
  const entry = (partial: Partial<RecentEntry> & { path: string; openedAt: string }): RecentEntry => ({
    name: partial.path,
    kind: 'file',
    count: 1,
    ...partial
  })

  it('把文件和备忘按时间倒序合并', () => {
    const files = [entry({ path: '/tmp/a.txt', openedAt: '2024-01-01T00:00:01.000Z' })]
    const notes = [
      entry({ path: 'note:1', kind: 'note', id: 1, openedAt: '2024-01-01T00:00:03.000Z' })
    ]

    expect(mergeRecent(files, notes, RECENT_LIMIT).map((item) => item.path)).toEqual(['note:1', '/tmp/a.txt'])
  })

  it('按 limit 截断，只保留最近的条目', () => {
    const files = [
      entry({ path: '/tmp/old.txt', openedAt: '2024-01-01T00:00:01.000Z' }),
      entry({ path: '/tmp/new.txt', openedAt: '2024-01-01T00:00:04.000Z' })
    ]
    const notes = [entry({ path: 'note:1', kind: 'note', id: 1, openedAt: '2024-01-01T00:00:02.000Z' })]

    expect(mergeRecent(files, notes, 2).map((item) => item.path)).toEqual(['/tmp/new.txt', 'note:1'])
  })

  it('clampRecentLimit 收敛到合法范围', () => {
    expect(clampRecentLimit()).toBe(RECENT_LIMIT)
    expect(clampRecentLimit(0)).toBe(1)
    expect(clampRecentLimit(RECENT_KEEP + 10)).toBe(RECENT_KEEP)
  })
})
