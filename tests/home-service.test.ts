import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTempDir, createTestContext, removeTempDir, type TestContext } from './helpers'

let context: TestContext
let root: string

beforeEach(async () => {
  context = createTestContext()
  root = await createTempDir()
})

afterEach(async () => {
  context.close()
  await removeTempDir(root)
})

describe('HomeService', () => {
  it('添加系统应用快捷入口，路径规范化并实时判断是否存在', async () => {
    const appPath = path.join(root, 'editor.desktop')
    await writeFile(appPath, '[Desktop Entry]\nName=Editor\nExec=editor\n')

    const added = await context.home.add({ path: `${root}/./editor.desktop`, label: '编辑器' })
    expect(added).toMatchObject({ label: '编辑器', path: appPath, exists: true })
    expect((await context.home.list())[0]).toMatchObject({ path: appPath, exists: true })

    await removeTempDir(appPath)
    expect((await context.home.list())[0].exists).toBe(false)
  })

  it('同一个应用不能重复添加，移除不存在的入口会报错', async () => {
    const appPath = path.join(root, 'browser.desktop')
    await writeFile(appPath, 'x')
    await context.home.add({ path: appPath, label: 'Browser' })

    await expect(context.home.add({ path: appPath, label: 'Browser' })).rejects.toThrow(/已经在首页/)
    expect(() => context.home.remove(999)).toThrow(/首页应用快捷入口不存在/)
  })

  it('未选择应用或目标不存在时拒绝添加', async () => {
    await expect(context.home.add({ path: '  ' })).rejects.toThrow(/请选择/)
    await expect(context.home.add({ path: path.join(root, 'missing.desktop') })).rejects.toThrow(/应用不存在/)
  })
})

describe('WorkLogRepository', () => {
  it('按日期写入、覆盖和读取工作记录', () => {
    context.workLogs.upsert('2026-11-20', '完成首页')
    context.workLogs.upsert('2026-11-18', '整理搜索')
    context.workLogs.upsert('2026-11-20', '完成首页与日历')

    const logs = context.workLogs.find('2026-11-18', '2026-11-20')
    expect(logs.map((item) => item.date)).toEqual(['2026-11-18', '2026-11-20'])
    expect(logs[1].content).toBe('完成首页与日历')
  })
})
