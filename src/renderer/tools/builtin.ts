import { formatJson, jsonToTable } from '@shared/tools/builtin/json'
import { xmlJson } from '@shared/tools/builtin/xmlJson'
import type { ToolOptionValue, ToolResult } from '@shared/tools/types'

export type ToolOptions = Record<string, ToolOptionValue>

type ToolRunner = (input: string, options: ToolOptions) => ToolResult

/** 内置工具的实现：id 与 shared/tools/builtin/definitions.ts 对应 */
export const BUILTIN_RUNNERS: Record<string, ToolRunner> = {
  'json-formatter': (input, options) => {
    const quoteMode =
      options.quoteMode === 'escape' || options.quoteMode === 'unescape' ? options.quoteMode : 'none'
    return formatJson(input, {
      indent: options.indent === 4 ? 4 : 2,
      sortKeys: options.sortKeys === true,
      minify: options.minify === true,
      quoteMode
    })
  },
  'json-table': (input) => jsonToTable(input),
  'xml-json': (input, options) => xmlJson(input, { indent: options.indent === 4 ? 4 : 2 })
}
