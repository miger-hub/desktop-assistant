import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, clipboard, dialog } from 'electron'
import type { WorkLog } from '../../shared/types'
import { fromFsError, invalidArgument } from '../errors'
import { t } from '../i18n'
import type { WorkLogRepository } from '../repositories/WorkLogRepository'

const CONTENT_MAX = 20000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isDateKey(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** 简单文本格式：不包含日期，只把有内容的日报按 1. / 2. / 3. 排列 */
export function formatWorkLogText(logs: WorkLog[]): string {
  return logs
    .map((log) => log.content.trim())
    .filter(Boolean)
    .map((content, index) => {
      const [first, ...rest] = content.split('\n')
      const continuation = rest.map((line) => `   ${line}`).join('\n')
      return `${index + 1}. ${first}${continuation ? `\n${continuation}` : ''}`
    })
    .join('\n')
}

/** 每日工作记录 + 按周导出 */
export class WorkLogService {
  constructor(private readonly workLogs: WorkLogRepository) {}

  list(startDate: string, endDate: string): WorkLog[] {
    if (!isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) {
      throw invalidArgument(t('svc.invalidWorkLogRange'))
    }
    return this.workLogs.find(startDate, endDate)
  }

  save(date: string, content: string): WorkLog {
    if (!isDateKey(date)) throw invalidArgument(t('svc.invalidWorkLogDate'))
    const value = String(content ?? '').trim()
    if (value.length > CONTENT_MAX) {
      throw invalidArgument(t('svc.workLogTooLong', { max: CONTENT_MAX }))
    }
    return this.workLogs.upsert(date, value)
  }

  async exportWeek(startDate: string, endDate: string): Promise<{ path: string; count: number } | null> {
    const logs = this.list(startDate, endDate).filter((log) => log.content.trim())
    if (logs.length === 0) throw invalidArgument(t('svc.noWorkLogsToExport'))

    const result = await dialog.showSaveDialog({
      title: t('svc.exportWorkLogTitle'),
      defaultPath: path.join(app.getPath('documents'), `work-report-${startDate}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return null

    const lines = [
      `# ${t('svc.workLogExportHeading', { start: startDate, end: endDate })}`,
      '',
      ...logs.flatMap((log) => [`## ${log.date}`, '', log.content, ''])
    ]
    try {
      await writeFile(result.filePath, lines.join('\n'), 'utf8')
    } catch (error) {
      throw fromFsError(error, result.filePath)
    }
    return { path: result.filePath, count: logs.length }
  }

  async exportWeekText(startDate: string, endDate: string): Promise<{ path: string; count: number } | null> {
    const logs = this.list(startDate, endDate).filter((log) => log.content.trim())
    if (logs.length === 0) throw invalidArgument(t('svc.noWorkLogsToExport'))

    const result = await dialog.showSaveDialog({
      title: t('svc.exportWorkLogTextTitle'),
      defaultPath: path.join(app.getPath('documents'), `work-report-${startDate}.txt`),
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return null

    try {
      await writeFile(result.filePath, formatWorkLogText(logs), 'utf8')
    } catch (error) {
      throw fromFsError(error, result.filePath)
    }
    return { path: result.filePath, count: logs.length }
  }

  copyWeekText(startDate: string, endDate: string): { count: number } {
    const logs = this.list(startDate, endDate).filter((log) => log.content.trim())
    if (logs.length === 0) throw invalidArgument(t('svc.noWorkLogsToExport'))
    clipboard.writeText(formatWorkLogText(logs))
    return { count: logs.length }
  }
}
