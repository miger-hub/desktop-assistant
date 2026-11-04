import path from 'node:path'
import type { OpenWithRule } from '../../shared/types'
import { invalidArgument } from '../errors'
import { t } from '../i18n'

/** 规则条数上限：这是自用工具的便利配置，不是文件关联管理器 */
const MAX_RULES = 50

/** 文件扩展名（不含点、小写）；没有扩展名或点开头（如 .bashrc）时返回空串 */
export function fileExtension(target: string): string {
  const ext = path.extname(target)
  return ext ? ext.slice(1).toLowerCase() : ''
}

/** 扩展名归一化：去掉前导点、转小写；返回 '' 表示不合法 */
function normalizeExtension(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/^\.+/, '')
  if (trimmed === '*') return '*'
  // 扩展名里不该再有分隔符 / 空白
  return /^[a-z0-9][a-z0-9+_-]*$/.test(trimmed) ? trimmed : ''
}

/**
 * 校验并归一化「打开方式」规则：非法项直接报错，重复扩展名保留第一条。
 * 存坏的 JSON 用 parseOpenWithRules 兜底，这里的输入来自设置界面。
 */
export function normalizeOpenWithRules(input: unknown): OpenWithRule[] {
  if (!Array.isArray(input)) throw invalidArgument(t('svc.openWithFormat'))
  if (input.length > MAX_RULES) throw invalidArgument(t('svc.openWithTooMany', { max: MAX_RULES }))

  const rules: OpenWithRule[] = []
  const seen = new Set<string>()
  for (const item of input) {
    const rule = item as Partial<OpenWithRule> | null
    const extension = normalizeExtension(String(rule?.extension ?? ''))
    if (!extension) throw invalidArgument(t('svc.extensionInvalid', { value: String(rule?.extension ?? '') }))
    const program = String(rule?.program ?? '').trim()
    if (!program) throw invalidArgument(t('svc.chooseProgramFor', { ext: extension }))
    if (seen.has(extension)) continue
    seen.add(extension)
    rules.push({ extension, program })
  }
  return rules
}

/** 从库里读回规则；JSON 坏了或格式不对时退回空列表，不影响其它设置 */
export function parseOpenWithRules(raw: string | undefined): OpenWithRule[] {
  if (!raw) return []
  try {
    return normalizeOpenWithRules(JSON.parse(raw))
  } catch {
    return []
  }
}

/** 找出匹配该文件的规则：先精确匹配扩展名，再退回 `*`（任意文件） */
export function resolveOpenWith(rules: OpenWithRule[], target: string): OpenWithRule | null {
  if (rules.length === 0) return null
  const ext = fileExtension(target)
  return (
    (ext ? rules.find((rule) => rule.extension === ext) : undefined) ??
    rules.find((rule) => rule.extension === '*') ??
    null
  )
}
