import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { beforeAll, describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../src/main/plugins/manifest'

interface PluginResult {
  kind: string
  text?: string
  language?: string
  message?: string
}

type PluginRun = (
  input: string,
  options: Record<string, unknown>,
  context: { locale: string }
) => Promise<PluginResult>

let run: PluginRun

beforeAll(async () => {
  const file = fileURLToPath(
    new URL('../examples/plugins/snake-camel-converter/main.js', import.meta.url)
  )
  const source = await readFile(file, 'utf8')
  const sandbox: { self: { run?: PluginRun } } = { self: {} }
  runInNewContext(source, sandbox, { filename: 'snake-camel-converter/main.js' })
  run = sandbox.self.run!
})

describe('snake-camel-converter 外置插件', () => {
  it('plugin.json 能通过安装校验', async () => {
    const file = fileURLToPath(
      new URL('../examples/plugins/snake-camel-converter/plugin.json', import.meta.url)
    )
    const manifest = parsePluginManifest(JSON.parse(await readFile(file, 'utf8')))
    expect(manifest).toMatchObject({
      id: 'com.desktopassistant.snake-camel-converter',
      version: '1.0.0',
      apiVersion: 1,
      input: 'text',
      result: 'text',
      entry: 'main.js'
    })
  })

  it('下划线 / 连字符转 camelCase', async () => {
    expect(await run('foo_bar_baz', { mode: 'toCamel' }, { locale: 'en' })).toMatchObject({
      text: 'fooBarBaz'
    })
    expect(await run('foo-bar-baz', { mode: 'toCamel' }, { locale: 'en' })).toMatchObject({
      text: 'fooBarBaz'
    })
    expect(await run('XMLHttpRequest', { mode: 'toCamel' }, { locale: 'en' })).toMatchObject({
      text: 'xMLHttpRequest'
    })
  })

  it('camelCase / PascalCase 转 snake_case', async () => {
    expect(await run('fooBarBaz', { mode: 'toSnake' }, { locale: 'en' })).toMatchObject({
      text: 'foo_bar_baz'
    })
    expect(await run('FooBarBaz', { mode: 'toSnake' }, { locale: 'en' })).toMatchObject({
      text: 'foo_bar_baz'
    })
    expect(await run('userID', { mode: 'toSnake' }, { locale: 'en' })).toMatchObject({
      text: 'user_i_d'
    })
    expect(await run('XMLHttpRequest', { mode: 'toSnake' }, { locale: 'en' })).toMatchObject({
      text: 'x_m_l_http_request'
    })
  })

  it('支持 PascalCase / kebab-case', async () => {
    expect(await run('foo-bar-baz', { mode: 'toPascal' }, { locale: 'en' })).toMatchObject({
      text: 'FooBarBaz'
    })
    expect(await run('foo_bar_baz', { mode: 'toKebab' }, { locale: 'en' })).toMatchObject({
      text: 'foo-bar-baz'
    })
  })

  it('空格 / Tab / 换行等空白分隔转换单元，并逐行输出', async () => {
    expect(
      await run('foo_bar  baz-qux\nquux\tlastName', { mode: 'toCamel' }, { locale: 'en' })
    ).toMatchObject({
      text: 'fooBar\nbazQux\nquux\nlastName'
    })
    expect(
      await run(' fooBar\r\nPascalCase\tkebab-case ', { mode: 'toSnake' }, { locale: 'en' })
    ).toMatchObject({
      text: 'foo_bar\npascal_case\nkebab_case'
    })
  })

  it('连续大写字母逐个视为单词，并可反向恢复', async () => {
    expect(await run('AAA', { mode: 'toSnake' }, { locale: 'en' })).toMatchObject({
      text: 'a_a_a'
    })
    expect(await run('a_a_a', { mode: 'toPascal' }, { locale: 'en' })).toMatchObject({
      text: 'AAA'
    })
    expect(await run('a_a_a', { mode: 'toCamel' }, { locale: 'en' })).toMatchObject({
      text: 'aAA'
    })
    expect(await run('foo_a_b_bar', { mode: 'toCamel' }, { locale: 'en' })).toMatchObject({
      text: 'fooABBar'
    })
  })

  it('空输入和未知模式返回本地化错误', async () => {
    expect(await run('   ', { mode: 'toCamel' }, { locale: 'en' })).toEqual({
      kind: 'error',
      message: 'Enter some text to convert'
    })
    expect(await run('foo', { mode: 'nope' }, { locale: 'zh-TW' })).toEqual({
      kind: 'error',
      message: '未知的轉換方式'
    })
  })
})
