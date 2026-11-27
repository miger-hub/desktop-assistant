import type { WorkLog } from './types'

export type WorkLogCategory = 'completed' | 'incomplete' | 'issues' | 'default'

export type WorkLogGroups = Record<WorkLogCategory, string[]>

export const WORK_LOG_CATEGORIES: WorkLogCategory[] = [
  'completed',
  'incomplete',
  'issues',
  'default'
]

/** 每行一条；顺手去掉常见的列表符号，导出时统一重新编号 */
export function parseWorkLogItems(value: string): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)、])\s*/, '').trim())
    .filter(Boolean)
}

export function categoryContent(log: WorkLog, category: WorkLogCategory): string {
  return category === 'default' ? log.content : log[category]
}

export function hasWorkLogContent(log: WorkLog | null | undefined): boolean {
  if (!log) return false
  return WORK_LOG_CATEGORIES.some((category) => parseWorkLogItems(categoryContent(log, category)).length > 0)
}

/** 把同一周的工作项按类别聚合，周报展示和导出共用 */
export function groupWorkLogs(logs: WorkLog[]): WorkLogGroups {
  const groups: WorkLogGroups = {
    completed: [],
    incomplete: [],
    issues: [],
    default: []
  }
  for (const log of logs) {
    for (const category of WORK_LOG_CATEGORIES) {
      groups[category].push(...parseWorkLogItems(categoryContent(log, category)))
    }
  }
  return groups
}

/** 追加一条完成项；相同文本已经存在时不重复写入 */
export function appendWorkLogItem(content: string, item: string): string {
  const next = item.trim()
  if (!next) return content
  const existing = parseWorkLogItems(content)
  if (existing.includes(next)) return content
  const current = content.trimEnd()
  return current ? `${current}\n${next}` : next
}

export type WorkLogLabels = Record<WorkLogCategory, string>

/** 纯文本周报：有内容的类别按「标题 + 1. / 2.」顺序输出 */
export function formatWorkLogText(logs: WorkLog[], labels: WorkLogLabels): string {
  const groups = groupWorkLogs(logs)
  return WORK_LOG_CATEGORIES.flatMap((category) => {
    const items = groups[category]
    if (items.length === 0) return []
    return [
      labels[category],
      ...items.map((item, index) => `${index + 1}. ${item}`)
    ].join('\n')
  }).join('\n\n')
}

/** Markdown 周报：类别作为二级标题，工作项作为列表 */
export function formatWorkLogMarkdown(
  logs: WorkLog[],
  heading: string,
  labels: WorkLogLabels
): string {
  const groups = groupWorkLogs(logs)
  const sections = WORK_LOG_CATEGORIES.flatMap((category) => {
    const items = groups[category]
    if (items.length === 0) return []
    return [`## ${labels[category]}`, '', ...items.map((item) => `- ${item}`), '']
  })
  return [`# ${heading}`, '', ...sections].join('\n').trimEnd()
}
