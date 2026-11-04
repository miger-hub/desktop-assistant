import { ipcMain } from 'electron'
import type { Result } from '../../shared/types'
import { fail, ok } from '../errors'

/**
 * 统一注册 IPC handler：
 * 所有返回值都包成 Result，错误不会以异常形式跨进程丢失信息。
 */
export function registerHandler<T>(
  channel: string,
  handler: (...args: never[]) => T | Promise<T>
): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<Result<T>> => {
    try {
      return ok(await handler(...(args as never[])))
    } catch (error) {
      return fail(error)
    }
  })
}
