import {
  TOOL_CELL_MAX,
  TOOL_INPUT_MAX,
  TOOL_TABLE_COLUMNS_MAX,
  TOOL_TABLE_ROWS_MAX,
  TOOL_TREE_DEPTH_MAX,
  TOOL_TREE_NODES_MAX,
  TOOL_TEXT_MAX,
  type ToolTreeNode,
  type ToolResult
} from '../types'

export interface JsonFormatOptions {
  indent?: 2 | 4
  sortKeys?: boolean
  minify?: boolean
  /** 双引号处理：保持 / 转义 / 去转义 */
  quoteMode?: 'none' | 'escape' | 'unescape'
}

function isEmptyInput(input: string): boolean {
  return input.trim().length === 0
}

function tooLarge(input: string): boolean {
  return input.length > TOOL_INPUT_MAX
}

function parseJson(input: string): { value: unknown } | { error: ToolResult } {
  try {
    return { value: JSON.parse(input.trim()) }
  } catch (error) {
    return {
      error: {
        kind: 'error',
        code: 'invalidJson',
        params: { detail: error instanceof Error ? error.message : String(error) }
      }
    }
  }
}

/**
 * 去转义：
 * - 输入本身是 JSON 字符串字面量时（如 "\"{\\\"a\\\":1}\""），先取里面的字符串；
 * - 否则把 `{\"a\":\"sss\"}` 这类文本里的 `\"` 还原成 `"`。
 */
function unescapeJsonText(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const value: unknown = JSON.parse(trimmed)
      if (typeof value === 'string') return value
    } catch {
      // 不是完整 JSON 字符串字面量，走下面的简单去转义
    }
  }
  return trimmed.replace(/\\"/g, '"')
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, sortObjectKeys(source[key])])
    )
  }
  return value
}

function buildNode(
  key: string,
  path: string,
  value: unknown,
  depth: number,
  budget: { nodes: number }
): ToolTreeNode | null {
  if (depth > TOOL_TREE_DEPTH_MAX) return null
  budget.nodes += 1
  if (budget.nodes > TOOL_TREE_NODES_MAX) return null

  if (Array.isArray(value)) {
    const children: ToolTreeNode[] = []
    for (let index = 0; index < value.length; index += 1) {
      const child = buildNode(`[${index}]`, `${path}/${index}`, value[index], depth + 1, budget)
      if (!child) return null
      children.push(child)
    }
    return { key, path, type: 'array', children }
  }

  if (value && typeof value === 'object') {
    const children: ToolTreeNode[] = []
    const entries = Object.entries(value as Record<string, unknown>)
    for (let index = 0; index < entries.length; index += 1) {
      const [childKey, childValue] = entries[index]
      const child = buildNode(childKey, `${path}/${index}`, childValue, depth + 1, budget)
      if (!child) return null
      children.push(child)
    }
    return { key, path, type: 'object', children }
  }

  if (value === null) return { key, path, type: 'null', value: 'null' }
  if (typeof value === 'string') return { key, path, type: 'string', value }
  if (typeof value === 'number') return { key, path, type: 'number', value: String(value) }
  if (typeof value === 'boolean') return { key, path, type: 'boolean', value: String(value) }
  return { key, path, type: 'null', value: 'null' }
}

export function buildTreeNodes(value: unknown, basePath = '$'): ToolTreeNode[] | null {
  const budget = { nodes: 0 }
  if (Array.isArray(value)) {
    const nodes: ToolTreeNode[] = []
    for (let index = 0; index < value.length; index += 1) {
      const node = buildNode(`[${index}]`, `${basePath}/${index}`, value[index], 0, budget)
      if (!node) return null
      nodes.push(node)
    }
    return nodes
  }
  if (value && typeof value === 'object') {
    const nodes: ToolTreeNode[] = []
    const entries = Object.entries(value as Record<string, unknown>)
    for (let index = 0; index < entries.length; index += 1) {
      const [key, childValue] = entries[index]
      const node = buildNode(key, `${basePath}/${index}`, childValue, 0, budget)
      if (!node) return null
      nodes.push(node)
    }
    return nodes
  }
  const node = buildNode('$', basePath, value, 0, budget)
  return node ? [node] : null
}

