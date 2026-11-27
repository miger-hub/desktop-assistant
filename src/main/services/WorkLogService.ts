import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, clipboard, dialog } from 'electron'
import type { WorkLog, WorkLogDraft } from '../../shared/types'
import {
  appendWorkLogItem,
  formatWorkLogMarkdown,
  formatWorkLogText,
  hasWorkLogContent,
  type WorkLogLabels
} from '../../shared/workLog'
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

function workLogLabels(): WorkLogLabels {
  return {
    completed: t('home.reportCompleted'),
    incomplete: t('home.reportIncomplete'),
    issues: t('home.reportIssues'),
    default: t('home.reportDefault')
  }
}

function normalizeDraft(input: WorkLogDraft): WorkLogDraft {
  const normalize = (value: string): string => String(value ?? '').trim()
  const draft = {
    content: normalize(input.content),
    completed: normalize(input.completed),
    incomplete: normalize(input.incomplete),
    issues: normalize(input.issues)
  }
  for (const value of Object.values(draft)) {
    if (value.length > CONTENT_MAX) {
      throw invalidArgument(t('svc.workLogTooLong', { max: CONTENT_MAX }))
    }
  }
  return draft
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

  save(date: string, input: WorkLogDraft | string): WorkLog {
    if (!isDateKey(date)) throw invalidArgument(t('svc.invalidWorkLogDate'))
    const draft =
      typeof input === 'string'
        ? normalizeDraft({ content: input, completed: '', incomplete: '', issues: '' })
        : normalizeDraft(input)
    return this.workLogs.upsert(date, draft)
  }

  /** 待办转成完成时调用；同一天同一标题只写入一次 */
  addTodoCompletion(date: string, title: string): WorkLog {
    if (!isDateKey(date)) throw invalidArgument(t('svc.invalidWorkLogDate'))
    const current = this.workLogs.findByDate(date)
    const completed = appendWorkLogItem(current?.completed ?? '', title)
    return this.save(date, {
      content: current?.content ?? '',
      completed,
      incomplete: current?.incomplete ?? '',
      issues: current?.issues ?? ''
    })
  }

  private logsWithContent(startDate: string, endDate: string): WorkLog[] {
    return this.list(startDate, endDate).filter(hasWorkLogContent)
  }

  async exportWeek(startDate: string, endDate: string): Promise<{ path: string; count: number } | null> {
    const logs = this.logsWithContent(startDate, endDate)
    if (logs.length === 0) throw invalidArgument(t('svc.noWorkLogsToExport'))

    const result = await dialog.showSaveDialog({
      title: t('svc.exportWorkLogTitle'),
      defaultPath: path.join(app.getPath('documents'), `work-report-${startDate}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return null

    const markdown = formatWorkLogMarkdown(
      logs,
      t('svc.workLogExportHeading', { start: startDate, end: endDate }),
      workLogLabels()
    )
    try {
      await writeFile(result.filePath, markdown, 'utf8')
    } catch (error) {
      throw fromFsError(error, result.filePath)
    }
    return { path: result.filePath, count: logs.length }
  }

  async exportWeekText(startDate: string, endDate: string): Promise<{ path: string; count: number } | null> {
    const logs = this.logsWithContent(startDate, endDate)
    if (logs.length === 0) throw invalidArgument(t('svc.noWorkLogsToExport'))

    const result = await dialog.showSaveDialog({
      title: t('svc.exportWorkLogTextTitle'),
      defaultPath: path.join(app.getPath('documents'), `work-report-${startDate}.txt`),
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePath) return null

    try {
      await writeFile(result.filePath, formatWorkLogText(logs, workLogLabels()), 'utf8')
    } catch (error) {
      throw fromFsError(error, result.filePath)
    }
    return { path: result.filePath, count: logs.length }
  }

  copyWeekText(startDate: string, endDate: string): { count: number } {
    const logs = this.logsWithContent(startDate, endDate)
    if (logs.length === 0) throw invalidArgument(t('svc.noWorkLogsToExport'))
    clipboard.writeText(formatWorkLogText(logs, workLogLabels()))
    return { count: logs.length }
  }
}
