import { describe, expect, it } from 'vitest'
import type { OpenWithRule } from '../src/shared/types'
import { fileExtension, normalizeOpenWithRules, parseOpenWithRules, resolveOpenWith } from '../src/main/services/openWith'

const rule = (extension: string, program = '/usr/bin/app'): OpenWithRule => ({ extension, program })

describe('fileExtension', () => {
  it('取扩展名并转小写，没有扩展名或点开头时返回空串', () => {
    expect(fileExtension('/tmp/Note.MD')).toBe('md')
    expect(fileExtension('/tmp/archive.tar.gz')).toBe('gz')
    expect(fileExtension('/tmp/README')).toBe('')
    expect(fileExtension('/home/u/.bashrc')).toBe('')
  })
})

describe('normalizeOpenWithRules', () => {
  it('去点、小写，重复扩展名保留第一条，程序去空白', () => {
    expect(
      normalizeOpenWithRules([
        { extension: '.MD', program: ' /usr/bin/typora ' },
        { extension: 'md', program: '/usr/bin/other' },
        { extension: '*', program: '/usr/bin/open' }
      ])
    ).toEqual([
      { extension: 'md', program: '/usr/bin/typora' },
      { extension: '*', program: '/usr/bin/open' }
    ])
  })

  it('非数组、扩展名非法、缺少程序都会报错', () => {
    expect(() => normalizeOpenWithRules('nope')).toThrow(/格式/)
    expect(() => normalizeOpenWithRules([{ extension: '', program: '/x' }])).toThrow(/扩展名/)
    expect(() => normalizeOpenWithRules([{ extension: 'm d', program: '/x' }])).toThrow(/扩展名/)
    expect(() => normalizeOpenWithRules([{ extension: 'txt', program: '   ' }])).toThrow(/程序/)
  })
})

describe('parseOpenWithRules', () => {
  it('解析库里的 JSON；空值或坏 JSON 退回空列表', () => {
    expect(parseOpenWithRules('[{"extension":".MD","program":"/x"}]')).toEqual([rule('md', '/x')])
    expect(parseOpenWithRules(undefined)).toEqual([])
    expect(parseOpenWithRules('not json')).toEqual([])
    expect(parseOpenWithRules('{"extension":"md"}')).toEqual([])
  })
})

describe('resolveOpenWith', () => {
  const rules = [rule('md', '/typora'), rule('*', '/fallback')]

  it('先按扩展名精确匹配，再退回 *', () => {
    expect(resolveOpenWith(rules, '/tmp/a.md')?.program).toBe('/typora')
    expect(resolveOpenWith(rules, '/tmp/a.md')?.program).toBe('/typora')
    expect(resolveOpenWith(rules, '/tmp/a.txt')?.program).toBe('/fallback')
  })

  it('没有规则或没有匹配项时返回 null', () => {
    expect(resolveOpenWith([], '/tmp/a.md')).toBeNull()
    expect(resolveOpenWith([rule('md', '/typora')], '/tmp/a.txt')).toBeNull()
  })

  it('没有扩展名的文件只能命中 *', () => {
    expect(resolveOpenWith(rules, '/tmp/README')?.program).toBe('/fallback')
    expect(resolveOpenWith([rule('md', '/typora')], '/tmp/README')).toBeNull()
  })
})
