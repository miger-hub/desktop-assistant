import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginRepository } from '../src/main/plugins/PluginRepository'
import { PluginService } from '../src/main/plugins/PluginService'
import type { TestContext } from './helpers'
import { createTempDir, createTestContext, removeTempDir } from './helpers'

let context: TestContext
let tempDir: string
let pluginRoot: string
let service: PluginService

function manifest(id = 'com.example.test-tool') {
  return {
    id,
    version: '1.0.0',
    apiVersion: 1,
    input: 'text',
    result: 'text',
    entry: 'main.js',
    locales: {
      'zh-CN': { name: '测试工具', description: '把输入转成大写', keywords: ['upper', '测试'] },
      en: { name: 'Test tool', description: 'Uppercase the input', keywords: ['upper', 'test'] }
    },
    options: []
  }
}

const ENTRY = `self.run = async (input) => ({ kind: 'text', text: String(input).toUpperCase() })`

async function writeFolderPlugin(dir: string, value: ReturnType<typeof manifest>): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'plugin.json'), JSON.stringify(value), 'utf8')
  await writeFile(path.join(dir, 'main.js'), ENTRY, 'utf8')
}

beforeEach(async () => {
  context = createTestContext()
  tempDir = await createTempDir()
  pluginRoot = path.join(tempDir, 'plugins')
  service = new PluginService(new PluginRepository(context.database.connection), pluginRoot)
})

afterEach(async () => {
  context.close()
  await removeTempDir(tempDir)
})

describe('PluginService', () => {
  it('内置工具出现在列表与搜索结果里', async () => {
    const tools = await service.listDescriptors()
    expect(tools.map((tool) => tool.id)).toEqual(['json-formatter', 'json-table', 'xml-json'])
    expect(tools.every((tool) => tool.enabled && tool.source === 'builtin')).toBe(true)
    expect((await service.search('json')).map((tool) => tool.id)).toEqual([
      'json-formatter',
      'json-table',
      'xml-json'
    ])
  })

  it('从文件夹安装、启用/禁用、读取入口、卸载', async () => {
    const source = path.join(tempDir, 'source')
    await writeFolderPlugin(source, manifest())

    const installed = await service.installFromFolder(source)
    expect(installed).toMatchObject({
      id: 'com.example.test-tool',
      source: 'installed',
      enabled: true,
      name: '测试工具'
    })

    const tools = await service.listDescriptors()
    expect(tools).toHaveLength(4)
    expect((await service.search('测试')).map((tool) => tool.id)).toContain('com.example.test-tool')
    expect((await service.entrySource('com.example.test-tool')).code).toContain('self.run')

    await service.setEnabled('com.example.test-tool', false)
    expect((await service.listDescriptors()).find((tool) => tool.id === 'com.example.test-tool')?.enabled).toBe(false)
    expect(await service.search('测试')).toEqual([])

    await service.setEnabled('com.example.test-tool', true)
    expect((await service.search('test')).map((tool) => tool.id)).toContain('com.example.test-tool')

    await service.uninstall('com.example.test-tool')
    expect((await service.listDescriptors()).map((tool) => tool.id)).toEqual([
      'json-formatter',
      'json-table',
      'xml-json'
    ])
    await expect(stat(path.join(pluginRoot, 'com.example.test-tool'))).rejects.toThrow()
  })

  it('从 zip 安装（plugin.json 在一个顶层目录里）', async () => {
    const zipPath = path.join(tempDir, 'plugin.zip')
    const archive = zipSync({
      'my-tool/plugin.json': strToU8(JSON.stringify(manifest('com.example.zip-tool'))),
      'my-tool/main.js': strToU8(ENTRY)
    })
    await writeFile(zipPath, archive)

    const installed = await service.installFromZip(zipPath)
    expect(installed).toMatchObject({ id: 'com.example.zip-tool', source: 'installed' })
    expect((await service.entrySource('com.example.zip-tool')).code).toContain('self.run')
    expect(await readFile(path.join(pluginRoot, 'com.example.zip-tool', 'plugin.json'), 'utf8')).toContain(
      'com.example.zip-tool'
    )
  })

  it('拒绝 zip-slip 路径与缺少 manifest 的包', async () => {
    const slipPath = path.join(tempDir, 'slip.zip')
    await writeFile(
      slipPath,
      zipSync({
        'plugin.json': strToU8(JSON.stringify(manifest('com.example.slip'))),
        'main.js': strToU8(ENTRY),
        '../evil.txt': strToU8('evil')
      })
    )
    await expect(service.installFromZip(slipPath)).rejects.toThrow(/不安全|zip-slip/i)

    const missingPath = path.join(tempDir, 'missing.zip')
    await writeFile(missingPath, zipSync({ 'main.js': strToU8(ENTRY) }))
    await expect(service.installFromZip(missingPath)).rejects.toThrow(/plugin\.json/)
  })

  it('拒绝不存在的插件的管理操作', async () => {
    await expect(service.setEnabled('missing', false)).rejects.toThrow(/未安装/)
    await expect(service.uninstall('missing')).rejects.toThrow(/未安装/)
    await expect(service.entrySource('missing')).rejects.toThrow(/未安装/)
  })
})
