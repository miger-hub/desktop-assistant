import { describe, expect, it } from 'vitest'
import { formatJson, jsonToTable } from '../src/shared/tools/builtin/json'
import { TOOL_INPUT_MAX, TOOL_TABLE_ROWS_MAX } from '../src/shared/tools/types'

describe('JSON 格式化工具', () => {
  it('按 2 / 4 空格格式化', () => {
    const result = formatJson('{"b":1,"a":[2,3]}', { indent: 2 })
    expect(result).toMatchObject({
      kind: 'tree',
      text: '{\n  "b": 1,\n  "a": [\n    2,\n    3\n  ]\n}',
      language: 'json'
    })
    if (result.kind !== 'tree') return
    expect(result.nodes).toEqual([
      { key: 'b', path: '$/0', type: 'number', value: '1' },
      {
        key: 'a',
        path: '$/1',
        type: 'array',
        children: [
          { key: '[0]', path: '$/1/0', type: 'number', value: '2' },
          { key: '[1]', path: '$/1/1', type: 'number', value: '3' }
        ]
      }
    ])
    expect(formatJson('{"a":1}', { indent: 4 })).toMatchObject({
      kind: 'tree',
      text: '{\n    "a": 1\n}'
    })
  })

  it('压缩与按键排序', () => {
    const result = formatJson('{ "b": 1, "a": { "d": 2, "c": 3 } }', { minify: true, sortKeys: true })
    expect(result).toMatchObject({
      kind: 'tree',
      text: '{"a":{"c":3,"d":2},"b":1}',
      language: 'json'
    })
    if (result.kind !== 'tree') return
    expect(result.nodes.map((node) => node.key)).toEqual(['a', 'b'])
    expect(result.nodes[0]?.children?.map((node) => node.key)).toEqual(['c', 'd'])
  })

  it('空输入 / 非法 JSON / 超大输入', () => {
    expect(formatJson('   ')).toMatchObject({ kind: 'error', code: 'emptyInput' })
    expect(formatJson('{bad')).toMatchObject({ kind: 'error', code: 'invalidJson' })
    expect(formatJson('x'.repeat(TOOL_INPUT_MAX + 1))).toMatchObject({ kind: 'error', code: 'inputTooLarge' })
  })

  it('双引号转义与去转义可以互相转化', () => {
    const escaped = formatJson('{"a":"sss","b":"kkk"}', { quoteMode: 'escape', minify: true })
    expect(escaped).toMatchObject({
      kind: 'tree',
      text: '{\\"a\\":\\"sss\\",\\"b\\":\\"kkk\\"}'
    })
    if (escaped.kind === 'tree') {
      expect(escaped.nodes.map((node) => node.key)).toEqual(['a', 'b'])
    }

    const unescaped = formatJson('{\\"a\\":\\"sss\\",\\"b\\":\\"kkk\\"}', {
      quoteMode: 'unescape',
      minify: true
    })
    expect(unescaped).toMatchObject({ kind: 'tree', text: '{"a":"sss","b":"kkk"}' })

    // 也支持输入是 JSON 字符串字面量： "{\"a\":1}"
    expect(formatJson('"{\\"a\\":1}"', { quoteMode: 'unescape', minify: true })).toMatchObject({
      kind: 'tree',
      text: '{"a":1}'
    })

    expect(formatJson('{\\"a\\":}', { quoteMode: 'unescape', minify: true })).toMatchObject({
      kind: 'error',
      code: 'invalidJson'
    })
  })
})

describe('JSON 数组转表格工具', () => {
  it('对象数组取 key 并集，嵌套值 JSON 化', () => {
    const result = jsonToTable('[{"id":1,"name":"A","meta":{"x":2}},{"id":2,"extra":true}]')
    expect(result).toEqual({
      kind: 'table',
      columns: ['id', 'name', 'meta', 'extra'],
      rows: [
        ['1', 'A', '{"x":2}', ''],
        ['2', '', '', 'true']
      ],
      truncated: false
    })
  })

  it('混入原始值时补 value 列', () => {
    const result = jsonToTable('[1,"two",{"id":3}]')
    expect(result).toMatchObject({
      kind: 'table',
      columns: ['value', 'id'],
      rows: [
        ['1', ''],
        ['two', ''],
        ['', '3']
      ]
    })
  })

  it('null、空字符串和缺失值可以区分', () => {
    expect(jsonToTable('[{"a":null,"b":"","c":0}]')).toMatchObject({
      kind: 'table',
      columns: ['a', 'b', 'c'],
      rows: [['null', '""', '0']]
    })
  })

  it('顶层必须是数组，空数组报错', () => {
    expect(jsonToTable('{"a":1}')).toMatchObject({ kind: 'error', code: 'notArray' })
    expect(jsonToTable('[]')).toMatchObject({ kind: 'error', code: 'emptyArray' })
    expect(jsonToTable('')).toMatchObject({ kind: 'error', code: 'emptyInput' })
  })

  it('超过行数上限时截断并标记', () => {
    const items = Array.from({ length: TOOL_TABLE_ROWS_MAX + 3 }, (_, index) => ({ id: index }))
    const result = jsonToTable(JSON.stringify(items))
    expect(result.kind).toBe('table')
    if (result.kind !== 'table') return
    expect(result.rows).toHaveLength(TOOL_TABLE_ROWS_MAX)
    expect(result.truncated).toBe(true)
  })
})
