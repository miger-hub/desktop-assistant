import { describe, expect, it } from 'vitest'
import { xmlJson } from '../src/shared/tools/builtin/xmlJson'

const XML = '<root id="1"><user><name>A</name><tag>x</tag><tag>y</tag></user><empty/></root>'

describe('XML / JSON 嵌套数据格式化（按各自类型）', () => {
  it('XML 输入格式化为 XML 文本和 XML 元素树，不做转换', () => {
    const result = xmlJson(XML)
    expect(result.kind).toBe('tree')
    if (result.kind !== 'tree') return
    expect(result.language).toBe('xml')
    expect(result.text).toContain('<root id="1">')
    expect(result.text).toContain('<tag>x</tag>')
    expect(result.text).toContain('<empty></empty>')
    expect(result.text).not.toContain('"@_id"')

    const root = result.nodes[0]
    expect(root).toMatchObject({ key: 'root', type: 'object' })
    expect(root?.children?.map((node) => node.key)).toEqual(['@id', 'user', 'empty'])
  })

  it('JSON 输入格式化为 JSON 文本和 JSON 树，不生成 XML', () => {
    const result = xmlJson(
      JSON.stringify({ root: { '@_id': '1', user: { name: 'A', tag: ['x', 'y'] }, empty: '' } })
    )
    expect(result.kind).toBe('tree')
    if (result.kind !== 'tree') return
    expect(result.language).toBe('json')
    expect(result.text).toContain('"@_id": "1"')
    expect(result.text).not.toContain('<root')
    expect(result.nodes[0]?.key).toBe('root')
  })

  it('JSON 根数组保持 JSON 格式化', () => {
    const result = xmlJson('[1,2]')
    expect(result.kind).toBe('tree')
    if (result.kind !== 'tree') return
    expect(result.language).toBe('json')
    expect(result.text).toBe('[\n  1,\n  2\n]')
    expect(result.nodes.map((node) => node.key)).toEqual(['[0]', '[1]'])
  })

  it('XML 文本里的 JSON 会结构化成 JSON 子树，并在 XML 文本里格式化', () => {
    const result = xmlJson('<root><config>{"name":"Alice","items":[1,2]}</config></root>')
    expect(result.kind).toBe('tree')
    if (result.kind !== 'tree') return

    expect(result.text).toContain('<![CDATA[')
    expect(result.text).toContain('"name": "Alice"')
    expect(result.text).not.toContain('&quot;name&quot;')

    const root = result.nodes[0]
    const config = root?.children?.find((node) => node.key === 'config')
    const json = config?.children?.find((node) => node.key === '#json')
    expect(json).toMatchObject({ type: 'object' })
    expect(json?.children?.map((node) => node.key)).toEqual(['name', 'items'])
  })

  it('空输入 / 非法 XML / 非法 JSON 会返回错误', () => {
    expect(xmlJson('   ')).toMatchObject({ kind: 'error', code: 'emptyInput' })
    expect(xmlJson('<root><a></root>')).toMatchObject({ kind: 'error', code: 'invalidXml' })
    expect(xmlJson('{bad}')).toMatchObject({ kind: 'error', code: 'invalidJson' })
  })
})
