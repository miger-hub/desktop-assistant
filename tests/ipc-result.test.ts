import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 用假 ipcMain 捕获 handler，验证跨进程返回的 Result 信封 */
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }
  }
}))

import type { AppContext } from '../src/main/context'
import { invalidArgument, notFound, ServiceError } from '../src/main/errors'
import { registerFileIpc } from '../src/main/ipc/file'
import { registerHandler } from '../src/main/ipc/handle'
import { IPC } from '../src/shared/ipc'

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`未注册的 channel：${channel}`)
  return Promise.resolve(handler({}, ...args))
}

describe('IPC Result 信封', () => {
  beforeEach(() => handlers.clear())

  it('成功时返回 { ok: true, data }', async () => {
    registerHandler('test:ok', (value: number) => value * 2)
    expect(await invoke('test:ok', 21)).toEqual({ ok: true, data: 42 })
  })

  it('异步 handler 的返回值同样被包裹', async () => {
    registerHandler('test:async', async () => 'done')
    expect(await invoke('test:async')).toEqual({ ok: true, data: 'done' })
  })

  it('ServiceError 保留错误码，不丢失语义', async () => {
    registerHandler('test:not-found', () => {
      throw notFound('路径不存在：/tmp/missing')
    })
    expect(await invoke('test:not-found')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: '路径不存在：/tmp/missing' }
    })
  })

  it('异步抛出的 ServiceError 同样被信封化', async () => {
    registerHandler('test:async-error', async () => {
      throw invalidArgument('名称不能为空')
    })
    expect(await invoke('test:async-error')).toEqual({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', message: '名称不能为空' }
    })
  })

  it('普通异常降级为 UNKNOWN，但保留原始消息', async () => {
    registerHandler('test:unknown', () => {
      throw new Error('boom')
    })
    expect(await invoke('test:unknown')).toEqual({ ok: false, error: { code: 'UNKNOWN', message: 'boom' } })
  })

  it('非 Error 抛出物也能转成可读消息', async () => {
    registerHandler('test:non-error', () => {
      throw 'plain failure'
    })
    expect(await invoke('test:non-error')).toEqual({ ok: false, error: { code: 'UNKNOWN', message: 'plain failure' } })
  })
})

describe('文件相关 IPC 与 Result 的结合', () => {
  beforeEach(() => handlers.clear())

  it('file:rename-many 把参数透传给 FileService 并包裹结果', async () => {
    const calls: unknown[] = []
    const recorded: unknown[] = []
    const files = {
      renameMany: (entries: unknown, options: unknown) => {
        calls.push([entries, options])
        return { succeeded: ['/tmp/b.txt'], failed: [], entries: [{ source: '/tmp/a.txt', target: '/tmp/b.txt' }] }
      }
    }
    const operations = {
      record: (input: unknown) => {
        recorded.push(input)
        return 'batch-1'
      }
    }

    registerFileIpc({ files, operations } as unknown as AppContext)

    const entries = [{ path: '/tmp/a.txt', name: 'b.txt' }]
    const result = await invoke(IPC.fileRenameMany, entries, { overwrite: true })

    expect(result).toEqual({
      ok: true,
      data: { succeeded: ['/tmp/b.txt'], failed: [], entries: [{ source: '/tmp/a.txt', target: '/tmp/b.txt' }] }
    })
    expect(calls).toEqual([[entries, { overwrite: true }]])
    // 手动重命名同样写入操作历史，供撤销使用
    expect(recorded).toEqual([
      { entries: [{ source: '/tmp/a.txt', target: '/tmp/b.txt' }], kind: 'rename', origin: 'manual' }
    ])
  })

  it('FileService 抛出的业务错误原样变成错误信封', async () => {
    const files = {
      renameMany: () => {
        throw new ServiceError('EXISTS', '同名文件已存在：/tmp/b.txt')
      }
    }

    registerFileIpc({ files, operations: { record: () => null } } as unknown as AppContext)

    expect(await invoke(IPC.fileRenameMany, [], {})).toEqual({
      ok: false,
      error: { code: 'EXISTS', message: '同名文件已存在：/tmp/b.txt' }
    })
  })
})
