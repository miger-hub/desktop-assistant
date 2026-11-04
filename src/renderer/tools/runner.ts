import {
  isToolResult,
  TOOL_INPUT_MAX,
  TOOL_TABLE_COLUMNS_MAX,
  TOOL_TABLE_ROWS_MAX,
  TOOL_TEXT_MAX,
  type ToolDescriptor,
  type ToolResult
} from '@shared/tools/types'
import { currentLocale } from '../i18n'
import { BUILTIN_RUNNERS, type ToolOptions } from './builtin'

const RUN_TIMEOUT_MS = 5_000

/**
 * 已安装插件的入口是单文件 bundle，只要求暴露 `self.run`。
 * 这里在 Blob Worker 里执行：没有 DOM、没有 Node、没有宿主 IPC。
 * 插件代码之前注入网络禁用 guard，之后注入宿主消息桥。
 */
const WORKER_GUARD = `
;(() => {
  const deny = () => { throw new Error('Network access is disabled for plugins') }
  self.fetch = () => Promise.reject(new Error('Network access is disabled for plugins'))
  self.XMLHttpRequest = function () { deny() }
  self.WebSocket = function () { deny() }
  self.EventSource = function () { deny() }
  self.importScripts = function () { throw new Error('importScripts is disabled for plugins') }
})()
`

/** 插件代码之后追加消息桥，确保 onmessage 由宿主控制 */
const WORKER_BRIDGE = `
;(() => {
  self.onmessage = async function (event) {
    const data = event.data || {}
    if (data.type !== 'run') return
    try {
      if (typeof self.run !== 'function') throw new Error('Plugin entry does not export self.run')
      const result = await self.run(data.input, data.options || {}, { locale: data.locale })
      self.postMessage({ type: 'result', requestId: data.requestId, result })
    } catch (error) {
      self.postMessage({
        type: 'error',
        requestId: data.requestId,
        message: String(error && error.message ? error.message : error)
      })
    }
  }
})()
`

/** 限制结果体积，避免第三方插件返回超大内容把界面卡死 */
function normalizeResult(result: ToolResult): ToolResult {
  if (result.kind === 'text') {
    return result.text.length > TOOL_TEXT_MAX
      ? { kind: 'error', code: 'outputTooLarge', params: { max: TOOL_TEXT_MAX } }
      : result
  }
  if (result.kind === 'table') {
    if (result.columns.length > TOOL_TABLE_COLUMNS_MAX) {
      return { kind: 'error', code: 'outputTooLarge', params: { max: TOOL_TABLE_COLUMNS_MAX } }
    }
    const truncated = result.truncated === true || result.rows.length > TOOL_TABLE_ROWS_MAX
    const rows = result.rows
      .slice(0, TOOL_TABLE_ROWS_MAX)
      .map((row) => row.slice(0, result.columns.length))
    return { ...result, rows, truncated }
  }
  if (result.kind === 'tree') {
    return result.text && result.text.length > TOOL_TEXT_MAX
      ? { kind: 'error', code: 'outputTooLarge', params: { max: TOOL_TEXT_MAX } }
      : result
  }
  return result
}

function runInstalled(toolId: string, input: string, options: ToolOptions): Promise<ToolResult> {
  return new Promise((resolve) => {
    void (async () => {
      let source: { code: string }
      try {
        source = await window.desktop.plugins.entrySource(toolId)
      } catch (error) {
        resolve({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
        return
      }

      const blob = new Blob([WORKER_GUARD, '\n', source.code, '\n', WORKER_BRIDGE], {
        type: 'text/javascript'
      })
      const url = URL.createObjectURL(blob)
      let worker: Worker
      try {
        worker = new Worker(url)
      } catch {
        URL.revokeObjectURL(url)
        resolve({ kind: 'error', code: 'sandbox' })
        return
      }
      const requestId = `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let settled = false
      let timer = 0

      const finish = (result: ToolResult): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        worker.terminate()
        URL.revokeObjectURL(url)
        resolve(normalizeResult(result))
      }

      timer = window.setTimeout(() => {
        finish({ kind: 'error', code: 'timeout', params: { seconds: RUN_TIMEOUT_MS / 1000 } })
      }, RUN_TIMEOUT_MS)

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as {
          type?: string
          requestId?: string
          result?: unknown
          message?: string
        }
        if (data.requestId !== requestId) return
        if (data.type === 'error') {
          finish({ kind: 'error', message: data.message ?? 'Plugin failed' })
          return
        }
        if (!isToolResult(data.result)) {
          finish({ kind: 'error', code: 'badResult' })
          return
        }
        finish(data.result)
      }

      worker.onerror = (event) => {
        finish({ kind: 'error', message: event.message || 'Plugin crashed' })
      }

      try {
        worker.postMessage({
          type: 'run',
          requestId,
          input,
          options: { ...options },
          locale: currentLocale()
        })
      } catch (error) {
        finish({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })()
  })
}

/** 统一执行入口：内置直接跑，已安装走 Worker 沙箱 */
export async function runTool(
  tool: ToolDescriptor,
  input: string,
  options: ToolOptions
): Promise<ToolResult> {
  if (input.length > TOOL_INPUT_MAX) {
    return { kind: 'error', code: 'inputTooLarge', params: { max: TOOL_INPUT_MAX } }
  }

  if (tool.source === 'builtin') {
    const runner = BUILTIN_RUNNERS[tool.id]
    if (!runner) return { kind: 'error', message: `Unknown built-in tool: ${tool.id}` }
    try {
      return normalizeResult(runner(input, { ...options }))
    } catch (error) {
      return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  return runInstalled(tool.id, input, options)
}