/** 格式化 / 压缩 JSON，并生成可折叠的树 */
export function formatJson(input: string, options: JsonFormatOptions = {}): ToolResult {
  if (isEmptyInput(input)) return { kind: 'error', code: 'emptyInput' }
  if (tooLarge(input)) return { kind: 'error', code: 'inputTooLarge', params: { max: TOOL_INPUT_MAX } }

  const source = options.quoteMode === 'unescape' ? unescapeJsonText(input) : input
  const parsed = parseJson(source)
  if ('error' in parsed) return parsed.error

  const value = options.sortKeys ? sortObjectKeys(parsed.value) : parsed.value
  const formatted = options.minify
    ? (JSON.stringify(value) ?? 'null')
    : (JSON.stringify(value, null, options.indent === 4 ? 4 : 2) ?? 'null')
  const text = options.quoteMode === 'escape' ? formatted.replace(/"/g, '\\"') : formatted

  if (text.length > TOOL_TEXT_MAX) {
    return { kind: 'error', code: 'outputTooLarge', params: { max: TOOL_TEXT_MAX } }
  }
  const nodes = buildTreeNodes(value)
  if (!nodes) return { kind: 'error', code: 'tooManyNodes', params: { max: TOOL_TREE_NODES_MAX } }
  return { kind: 'tree', nodes, text, language: 'json' }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 单元格统一转字符串；嵌套对象 / 数组保留 JSON 文本 */
export function formatCell(value: unknown): string {
  let text: string
  if (value === null) text = 'null'
  else if (value === undefined) text = ''
  else if (typeof value === 'string') text = value === '' ? '""' : value
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value)
  else {
    try {
      text = JSON.stringify(value) ?? ''
    } catch {
      text = String(value)
    }
  }
  return text.length > TOOL_CELL_MAX ? `${text.slice(0, TOOL_CELL_MAX)}…` : text
}

/**
 * JSON 数组 → 表格：
 * - 对象数组：列取所有对象 key 的并集（首次出现顺序）
 * - 混入原始值时补一列 value
 * - 嵌套对象 / 数组在单元格里 JSON 化
 */
export function jsonToTable(input: string): ToolResult {
  if (isEmptyInput(input)) return { kind: 'error', code: 'emptyInput' }
  if (tooLarge(input)) return { kind: 'error', code: 'inputTooLarge', params: { max: TOOL_INPUT_MAX } }

  const parsed = parseJson(input)
  if ('error' in parsed) return parsed.error
  if (!Array.isArray(parsed.value)) return { kind: 'error', code: 'notArray' }
  if (parsed.value.length === 0) return { kind: 'error', code: 'emptyArray' }

  const truncated = parsed.value.length > TOOL_TABLE_ROWS_MAX
  const items = parsed.value.slice(0, TOOL_TABLE_ROWS_MAX)
  const hasPrimitive = items.some((item) => !isPlainObject(item))

  const columns: string[] = hasPrimitive ? ['value'] : []
  for (const item of items) {
    if (!isPlainObject(item)) continue
    for (const key of Object.keys(item)) {
      if (columns.length >= TOOL_TABLE_COLUMNS_MAX) break
      if (!columns.includes(key)) columns.push(key)
    }
  }
  if (columns.length === 0) columns.push('value')

  const rows = items.map((item) =>
    columns.map((column) => {
      if (column === 'value' && !isPlainObject(item)) return formatCell(item)
      return isPlainObject(item) ? formatCell(item[column]) : ''
    })
  )

  return { kind: 'table', columns, rows, truncated }
}
