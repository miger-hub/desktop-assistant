import type { Note } from './types'

/** 首页常用链接：最近打开过的优先，未使用过的按备忘原顺序补齐。 */
export function recentNoteLinks(notes: Note[], limit: number): Note[] {
  const seen = new Set<string>()
  return notes
    .filter((note) => Boolean(note.url))
    .sort((left, right) => {
      if (left.lastLinkUsedAt && right.lastLinkUsedAt) {
        return right.lastLinkUsedAt.localeCompare(left.lastLinkUsedAt)
      }
      if (left.lastLinkUsedAt) return -1
      if (right.lastLinkUsedAt) return 1
      return left.sortOrder - right.sortOrder || left.id - right.id
    })
    .filter((note) => {
      if (seen.has(note.url)) return false
      seen.add(note.url)
      return true
    })
    .slice(0, Math.max(0, Math.trunc(limit)))
}
