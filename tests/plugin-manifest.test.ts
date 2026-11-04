import { describe, expect, it } from 'vitest'
import { isSafeRelativePath, parsePluginManifest } from '../src/main/plugins/manifest'

function validManifest(): Record<string, unknown> {
  return {
    id: 'com.example.json-format',
    version: '1.0.0',
    apiVersion: 1,
    input: 'text',
    result: 'text',
    entry: 'main.js',
    locales: {
      'zh-CN': { name: '测试插件', description: '测试', keywords: ['json'] },
      en: { name: 'Test plugin', description: 'Test', keywords: ['json'] }
    },
    options: [{ key: 'indent', type: 'select', default: 2, values: [2, 4] }]
  }
}

describe('插件 manifest 校验', () => {
  it('合法 manifest 会被归一化', () => {
    const manifest = parsePluginManifest(validManifest())
    expect(manifest).toMatchObject({
      id: 'com.example.json-format',
      version: '1.0.0',
      apiVersion: 1,
      input: 'text',
      result: 'text',
      entry: 'main.js'
    })
    expect(manifest.options).toEqual([{ key: 'indent', type: 'select', default: 2, values: [2, 4] }])
  })

  it('拒绝非法 id / API 版本 / 结果类型', () => {
    expect(() => parsePluginManifest({ ...validManifest(), id: 'Bad ID' })).toThrow(/id/)
    expect(() => parsePluginManifest({ ...validManifest(), apiVersion: 99 })).toThrow(/API/)
    expect(() => parsePluginManifest({ ...validManifest(), result: 'custom' })).toThrow(/text \/ table/)
  })

  it('拒绝越界入口路径与绝对路径', () => {
    expect(() => parsePluginManifest({ ...validManifest(), entry: '../main.js' })).toThrow(/入口/)
    expect(() => parsePluginManifest({ ...validManifest(), entry: '/tmp/main.js' })).toThrow(/入口/)
    expect(isSafeRelativePath('ui/index.html')).toBe(true)
    expect(isSafeRelativePath('../evil.js')).toBe(false)
    expect(isSafeRelativePath('C:/evil.js')).toBe(false)
  })

  it('至少需要一个完整语言包', () => {
    expect(() => parsePluginManifest({ ...validManifest(), locales: {} })).toThrow(/语言/)
    expect(() =>
      parsePluginManifest({
        ...validManifest(),
        locales: { 'zh-CN': { name: '缺少关键词', description: 'x', keywords: [] } }
      })
    ).toThrow(/语言包/)
  })

  it('选项默认值必须在可选值里', () => {
    expect(() =>
      parsePluginManifest({
        ...validManifest(),
        options: [{ key: 'indent', type: 'select', default: 8, values: [2, 4] }]
      })
    ).toThrow(/选项/)
  })
})
