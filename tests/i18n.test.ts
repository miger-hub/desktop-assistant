import { describe, expect, it } from 'vitest'
import { en } from '../src/shared/i18n/messages/en'
import { zhCN } from '../src/shared/i18n/messages/zh-CN'
import { zhTW } from '../src/shared/i18n/messages/zh-TW'
import {
  DEFAULT_LOCALE,
  LOCALES,
  interpolate,
  resolveLocale,
  translate,
  type MessageTree
} from '../src/shared/i18n'

/** 摊平成 `a.b.c` 形式的 key 列表，用来比对语言包是否齐全 */
function flatten(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') keys.push(full)
    else keys.push(...flatten(value, full))
  }
  return keys.sort()
}

describe('i18n 核心', () => {
  it('三种语言的文案 key 完全一致（没有漏翻）', () => {
    const base = flatten(zhCN)
    expect(flatten(zhTW)).toEqual(base)
    expect(flatten(en)).toEqual(base)
  })

  it('没有空文案', () => {
    for (const locale of LOCALES) {
      const empty = flatten(zhCN).filter((key) => translate(locale, key).trim() === '')
      expect(empty).toEqual([])
    }
  })

  it('resolveLocale 能把系统语言落到受支持的语言', () => {
    expect(resolveLocale('zh-CN')).toBe('zh-CN')
    expect(resolveLocale('zh-Hans')).toBe('zh-CN')
    expect(resolveLocale('zh-Hant-TW')).toBe('zh-TW')
    expect(resolveLocale('zh-TW')).toBe('zh-TW')
    expect(resolveLocale('zh-HK')).toBe('zh-TW')
    expect(resolveLocale('en-US')).toBe('en')
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('fr-FR')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE)
  })

  it('interpolate 替换占位符，缺参数时原样保留', () => {
    expect(interpolate('已撤销 {count} 项', { count: 3 })).toBe('已撤销 3 项')
    expect(interpolate('{a}-{b}', { a: 1 })).toBe('1-{b}')
  })

  it('translate 缺 key 时回退默认语言，再缺返回 key 本身', () => {
    expect(translate('en', 'common.ok')).toBe('OK')
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist')
  })
})
