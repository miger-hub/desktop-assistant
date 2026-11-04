import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WatcherService } from '../src/main/services/WatcherService'
import { createTempDir, removeTempDir } from './helpers'

let root: string

beforeEach(async () => {
  root = await createTempDir()
})

afterEach(async () => {
  await removeTempDir(root)
})

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('WatcherService', () => {
  it('目录里的文件变化会通知一次，unwatch 之后不再通知', async () => {
    const notices: string[] = []
    const watcher = new WatcherService((directory) => notices.push(directory), 50)

    // 个别环境（受限容器 / 网络盘）不支持 fs.watch，此时服务会返回 false，UI 退化成手动刷新
    if (!watcher.watchDirectory(root)) return
    expect(watcher.directory).toBe(root)

    await writeFile(path.join(root, 'a.txt'), 'x')
    await sleep(400)
    expect(notices).toEqual([root])

    watcher.unwatch()
    expect(watcher.directory).toBeNull()

    await writeFile(path.join(root, 'b.txt'), 'x')
    await sleep(300)
    expect(notices).toEqual([root])
  })

  it('连续写入被防抖合并成一次通知', async () => {
    const notices: string[] = []
    const watcher = new WatcherService((directory) => notices.push(directory), 120)

    if (!watcher.watchDirectory(root)) return

    for (let index = 0; index < 5; index += 1) {
      await writeFile(path.join(root, `file-${index}.txt`), 'x')
    }
    await sleep(600)
    watcher.unwatch()

    expect(notices.length).toBe(1)
  })

  it('目录不存在时返回 false，不抛异常', () => {
    const watcher = new WatcherService(() => undefined)
    expect(watcher.watchDirectory(path.join(root, 'missing'))).toBe(false)
    expect(watcher.directory).toBeNull()
  })

  it('unwatchIf 只停止匹配的目录，避免切换目录时把新监听关掉', () => {
    const watcher = new WatcherService(() => undefined)
    if (!watcher.watchDirectory(root)) return

    watcher.unwatchIf(path.join(root, 'other'))
    expect(watcher.directory).toBe(root)

    watcher.unwatchIf(root)
    expect(watcher.directory).toBeNull()
  })
})
