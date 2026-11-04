/**
 * 工具 / 插件的运行时契约（共享给主进程和渲染进程）。
 * 这里只有纯数据描述，不依赖 Electron / Vue。
 */

export const TOOL_API_VERSION = 1
/** 单次工具输入上限（2 MB）：避免把超大 JSON 塞进 Worker / 界面 */
export const TOOL_INPUT_MAX = 2 * 1024 * 1024
/** 文本结果上限（2 MB） */
export const TOOL_TEXT_MAX = 2 * 1024 * 1024
/** 表格最多渲染多少行，超出的标记 truncated */
export const TOOL_TABLE_ROWS_MAX = 10_000
/** 表格最多多少列 */
export const TOOL_TABLE_COLUMNS_MAX = 200
/** 单元格最多保留多少字符 */
export const TOOL_CELL_MAX = 10_000
/** 树形结果最多节点数 */
export const TOOL_TREE_NODES_MAX = 20_000
/** 树形结果最大嵌套深度 */
export const TOOL_TREE_DEPTH_MAX = 100
/** 插件入口文件上限（2 MB） */
export const TOOL_ENTRY_MAX = 2 * 1024 * 1024

export type ToolOptionType = 'select' | 'switch'
export type ToolOptionValue = string | number | boolean
export type ToolResultKind = 'text' | 'table' | 'tree'
export type ToolInputKind = 'text'
export type ToolSource = 'builtin' | 'installed'

export interface ToolOption {
  key: string
  type: ToolOptionType
  label: string
  default: ToolOptionValue
  values?: Array<{ value: string | number; label: string }>
}

/** 已解析成当前语言的工具描述，UI / 搜索都直接用它 */
export interface ToolDescriptor {
  id: string
  source: ToolSource
  version: string
  icon: string
  input: ToolInputKind
  result: ToolResultKind
  name: string
  description: string
  keywords: string[]
  options: ToolOption[]
  enabled: boolean
  installedAt?: string
}

export interface ToolTableResult {
  kind: 'table'
  columns: string[]
  rows: string[][]
  /** 行数超过上限时只返回前 TOOL_TABLE_ROWS_MAX 行 */
  truncated?: boolean
}

export type ToolTreeNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

/** 树形结果的一个节点；path 用于全局搜索命中后的定位 */
export interface ToolTreeNode {
  key: string
  path: string
  type: ToolTreeNodeType
  /** 标量值的显示文本 */
  value?: string
  children?: ToolTreeNode[]
}

export interface ToolTreeResult {
  kind: 'tree'
  nodes: ToolTreeNode[]
  /** 可复制的完整文本（通常是格式化后的 JSON） */
  text?: string
  language?: 'json' | 'xml'
}

export interface ToolErrorResult {
  kind: 'error'
  /** 宿主内置错误码（toolError.*），内置工具用 */
  code?: string
  params?: Record<string, string | number>
  /** 已安装插件可以直接给成品文案 */
  message?: string
}

export type ToolResult =
  | { kind: 'text'; text: string; language?: 'json' | 'plain' }
  | ToolTableResult
  | ToolTreeResult
  | ToolErrorResult

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** 校验插件 / Worker 返回的结果结构，避免坏数据把 UI 撑坏 */
export function isToolResult(value: unknown): value is ToolResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  if (result.kind === 'text') return typeof result.text === 'string'
  if (result.kind === 'table') {
    return (
      isStringArray(result.columns) &&
      Array.isArray(result.rows) &&
      result.rows.every((row) => isStringArray(row))
    )
  }
  if (result.kind === 'error') {
    return typeof result.message === 'string' || typeof result.code === 'string'
  }
  if (result.kind === 'tree') {
    if (!Array.isArray(result.nodes)) return false
    const budget = { nodes: 0 }
    const validNode = (node: unknown, depth: number): node is ToolTreeNode => {
      if (!node || typeof node !== 'object' || depth > TOOL_TREE_DEPTH_MAX) return false
      const value = node as Record<string, unknown>
      if (typeof value.key !== 'string' || typeof value.path !== 'string') return false
      if (!['object', 'array', 'string', 'number', 'boolean', 'null'].includes(String(value.type))) return false
      if (value.value !== undefined && typeof value.value !== 'string') return false
      budget.nodes += 1
      if (budget.nodes > TOOL_TREE_NODES_MAX) return false
      if (value.children !== undefined) {
        if (!Array.isArray(value.children)) return false
        return value.children.every((child) => validNode(child, depth + 1))
      }
      return true
    }
    if (!result.nodes.every((node) => validNode(node, 0))) return false
    return result.text === undefined || typeof result.text === 'string'
  }
  return false
}

/** 工具搜索结果匹配：名称 / 描述 / id / 关键词 */
export function matchesTool(tool: ToolDescriptor, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase()
  if (!needle || !tool.enabled) return false
  return [tool.name, tool.description, tool.id, ...tool.keywords].some((value) =>
    value.toLowerCase().includes(needle)
  )
}
