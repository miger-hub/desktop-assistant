import { beforeEach, describe, expect, it } from 'vitest'
import type { TestContext } from './helpers'
import { createTestContext } from './helpers'

let context: TestContext

beforeEach(() => {
  context = createTestContext()
})

describe('SettingsService', () => {
  it('没有存过设置时返回默认值', () => {
    expect(context.settings.get()).toEqual({
      language: 'system',
      theme: 'system',
      uiScale: 'normal',
      showHiddenFiles: false,
      confirmDelete: true,
      trayEnabled: true,
      globalShortcutsEnabled: true,
      toggleShortcut: 'CommandOrControl+Alt+A',
      searchShortcut: 'CommandOrControl+Alt+K',
      clipboardHistoryLimit: 10,
      searchDebounceMs: 200,
      searchResultLimit: 20,
      homeLinkLimit: 5,
      closeSearchOnHide: true,
      clearSearchOnClose: false,
      searchInMainWindow: false,
      openWithRules: []
    })
  })

  it('打开方式规则：归一化后落库并可读回，非法项被拒绝', () => {
    context.settings.update({
      openWithRules: [
        { extension: '.MD', program: '/usr/bin/typora' },
        { extension: 'md', program: '/usr/bin/other' },
        { extension: '*', program: '/usr/bin/xdg-open' }
      ]
    })

    // 去点、小写、重复扩展名保留第一条
    expect(context.settings.get().openWithRules).toEqual([
      { extension: 'md', program: '/usr/bin/typora' },
      { extension: '*', program: '/usr/bin/xdg-open' }
    ])

    expect(() => context.settings.update({ openWithRules: [{ extension: '', program: '/x' }] })).toThrow(/扩展名/)
    expect(() => context.settings.update({ openWithRules: [{ extension: 'txt', program: '  ' }] })).toThrow(/程序/)
  })

  it('更新后持久化到数据库', () => {
    context.settings.update({ theme: 'dark', showHiddenFiles: true })
    expect(context.settings.get()).toMatchObject({ theme: 'dark', showHiddenFiles: true, confirmDelete: true })
  })

  it('未知主题被拒绝', () => {
    expect(() => context.settings.update({ theme: 'neon' as unknown as 'dark' })).toThrowError()
  })

  it('主题支持 dracula，界面大小只接受已知档位', () => {
    context.settings.update({ theme: 'dracula', uiScale: 'large' })
    expect(context.settings.get()).toMatchObject({ theme: 'dracula', uiScale: 'large' })

    expect(() => context.settings.update({ uiScale: 'huge' as unknown as 'large' })).toThrowError()
  })

  it('布尔值以字符串形式落库并能读回', () => {
    context.settings.update({ confirmDelete: false })
    expect(context.settings.get().confirmDelete).toBe(false)

    context.settings.update({ confirmDelete: true })
    expect(context.settings.get().confirmDelete).toBe(true)
  })

  it('托盘与全局快捷键可以单独关闭', () => {
    context.settings.update({ trayEnabled: false, globalShortcutsEnabled: false })
    expect(context.settings.get()).toMatchObject({ trayEnabled: false, globalShortcutsEnabled: false })

    context.settings.update({ trayEnabled: true })
    expect(context.settings.get()).toMatchObject({ trayEnabled: true, globalShortcutsEnabled: false })
  })

  it('剪贴板历史条数超范围时收敛，非数字被拒绝', () => {
    context.settings.update({ clipboardHistoryLimit: 20 })
    expect(context.settings.get().clipboardHistoryLimit).toBe(20)

    context.settings.update({ clipboardHistoryLimit: 999 })
    expect(context.settings.get().clipboardHistoryLimit).toBe(50)

    context.settings.update({ clipboardHistoryLimit: 0 })
    expect(context.settings.get().clipboardHistoryLimit).toBe(1)

    expect(() => context.settings.update({ clipboardHistoryLimit: Number('abc') })).toThrow(/数字/)
  })

  it('搜索防抖时间超范围时收敛，非数字被拒绝', () => {
    context.settings.update({ searchDebounceMs: 300 })
    expect(context.settings.get().searchDebounceMs).toBe(300)

    context.settings.update({ searchDebounceMs: 0 })
    expect(context.settings.get().searchDebounceMs).toBe(0)

    context.settings.update({ searchDebounceMs: 99999 })
    expect(context.settings.get().searchDebounceMs).toBe(1000)

    context.settings.update({ searchDebounceMs: -50 })
    expect(context.settings.get().searchDebounceMs).toBe(0)

    expect(() => context.settings.update({ searchDebounceMs: Number('abc') })).toThrow(/数字/)
  })

  it('搜索结果条数超范围时收敛，非数字被拒绝', () => {
    context.settings.update({ searchResultLimit: 30 })
    expect(context.settings.get().searchResultLimit).toBe(30)

    context.settings.update({ searchResultLimit: 999 })
    expect(context.settings.get().searchResultLimit).toBe(60)

    context.settings.update({ searchResultLimit: 1 })
    expect(context.settings.get().searchResultLimit).toBe(5)

    expect(() => context.settings.update({ searchResultLimit: Number('abc') })).toThrow(/数字/)
  })

  it('首页常用链接数量默认 5，超范围时收敛，非数字被拒绝', () => {
    expect(context.settings.get().homeLinkLimit).toBe(5)

    context.settings.update({ homeLinkLimit: 8 })
    expect(context.settings.get().homeLinkLimit).toBe(8)

    context.settings.update({ homeLinkLimit: 999 })
    expect(context.settings.get().homeLinkLimit).toBe(20)

    context.settings.update({ homeLinkLimit: 0 })
    expect(context.settings.get().homeLinkLimit).toBe(1)

    expect(() => context.settings.update({ homeLinkLimit: Number('abc') })).toThrow(/数字/)
  })

  it('应用隐藏时是否收起搜索可以单独配置', () => {
    expect(context.settings.get().closeSearchOnHide).toBe(true)

    context.settings.update({ closeSearchOnHide: false })
    expect(context.settings.get().closeSearchOnHide).toBe(false)

    context.settings.update({ closeSearchOnHide: true })
    expect(context.settings.get().closeSearchOnHide).toBe(true)
  })

  it('关闭搜索后是否清空关键字可以单独配置（默认保留，方便接着找）', () => {
    expect(context.settings.get().clearSearchOnClose).toBe(false)

    context.settings.update({ clearSearchOnClose: true })
    expect(context.settings.get().clearSearchOnClose).toBe(true)

    context.settings.update({ clearSearchOnClose: false })
    expect(context.settings.get().clearSearchOnClose).toBe(false)
  })

  it('搜索显示在主界面里可以单独配置（默认用独立搜索窗口）', () => {
    expect(context.settings.get().searchInMainWindow).toBe(false)

    context.settings.update({ searchInMainWindow: true })
    expect(context.settings.get().searchInMainWindow).toBe(true)

    context.settings.update({ searchInMainWindow: false })
    expect(context.settings.get().searchInMainWindow).toBe(false)
  })

  it('快捷键可以改：非法组合报错、两个快捷键不能撞车', () => {
    context.settings.update({ toggleShortcut: 'Control+Shift+T' })
    expect(context.settings.get().toggleShortcut).toBe('Control+Shift+T')

    expect(() => context.settings.update({ toggleShortcut: 'A' })).toThrow(/快捷键不合法/)
    expect(() => context.settings.update({ searchShortcut: 'Shift' })).toThrow(/快捷键不合法/)
    expect(() => context.settings.update({ searchShortcut: 'Control+Shift+T' })).toThrow(/不能用同一个/)
  })

  it('库里存了坏掉的快捷键时回退默认值', () => {
    context.database.connection
      .prepare("INSERT INTO setting (key, value, updated_at) VALUES ('toggleShortcut', 'A', ?)")
      .run(new Date().toISOString())

    expect(context.settings.get().toggleShortcut).toBe('CommandOrControl+Alt+A')
  })
})
