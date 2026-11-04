import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import {
  TOOL_INPUT_MAX,
  TOOL_TEXT_MAX,
  TOOL_TREE_DEPTH_MAX,
  TOOL_TREE_NODES_MAX,
  type ToolResult,
  type ToolTreeNode
} from '../types'
import { buildTreeNodes, formatJson } from './json'

export interface XmlJsonOptions {
  indent?: 2 | 4
}

function spacesOf(indent: number | undefined): number {
  return indent === 4 ? 4 : 2
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const XML_PARSE_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  trimValues: true,
  preserveOrder: true
}

interface TreeBudget {
  nodes: number
}

function parseEmbeddedJson(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function cdataText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => (item && typeof item === 'object' ? String((item as Record<string, unknown>)['#text'] ?? '') : ''))
    .join('')
}

/**
 * 把 XML AST 里可解析为 JSON 的文本 / CDATA 内容格式化：
 * - 普通文本里的 JSON 转成 CDATA，避免 XML 把引号转义成 &quot;；
 * - 已经是 CDATA 的 JSON 直接美化。
 */
function formatAst(nodes: unknown[], spaces: number): unknown[] {
  return nodes.map((node) => formatAstNode(node, spaces))
}

function formatAstNode(node: unknown, spaces: number): unknown {
  if (!node || typeof node !== 'object') return node
  const source = node as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(source)) {
    if (key === '#text') {
      const text = String(value ?? '')
      const embedded = parseEmbeddedJson(text)
      if (embedded !== null) {
        const pretty = JSON.stringify(embedded, null, spaces) ?? ''
        if (!pretty.includes(']]>')) {
          result['#cdata'] = [{ '#text': pretty }]
          continue
        }
      }
      result['#text'] = value
    } else if (key === '#cdata') {
      const items = Array.isArray(value) ? value : []
      result['#cdata'] = items.map((item) => {
        if (!item || typeof item !== 'object') return item
        const record = item as Record<string, unknown>
        if (typeof record['#text'] !== 'string') return item
        const embedded = parseEmbeddedJson(record['#text'])
        if (embedded === null) return item
        const pretty = JSON.stringify(embedded, null, spaces) ?? ''
        return pretty.includes(']]>') ? item : { ...record, '#text': pretty }
      })
    } else if (key === ':@') {
      result[key] = value
    } else if (Array.isArray(value)) {
      result[key] = formatAst(value, spaces)
    } else {
      result[key] = value
    }
  }

  return result
}

function countTreeNodes(nodes: ToolTreeNode[]): number {
  let count = 0
  const walk = (list: ToolTreeNode[]): void => {
    for (const node of list) {
      count += 1
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return count
}

/** 把 preserveOrder XML AST 转成适合展示的树（元素 / 属性 / 文本） */
function xmlNodesToTree(
  nodes: unknown[],
  parentPath: string,
  depth: number,
  budget: TreeBudget
): ToolTreeNode[] | null {
  if (depth > TOOL_TREE_DEPTH_MAX) return null
  const result: ToolTreeNode[] = []
  let index = 0

  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') continue
    const node = raw as Record<string, unknown>
    const attrs = node[':@']

    for (const [key, value] of Object.entries(node)) {
      if (key === ':@') continue
      const path = `${parentPath}/${index++}`
      budget.nodes += 1
      if (budget.nodes > TOOL_TREE_NODES_MAX) return null

      // 文本 / CDATA：如果内容本身是 JSON 对象 / 数组，展示成 JSON 子树
      if (key === '#text' || key === '#cdata') {
        const text = key === '#cdata' ? cdataText(value) : String(value ?? '')
        const embedded = parseEmbeddedJson(text)
        if (embedded !== null) {
          const children = buildTreeNodes(embedded, path)
          if (!children) return null
          result.push({
            key: '#json',
            path,
            type: Array.isArray(embedded) ? 'array' : 'object',
            children
          })
        } else {
          result.push({ key, path, type: 'string', value: text })
        }
        continue
      }

      // 注释 / DOCTYPE 等没有子元素的节点
      if (key.startsWith('#') || key.startsWith('?') || key.startsWith('!')) {
        result.push({ key, path, type: 'string', value: String(value ?? '') })
        continue
      }

      const children: ToolTreeNode[] = []
      if (attrs && typeof attrs === 'object') {
        const attrEntries = Object.entries(attrs as Record<string, unknown>)
        for (let attrIndex = 0; attrIndex < attrEntries.length; attrIndex += 1) {
          const [attrKey, attrValue] = attrEntries[attrIndex]
          budget.nodes += 1
          if (budget.nodes > TOOL_TREE_NODES_MAX) return null
          children.push({
            key: attrKey.replace(/^@_/, '@'),
            path: `${path}/attrs/${attrIndex}`,
            type: 'string',
            value: String(attrValue ?? '')
          })
        }
      }
      if (Array.isArray(value)) {
        const nested = xmlNodesToTree(value, `${path}/nodes`, depth + 1, budget)
        if (!nested) return null
        children.push(...nested)
      }
      result.push({ key, path, type: 'object', children })
    }
  }

  return result
}

/**
 * XML / JSON 嵌套数据格式化。
 * 自动识别输入类型，按各自类型格式化，不做 XML ↔ JSON 转换：
 * - XML → XML 文本 + XML 树
 * - JSON → JSON 文本 + JSON 树
 */
export function xmlJson(input: string, options: XmlJsonOptions = {}): ToolResult {
  const trimmed = input.trim()
  if (!trimmed) return { kind: 'error', code: 'emptyInput' }
  if (input.length > TOOL_INPUT_MAX) {
    return { kind: 'error', code: 'inputTooLarge', params: { max: TOOL_INPUT_MAX } }
  }

  const spaces = spacesOf(options.indent)
  return trimmed.startsWith('<') ? formatXml(trimmed, spaces) : formatJson(input, { indent: spaces === 4 ? 4 : 2 })
}

function formatXml(input: string, spaces: number): ToolResult {
  const validation = XMLValidator.validate(input)
  if (validation !== true) {
    return { kind: 'error', code: 'invalidXml', params: { detail: validation.err.msg } }
  }

  let ast: unknown
  try {
    ast = new XMLParser(XML_PARSE_OPTIONS).parse(input)
  } catch (error) {
    return { kind: 'error', code: 'invalidXml', params: { detail: detailOf(error) } }
  }
  if (!Array.isArray(ast)) return { kind: 'error', code: 'invalidXml', params: { detail: 'empty AST' } }

  const formattedAst = formatAst(ast, spaces)
  const nodes = xmlNodesToTree(formattedAst, '$', 0, { nodes: 0 })
  if (!nodes) return { kind: 'error', code: 'tooManyNodes', params: { max: TOOL_TREE_NODES_MAX } }
  if (countTreeNodes(nodes) > TOOL_TREE_NODES_MAX) {
    return { kind: 'error', code: 'tooManyNodes', params: { max: TOOL_TREE_NODES_MAX } }
  }

  let text: string
  try {
    text = new XMLBuilder({
      ...XML_PARSE_OPTIONS,
      format: true,
      indentBy: ' '.repeat(spaces),
      suppressEmptyNode: false
    }).build(formattedAst)
  } catch (error) {
    return { kind: 'error', code: 'invalidXml', params: { detail: detailOf(error) } }
  }
  if (!text.endsWith('\n')) text += '\n'
  if (text.length > TOOL_TEXT_MAX) {
    return { kind: 'error', code: 'outputTooLarge', params: { max: TOOL_TEXT_MAX } }
  }
  return { kind: 'tree', nodes, text, language: 'xml' }
}
