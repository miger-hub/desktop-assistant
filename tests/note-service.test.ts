import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeUrl } from '../src/main/services/NoteService'
import type { TestContext } from './helpers'
import { createTestContext } from './helpers'

let context: TestContext

beforeEach(() => {
  context = createTestContext()
})

describe('NoteService', () => {
  it('创建备忘：内容与链接可选，链接会自动补 https', () => {
    const note = context.notes.create({ title: '常用命令', content: 'pnpm test', url: 'example.com/docs' })
    expect(note).toMatchObject({
      title: '常用命令',
      content: 'pnpm test',
      url: 'https://example.com/docs'
    })

    const plain = context.notes.create({ title: '只有标题' })
    expect(plain).toMatchObject({ content: '', url: '' })
    // 新添加的排在最上面
    expect(context.notes.list().map((item) => item.id)).toEqual([plain.id, note.id])
    const third = context.notes.create({ title: '第三条' })
    expect(context.notes.list().map((item) => item.id)).toEqual([third.id, plain.id, note.id])
  })

  it('标题必填，内容与链接长度受限', () => {
    expect(() => context.notes.create({ title: '   ' })).toThrow(/标题不能为空/)
    expect(() => context.notes.create({ title: 'x'.repeat(121) })).toThrow(/标题过长/)
    expect(() => context.notes.create({ title: 'ok', content: 'x'.repeat(20001) })).toThrow(/内容过长/)
  })

  it('只接受 http / https 链接', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/')
    expect(normalizeUrl(' example.com ')).toBe('https://example.com/')
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(/只支持 http \/ https/)
    expect(() => normalizeUrl('file:///etc/passwd')).toThrow(/只支持 http \/ https/)
  })

  it('更新与删除：不存在的备忘会报错', () => {
    const note = context.notes.create({ title: '旧标题', content: '正文' })

    const updated = context.notes.update(note.id, { title: '新标题', url: 'https://a.example' })
    expect(updated).toMatchObject({ title: '新标题', content: '正文', url: 'https://a.example/' })

    // patch 里没提到的字段保持原值
    expect(context.notes.update(note.id, { content: '改了' })).toMatchObject({ title: '新标题', content: '改了' })

    context.notes.remove(note.id)
    expect(context.notes.list()).toEqual([])
    expect(() => context.notes.update(note.id, { title: 'x' })).toThrow(/备忘不存在/)
    expect(() => context.notes.remove(note.id)).toThrow(/备忘不存在/)
  })

  it('关键字搜索覆盖标题 / 内容 / 链接', () => {
    context.notes.create({ title: '构建命令', content: 'pnpm build' })
    context.notes.create({ title: '文档', url: 'https://docs.example.com' })

    expect(context.notes.find('构建').map((note) => note.title)).toEqual(['构建命令'])
    expect(context.notes.find('pnpm').map((note) => note.title)).toEqual(['构建命令'])
    expect(context.notes.find('DOCS').map((note) => note.title)).toEqual(['文档'])
    expect(context.notes.find('不存在')).toEqual([])
  })

  it('新建的备忘不算「最近打开」，从没跳转过时 lastOpenedAt 为 null', () => {
    const note = context.notes.create({ title: 'A' })
    expect(note.lastOpenedAt).toBeNull()
    expect(context.notes.recentlyOpened(5)).toEqual([])
  })

  it('从搜索跳转打开过的备忘按时间倒序进入「最近打开」，按 limit 截断', async () => {
    const a = context.notes.create({ title: 'A' })
    const b = context.notes.create({ title: 'B' })

    context.notes.markOpened(a.id)
    await new Promise((resolve) => setTimeout(resolve, 5))
    context.notes.markOpened(b.id)

    expect(context.notes.recentlyOpened(5).map((note) => note.id)).toEqual([b.id, a.id])
    expect(context.notes.recentlyOpened(1).map((note) => note.id)).toEqual([b.id])
  })

  it('重复跳转同一条备忘会刷新时间，排到最前；跳转不存在的 id 不报错', async () => {
    const a = context.notes.create({ title: 'A' })
    const b = context.notes.create({ title: 'B' })

    context.notes.markOpened(a.id)
    await new Promise((resolve) => setTimeout(resolve, 5))
    context.notes.markOpened(b.id)
    await new Promise((resolve) => setTimeout(resolve, 5))
    context.notes.markOpened(a.id)

    expect(context.notes.recentlyOpened(2).map((note) => note.id)).toEqual([a.id, b.id])
    expect(() => context.notes.markOpened(9999)).not.toThrow()
  })
})
