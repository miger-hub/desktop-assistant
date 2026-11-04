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
    new URL('../examples/plugins/case-converter/main.js', import.meta.url)
  )
  const source = await readFile(file, 'utf8')
  const sandbox: { self: { run?: PluginRun } } = { self: {} }
  runInNewContext(source, sandbox, { filename: 'case-converter/main.js' })
  run = sandbox.self.run!
})

describe('case-converter 外置插件', () => {
  it('plugin.json 能通过安装校验', async () => {
    const file = fileURLToPath(
      new URL('../examples/plugins/case-converter/plugin.json', import.meta.url)
    )
    const manifest = parsePluginManifest(JSON.parse(await readFile(file, 'utf8')))
    expect(manifest).toMatchObject({
      id: 'com.desktopassistant.case-converter',
      version: '1.0.0',
      apiVersion: 1,
      input: 'text',
      result: 'text',
      entry: 'main.js'
    })
  })

  it('支持大写 / 小写 / 标题 / 句首 / 反转', async () => {
    expect(await run('Hello World', { mode: 'upper' }, { locale: 'en' })).toMatchObject({
      kind: 'text',
      text: 'HELLO WORLD'
    })
    expect(await run('Hello World', { mode: 'lower' }, { locale: 'en' })).toMatchObject({
      kind: 'text',
      text: 'hello world'
    })
    expect(await run('hello world', { mode: 'title' }, { locale: 'en' })).toMatchObject({
      kind: 'text',
      text: 'Hello World'
    })
    expect(await run('hello. world!', { mode: 'sentence' }, { locale: 'en' })).toMatchObject({
      kind: 'text',
      text: 'Hello. World!'
    })
    expect(await run('Hello', { mode: 'toggle' }, { locale: 'en' })).toMatchObject({
      kind: 'text',
      text: 'hELLO'
    })
  })

  it('默认去除首尾空白，可以关闭', async () => {
    expect(await run('  Hi  ', { mode: 'upper' }, { locale: 'en' })).toMatchObject({
      text: 'HI'
    })
    expect(await run('  Hi  ', { mode: 'upper', trim: false }, { locale: 'en' })).toMatchObject({
      text: '  HI  '
    })
  })

  it('单词内撇号和括号不会破坏标题转换', async () => {
    expect(await run("don't (hello) world", { mode: 'title' }, { locale: 'en' })).toMatchObject({
      text: "Don't (Hello) World"
    })
  })

  it('未知模式按当前语言返回错误', async () => {
    expect(await run('hello', { mode: 'unknown' }, { locale: 'en' })).toEqual({
      kind: 'error',
      message: 'Unknown conversion mode'
    })
    expect(await run('hello', { mode: 'unknown' }, { locale: 'zh-TW' })).toEqual({
      kind: 'error',
      message: '未知的轉換方式'
    })
  })
})
