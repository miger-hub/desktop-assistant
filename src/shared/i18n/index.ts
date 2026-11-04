/**
 * 轻量国际化核心：主进程与渲染进程共用。
 * 这里只有纯逻辑（不含 Vue / Electron），方便单测。
 *
 * 文案按「区域.用途」分组，见 messages/ 下的语言包；
 * 缺键时回退到默认语言，再缺就返回 key 本身（方便一眼看出漏翻）。
 */
import { en } from './messages/en'
import { zhCN } from './messages/zh-CN'
import { zhTW } from './messages/zh-TW'

export type Locale = 'zh-CN' | 'zh-TW' | 'en'

/** 支持的语言；顺序即设置页里显示的顺序 */
export const LOCALES: Locale[] = ['zh-CN', 'zh-TW', 'en']
export const DEFAULT_LOCALE: Locale = 'zh-CN'

export interface MessageTree {
  [key: string]: string | MessageTree
}

export type MessageParams = Record<string, string | number>

export const MESSAGES: Record<Locale, MessageTree> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en
}

/**
 * 把系统 locale（zh-Hant-TW / en-US / …）落到受支持的语言上。
 * 繁体地区（台湾 / 香港 / 澳门，或带 Hant 标记）走 zh-TW，其它中文走 zh-CN。
 */
export function resolveLocale(input: string | null | undefined): Locale {
  const value = (input ?? '').toLowerCase()
  if (!value) return DEFAULT_LOCALE
  if (value.startsWith('zh')) return /hant|tw|hk|mo/.test(value) ? 'zh-TW' : 'zh-CN'
  if (value.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}

function lookup(tree: MessageTree, key: string): string | undefined {
  let node: string | MessageTree | undefined = tree
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** `{name}` 占位替换；找不到对应参数时原样保留，避免把占位符吃掉 */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

/** 取某个语言下的文案；缺失时回退默认语言，再缺失返回 key */
export function translate(locale: Locale, key: string, params?: MessageParams): string {
  const text = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES[DEFAULT_LOCALE], key) ?? key
  return interpolate(text, params)
}
