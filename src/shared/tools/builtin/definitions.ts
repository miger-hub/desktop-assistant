import type { ToolOptionType, ToolOptionValue, ToolResultKind } from '../types'

export interface BuiltinToolOptionDefinition {
  key: string
  type: ToolOptionType
  /** i18n key */
  labelKey: string
  default: ToolOptionValue
  values?: Array<{ value: string | number; labelKey: string }>
}

export interface BuiltinToolDefinition {
  id: string
  version: string
  icon: string
  result: ToolResultKind
  nameKey: string
  descriptionKey: string
  /** i18n key，值是逗号分隔的关键词 */
  keywordsKey: string
  options: BuiltinToolOptionDefinition[]
}

/** 内置工具：随应用编译，可信，直接执行 */
export const BUILTIN_TOOLS: BuiltinToolDefinition[] = [
  {
    id: 'json-formatter',
    version: '1.0.0',
    icon: 'mdi-code-json',
    result: 'tree',
    nameKey: 'tool.jsonFormatter.name',
    descriptionKey: 'tool.jsonFormatter.description',
    keywordsKey: 'tool.jsonFormatter.keywords',
    options: [
      {
        key: 'indent',
        type: 'select',
        labelKey: 'tool.jsonFormatter.indent',
        default: 2,
        values: [
          { value: 2, labelKey: 'tool.jsonFormatter.indent2' },
          { value: 4, labelKey: 'tool.jsonFormatter.indent4' }
        ]
      },
      {
        key: 'sortKeys',
        type: 'switch',
        labelKey: 'tool.jsonFormatter.sortKeys',
        default: false
      },
      {
        key: 'minify',
        type: 'switch',
        labelKey: 'tool.jsonFormatter.minify',
        default: false
      },
      {
        key: 'quoteMode',
        type: 'select',
        labelKey: 'tool.jsonFormatter.quoteMode',
        default: 'none',
        values: [
          { value: 'none', labelKey: 'tool.jsonFormatter.quoteModeNone' },
          { value: 'escape', labelKey: 'tool.jsonFormatter.quoteModeEscape' },
          { value: 'unescape', labelKey: 'tool.jsonFormatter.quoteModeUnescape' }
        ]
      }
    ]
  },
  {
    id: 'json-table',
    version: '1.0.0',
    icon: 'mdi-table-large',
    result: 'table',
    nameKey: 'tool.jsonTable.name',
    descriptionKey: 'tool.jsonTable.description',
    keywordsKey: 'tool.jsonTable.keywords',
    options: [
      {
        key: 'maxRows',
        type: 'select',
        labelKey: 'tool.jsonTable.maxRows',
        default: 200,
        values: [
          { value: 50, labelKey: 'tool.jsonTable.rows50' },
          { value: 100, labelKey: 'tool.jsonTable.rows100' },
          { value: 200, labelKey: 'tool.jsonTable.rows200' },
          { value: 500, labelKey: 'tool.jsonTable.rows500' },
          { value: 0, labelKey: 'tool.jsonTable.rowsAll' }
        ]
      }
    ]
  },
  {
    id: 'xml-json',
    version: '1.0.0',
    icon: 'mdi-xml',
    result: 'tree',
    nameKey: 'tool.xmlJson.name',
    descriptionKey: 'tool.xmlJson.description',
    keywordsKey: 'tool.xmlJson.keywords',
    options: [
      {
        key: 'indent',
        type: 'select',
        labelKey: 'tool.xmlJson.indent',
        default: 2,
        values: [
          { value: 2, labelKey: 'tool.xmlJson.indent2' },
          { value: 4, labelKey: 'tool.xmlJson.indent4' }
        ]
      }
    ]
  }
]

/** 把语言包里的逗号分隔关键词拆成数组 */
export function splitKeywords(value: string): string[] {
  return value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}
