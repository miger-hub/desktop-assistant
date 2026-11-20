import { describe, expect, it } from 'vitest'
import type { Note } from '../src/shared/types'
import { recentNoteLinks } from '../src/shared/noteLinks'

function note(overrides: Partial<Note> & { id: number; title: string }): Note {
  const { id, title, ...rest } = overrides
  return {
    id,
    title,
    content: '',
    url: `https://example.com/${id}`,
    sortOrder: id * 10,
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
    lastOpenedAt: null,
    lastLinkUsedAt: null,
    ...rest
  }
}

describe('recentNoteLinks', () => {
  it('最近打开过的链接优先，未使用过的按备忘顺序补齐', () => {
    const items = [
      note({ id: 1, title: 'A' }),
      note({ id: 2, title: 'B', lastLinkUsedAt: '2026-11-20T08:00:00.000Z' }),
      note({ id: 3, title: 'C', lastLinkUsedAt: '2026-11-20T09:00:00.000Z' }),
      note({ id: 4, title: 'D' })
    ]

    expect(recentNoteLinks(items, 3).map((item) => item.title)).toEqual(['C', 'B', 'A'])
  })

  it('只保留带链接的备忘、按 URL 去重并遵守数量限制', () => {
    const items = [
      note({ id: 1, title: 'A' }),
      note({ id: 2, title: 'No link', url: '' }),
      note({ id: 3, title: 'Duplicate', url: 'https://example.com/1' }),
      note({ id: 4, title: 'B' })
    ]

    expect(recentNoteLinks(items, 5).map((item) => item.title)).toEqual(['A', 'B'])
    expect(recentNoteLinks(items, 1).map((item) => item.title)).toEqual(['A'])
    expect(recentNoteLinks(items, 0)).toEqual([])
  })
})
