import type { Note, NoteInput, NotePatch } from '../../shared/types'
import { invalidArgument, notFound } from '../errors'
import { t } from '../i18n'
import type { NoteRepository } from '../repositories/NoteRepository'

const TITLE_MAX = 120
const CONTENT_MAX = 20000
const URL_MAX = 2000

/**
 * 链接规范化：没写协议时按 https 补全，只接受 http / https，
 * 避免把 `javascript:` 之类的东西丢给系统浏览器。
 */
export function normalizeUrl(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (value.length > URL_MAX) throw invalidArgument(t('svc.urlTooLong', { max: URL_MAX }))

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw invalidArgument(t('svc.urlInvalid', { value }))
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw invalidArgument(t('svc.urlScheme'))
  }
  return parsed.toString()
}

/** 备忘：一段文本，可选带一个链接 */
export class NoteService {
  constructor(private readonly notes: NoteRepository) {}

  list(): Note[] {
    return this.notes.findAll()
  }

  find(keyword?: string): Note[] {
    return this.notes.find(keyword)
  }

  /** 从全局搜索跳转到某条备忘：记一次打开时间（搜索弹框的「最近打开」用） */
  markOpened(id: number, openedAt = new Date().toISOString()): void {
    this.notes.markOpened(id, openedAt)
  }

  /** 最近从搜索跳转打开过的备忘 */
  recentlyOpened(limit: number): Note[] {
    return this.notes.findRecentlyOpened(limit)
  }

  create(input: NoteInput): Note {
    const normalized = this.normalize(input, true)
    return this.notes.insert({
      title: normalized.title!,
      content: normalized.content ?? '',
      url: normalized.url ?? '',
      // 新备忘排在最上面，刚添加完马上能看到
      sortOrder: normalized.sortOrder ?? this.notes.topSortOrder()
    })
  }

  update(id: number, patch: NotePatch): Note {
    if (!this.notes.findById(id)) throw notFound(t('svc.notExist', { what: t('svc.note'), value: id }))
    const updated = this.notes.update(id, this.normalize(patch, false))
    if (!updated) throw notFound(t('svc.notExist', { what: t('svc.note'), value: id }))
    return updated
  }

  remove(id: number): void {
    if (!this.notes.delete(id)) throw notFound(t('svc.notExist', { what: t('svc.note'), value: id }))
  }

  private normalize(input: NoteInput | NotePatch, requireTitle: boolean): NotePatch {
    const patch: NotePatch = {}

    if (input.title !== undefined || requireTitle) {
      const title = (input.title ?? '').trim()
      if (!title) throw invalidArgument(t('svc.titleRequired'))
      if (title.length > TITLE_MAX) throw invalidArgument(t('svc.titleTooLong', { max: TITLE_MAX }))
      patch.title = title
    }

    if (input.content !== undefined) {
      const content = input.content.trim()
      if (content.length > CONTENT_MAX) throw invalidArgument(t('svc.contentTooLong', { max: CONTENT_MAX }))
      patch.content = content
    }

    if (input.url !== undefined) patch.url = normalizeUrl(input.url)
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder

    return patch
  }
}
