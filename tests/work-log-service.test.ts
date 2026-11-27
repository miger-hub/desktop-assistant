import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../src/main/services/DatabaseService'
import { WorkLogRepository } from '../src/main/repositories/WorkLogRepository'
import { WorkLogService } from '../src/main/services/WorkLogService'
import { formatWorkLogText, type WorkLogLabels } from '../src/shared/workLog'
import { createTempDir, removeTempDir } from './helpers'

const electron = vi.hoisted(() => ({
  savePath: '',
  showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: electron.savePath })),
  writeText: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  dialog: { showSaveDialog: electron.showSaveDialog },
  clipboard: { writeText: electron.writeText }
}))

let database: DatabaseService
let service: WorkLogService
let root: string
const labels: WorkLogLabels = {
  completed: '完成',
  incomplete: '未完成',
  issues: '问题',
  default: '默认'
}

beforeEach(async () => {
  database = new DatabaseService(':memory:')
  service = new WorkLogService(new WorkLogRepository(database.connection))
  root = await createTempDir()
  electron.savePath = path.join(root, 'week.md')
  electron.showSaveDialog.mockClear()
  electron.writeText.mockClear()
})

afterEach(async () => {
  database.close()
  await removeTempDir(root)
})

describe('WorkLogService', () => {
  it('保存时去掉首尾空白，覆盖同一天不会新增第二条', () => {
    service.save('2026-11-20', '  完成首页  ')
    service.save('2026-11-20', '完成首页与日历')

    expect(service.list('2026-11-20', '2026-11-20')).toMatchObject([
      { date: '2026-11-20', content: '完成首页与日历' }
    ])
  })

  it('拒绝非法日期和过长的日报', () => {
    expect(() => service.save('2026-02-30', 'x')).toThrow(/日期不合法/)
    expect(() => service.list('2026-11-21', '2026-11-20')).toThrow(/日期范围/)
    expect(() => service.save('2026-11-20', 'x'.repeat(20001))).toThrow(/内容过长/)
  })

  it('按周导出只包含有内容的日期，并生成 Markdown', async () => {
    service.save('2026-11-18', '整理搜索')
    service.save('2026-11-20', '完成首页')

    const result = await service.exportWeek('2026-11-16', '2026-11-22')

    expect(result).toEqual({ path: electron.savePath, count: 2 })
    const markdown = await readFile(electron.savePath, 'utf8')
    expect(markdown).toContain('## 默认')
    expect(markdown).toContain('整理搜索')
    expect(markdown).not.toContain('2026-11-19')
  })

  it('空周不弹保存对话框', async () => {
    await expect(service.exportWeek('2026-11-16', '2026-11-22')).rejects.toThrow(/没有可导出/)
    expect(electron.showSaveDialog).not.toHaveBeenCalled()
  })

  it('文本周报按工作项编号，并区分四栏', async () => {
    service.save('2026-11-18', {
      completed: '整理搜索\n补充测试',
      incomplete: '等待评审',
      issues: '接口偶发超时',
      content: ''
    })
    service.save('2026-11-20', '完成首页')
    electron.savePath = path.join(root, 'week.txt')

    const result = await service.exportWeekText('2026-11-16', '2026-11-22')

    expect(result).toEqual({ path: electron.savePath, count: 2 })
    const text = await readFile(electron.savePath, 'utf8')
    expect(text).toContain('完成\n1. 整理搜索\n2. 补充测试')
    expect(text).toContain('未完成\n1. 等待评审')
    expect(text).toContain('问题\n1. 接口偶发超时')
    expect(text).toContain('默认\n1. 完成首页')
    expect(formatWorkLogText(service.list('2026-11-16', '2026-11-22'), labels)).not.toContain('2026-11-')
  })

  it('可以把简单文本周报复制到系统剪贴板', () => {
    service.save('2026-11-18', '整理搜索')
    service.save('2026-11-20', '完成首页')

    expect(service.copyWeekText('2026-11-16', '2026-11-22')).toEqual({ count: 2 })
    expect(electron.writeText).toHaveBeenCalledWith('默认\n1. 整理搜索\n2. 完成首页')
  })

  it('待办完成项写入当天完成栏，同一条不会重复', () => {
    service.addTodoCompletion('2026-11-20', '提交周报')
    service.addTodoCompletion('2026-11-20', '提交周报')
    service.addTodoCompletion('2026-11-20', '整理首页')

    expect(service.list('2026-11-20', '2026-11-20')[0].completed).toBe('提交周报\n整理首页')
  })
})
