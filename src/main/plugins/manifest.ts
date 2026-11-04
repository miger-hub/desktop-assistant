import path from 'node:path'
import { LOCALES, type Locale } from '../../shared/i18n'
import { TOOL_API_VERSION, type ToolOptionType, type ToolOptionValue, type ToolResultKind } from '../../shared/tools/types'
import { invalidArgument } from '../errors'
import { t } from '../i18n'

export interface PluginLocaleMessages {
  name: string
  description: string
  keywords: string[]
  /** 选项 label */
  options?: Record<string, string>
  /** select 选项值 label，key 形如 `indent:2` */
  optionValues?: Record<string, string>
}

export interface PluginOptionDefinition {
  key: string
  type: ToolOptionType
  default: ToolOptionValue
  values?: Array<string | number>
}

export interface PluginManifest {
  id: string
  version: string
  apiVersion: number
  input: 'text'
  result: ToolResultKind
  entry: string
  icon?: string
  locales: Partial<Record<Locale, PluginLocaleMessages>>
  options: PluginOptionDefinition[]
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/
const OPTION_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/

function fail(code: string, params?: Record<string, string | number>): never {
  throw invalidArgument(t(`plugin.error.${code}`, params))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

/** 插件包内路径必须是相对路径，且不能逃出插件目录 */
export function isSafeRelativePath(value: string): boolean {
  if (!value || value.includes('\0')) return false
  const raw = value.replace(/\\/g, '/')
  // Windows 盘符 / UNC 也要拒绝，不能只在当前平台依赖 path.isAbsolute
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) return false
  const normalized = path.posix.normalize(raw)
  return normalized !== '..' && !normalized.startsWith('../') && normalized !== '.'
}

function parseOption(value: unknown, seen: Set<string>): PluginOptionDefinition {
  if (!isObject(value)) fail('badOptions')
  const key = value.key
  if (!isNonEmptyString(key, 32) || !OPTION_KEY_PATTERN.test(key) || seen.has(key)) fail('badOptions')
  seen.add(key)

  if (value.type !== 'select' && value.type !== 'switch') fail('badOptions')
  const type = value.type

  if (type === 'switch') {
    if (typeof value.default !== 'boolean') fail('badOptions')
    return { key, type, default: value.default }
  }

  if (!Array.isArray(value.values) || value.values.length === 0 || value.values.length > 20) fail('badOptions')
  const values: Array<string | number> = []
  for (const item of value.values) {
    if (typeof item !== 'string' && typeof item !== 'number') fail('badOptions')
    if (values.includes(item)) fail('badOptions')
    values.push(item)
  }
  if (!values.includes(value.default as string | number)) fail('badOptions')
  return { key, type, default: value.default as string | number, values }
}

/**
 * 校验并归一化第三方插件的 plugin.json。
 * 文件是否存在、入口是否可读由 PluginService 在安装时再检查。
 */
export function parsePluginManifest(raw: unknown): PluginManifest {
  if (!isObject(raw)) fail('invalidManifest')

  if (!isNonEmptyString(raw.id, 64) || !ID_PATTERN.test(raw.id)) fail('badId')
  if (!isNonEmptyString(raw.version, 32)) fail('badVersion')
  if (raw.apiVersion !== TOOL_API_VERSION) fail('unsupportedApi', { version: TOOL_API_VERSION })
  if (raw.input !== 'text') fail('badInput')
  if (raw.result !== 'text' && raw.result !== 'table' && raw.result !== 'tree') fail('badResult')
  if (!isNonEmptyString(raw.entry, 260) || !raw.entry.toLowerCase().endsWith('.js') || !isSafeRelativePath(raw.entry)) {
    fail('badEntry')
  }
  if (raw.icon !== undefined && (!isNonEmptyString(raw.icon, 260) || !isSafeRelativePath(raw.icon))) {
    fail('badIcon')
  }

  if (!isObject(raw.locales)) fail('noLocales')
  const locales: Partial<Record<Locale, PluginLocaleMessages>> = {}
  for (const [locale, messages] of Object.entries(raw.locales)) {
    if (!LOCALES.includes(locale as Locale)) continue
    if (!isObject(messages)) fail('badLocale', { locale })
    if (!isNonEmptyString(messages.name, 120) || !isNonEmptyString(messages.description, 500)) {
      fail('badLocale', { locale })
    }
    if (
      !Array.isArray(messages.keywords) ||
      messages.keywords.length === 0 ||
      messages.keywords.length > 50 ||
      !messages.keywords.every((keyword) => isNonEmptyString(keyword, 80))
    ) {
      fail('badLocale', { locale })
    }
    const options = isObject(messages.options)
      ? Object.fromEntries(
          Object.entries(messages.options).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : undefined
    const optionValues = isObject(messages.optionValues)
      ? Object.fromEntries(
          Object.entries(messages.optionValues).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : undefined
    locales[locale as Locale] = {
      name: messages.name,
      description: messages.description,
      keywords: messages.keywords.map((keyword) => keyword.trim()),
      options,
      optionValues
    }
  }
  if (Object.keys(locales).length === 0) fail('noLocales')

  const options: PluginOptionDefinition[] = []
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options) || raw.options.length > 20) fail('badOptions')
    const seen = new Set<string>()
    for (const option of raw.options) options.push(parseOption(option, seen))
  }

  return {
    id: raw.id,
    version: raw.version,
    apiVersion: raw.apiVersion,
    input: 'text',
    result: raw.result,
    entry: path.posix.normalize(raw.entry.replace(/\\/g, '/')),
    icon: raw.icon,
    locales,
    options
  }
}
