import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../src/main/services/DatabaseService'
import { WorkLogRepository } from '../src/main/repositories/WorkLogRepository'
import { formatWorkLogText, WorkLogService } from '../src/main/services/WorkLogService'
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
    expect(markdown).toContain('2026-11-18')
    expect(markdown).toContain('整理搜索')
    expect(markdown).toContain('2026-11-20')
    expect(markdown).not.toContain('2026-11-19')
  })

  it('空周不弹保存对话框', async () => {
    await expect(service.exportWeek('2026-11-16', '2026-11-22')).rejects.toThrow(/没有可导出/)
    expect(electron.showSaveDialog).not.toHaveBeenCalled()
  })

  it('简单文本周报不含日期，只按 1 / 2 / 3 编号并保留多行内容', async () => {
    service.save('2026-11-18', '整理搜索\n补充测试')
    service.save('2026-11-20', '完成首页')
    electron.savePath = path.join(root, 'week.txt')

    const result = await service.exportWeekText('2026-11-16', '2026-11-22')

    expect(result).toEqual({ path: electron.savePath, count: 2 })
    expect(await readFile(electron.savePath, 'utf8')).toBe('1. 整理搜索\n   补充测试\n2. 完成首页')
    expect(formatWorkLogText(service.list('2026-11-16', '2026-11-22'))).not.toContain('2026-11-')
  })

  it('可以把简单文本周报复制到系统剪贴板', () => {
    service.save('2026-11-18', '整理搜索')
    service.save('2026-11-20', '完成首页')

    expect(service.copyWeekText('2026-11-16', '2026-11-22')).toEqual({ count: 2 })
    expect(electron.writeText).toHaveBeenCalledWith('1. 整理搜索\n2. 完成首页')
  })
})
