import type { HomeShortcutInput } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

export function registerHomeIpc(context: AppContext): void {
  const { home, workLogs, apps } = context

  registerHandler(IPC.homeShortcutList, () => home.list())
  registerHandler(IPC.homeShortcutAdd, (input: HomeShortcutInput) => home.add(input))
  registerHandler(IPC.homeShortcutRemove, (id: number) => home.remove(id))

  registerHandler(IPC.workLogList, (startDate: string, endDate: string) => workLogs.list(startDate, endDate))
  registerHandler(IPC.workLogSave, (date: string, content: string) => workLogs.save(date, content))
  registerHandler(IPC.workLogExportWeek, (startDate: string, endDate: string) =>
    workLogs.exportWeek(startDate, endDate)
  )
  registerHandler(IPC.workLogExportWeekText, (startDate: string, endDate: string) =>
    workLogs.exportWeekText(startDate, endDate)
  )
  registerHandler(IPC.workLogCopyWeekText, (startDate: string, endDate: string) =>
    workLogs.copyWeekText(startDate, endDate)
  )

  registerHandler(IPC.appListApplications, () => apps.listSummaries())
}
