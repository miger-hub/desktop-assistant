import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'
import type { Locale } from '../../shared/i18n'
import { mainLocale, t } from '../i18n'
import { invalidArgument, notFound } from '../errors'
import { BUILTIN_TOOLS, splitKeywords } from '../../shared/tools/builtin/definitions'
import {
  matchesTool,
  TOOL_ENTRY_MAX,
  type ToolDescriptor,
  type ToolOption
} from '../../shared/tools/types'
import type { PluginRecord, PluginRepository } from './PluginRepository'
import { parsePluginManifest, type PluginManifest } from './manifest'

/** 安装包限制：个人工具不需要支持巨大的插件包 */
const MAX_PLUGIN_FILES = 200
const MAX_PLUGIN_BYTES = 20 * 1024 * 1024
const MAX_ZIP_BYTES = 20 * 1024 * 1024
const MAX_MANIFEST_BYTES = 256 * 1024

const INSTALLED_ICON = 'mdi-puzzle-outline'

function isInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(target)
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
}

function pickLocale(messages: PluginManifest['locales'], locale: Locale) {
  return messages[locale] ?? messages.en ?? Object.values(messages)[0]!
}

/**
 * 插件管理：安装 / 校验 / 启用 / 卸载，以及给 UI / 全局搜索提供已本地化的描述。
 * 插件代码永远不会在主进程执行。
 */
export class PluginService {
  private cache: { locale: Locale; items: ToolDescriptor[] } | null = null

  constructor(
    private readonly repository: PluginRepository,
    /** `<userData>/plugins` */
    private readonly root: string,
    private readonly onChange: () => void = () => {}
  ) {}

  invalidate(): void {
    this.cache = null
  }

  private builtinDescriptors(): ToolDescriptor[] {
    return BUILTIN_TOOLS.map((tool) => ({
      id: tool.id,
      source: 'builtin',
      version: tool.version,
      icon: tool.icon,
      input: 'text',
      result: tool.result,
      name: t(tool.nameKey),
      description: t(tool.descriptionKey),
      keywords: splitKeywords(t(tool.keywordsKey)),
      options: tool.options.map<ToolOption>((option) => ({
        key: option.key,
        type: option.type,
        label: t(option.labelKey),
        default: option.default,
        values: option.values?.map((value) => ({ value: value.value, label: t(value.labelKey) }))
      })),
      enabled: true
    }))
  }

  private async installedDescriptor(record: PluginRecord, locale: Locale): Promise<ToolDescriptor | null> {
    try {
      const manifest = await this.readManifest(record.installPath)
      if (manifest.id !== record.id) throw new Error('plugin id mismatch')
      const messages = pickLocale(manifest.locales, locale)
      return {
        id: manifest.id,
        source: 'installed',
        version: manifest.version,
        icon: INSTALLED_ICON,
        input: 'text',
        result: manifest.result,
        name: messages.name,
        description: messages.description,
        keywords: messages.keywords,
        options: manifest.options.map<ToolOption>((option) => ({
          key: option.key,
          type: option.type,
          label: messages.options?.[option.key] ?? option.key,
          default: option.default,
          values: option.values?.map((value) => ({
            value,
            label: messages.optionValues?.[`${option.key}:${value}`] ?? String(value)
          }))
        })),
        enabled: record.enabled,
        installedAt: record.installedAt
      }
    } catch (error) {
      console.warn(`[plugin] 读取插件失败 ${record.id}: ${(error as Error).message}`)
      return null
    }
  }

  async listDescriptors(): Promise<ToolDescriptor[]> {
    const locale = mainLocale()
    if (this.cache?.locale === locale) return this.cache.items

    const items = this.builtinDescriptors()
    for (const record of this.repository.list()) {
      const descriptor = await this.installedDescriptor(record, locale)
      if (descriptor) items.push(descriptor)
    }
    this.cache = { locale, items }
    return items
  }

  /** 全局搜索：只匹配已启用工具的元数据 */
  async search(keyword: string): Promise<ToolDescriptor[]> {
    const items = await this.listDescriptors()
    return items.filter((tool) => matchesTool(tool, keyword))
  }

  /** 安装本地文件夹（文件夹根部必须有 plugin.json） */
  async installFromFolder(sourceDir: string): Promise<ToolDescriptor> {
    const sourceStat = await stat(sourceDir).catch(() => null)
    if (!sourceStat?.isDirectory()) throw invalidArgument(t('plugin.error.folderMissing'))
    if (isInside(this.root, sourceDir)) throw invalidArgument(t('plugin.error.sourceInside'))

    await mkdir(this.root, { recursive: true })
    const staging = await mkdtemp(path.join(this.root, '.staging-'))
    try {
      await this.copyDirectory(sourceDir, staging)
      const manifest = await this.readManifest(staging)
      await this.ensureEntry(staging, manifest)
      return await this.commit(manifest, staging)
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      throw error
    }
  }

  /** 安装 zip（plugin.json 可以在根部，也可以在一个顶层目录里） */
  async installFromZip(zipPath: string): Promise<ToolDescriptor> {
    const archive = await readFile(zipPath).catch(() => null)
    if (!archive) throw invalidArgument(t('plugin.error.zipMissing'))
    if (archive.byteLength > MAX_ZIP_BYTES) throw invalidArgument(t('plugin.error.tooBig'))

    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(new Uint8Array(archive))
    } catch {
      throw invalidArgument(t('plugin.error.zipInvalid'))
    }

    await mkdir(this.root, { recursive: true })
    const staging = await mkdtemp(path.join(this.root, '.staging-'))
    try {
      await this.extractZip(entries, staging)
      const manifest = await this.readManifest(staging)
      await this.ensureEntry(staging, manifest)
      return await this.commit(manifest, staging)
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      throw error
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    if (!this.repository.find(id)) throw notFound(t('plugin.error.notInstalled'))
    this.repository.setEnabled(id, enabled)
    this.invalidate()
    this.onChange()
  }

  async uninstall(id: string): Promise<void> {
    const record = this.repository.find(id)
    if (!record) throw notFound(t('plugin.error.notInstalled'))
    // 只允许删除插件根目录下的安装目录，避免脏数据把用户文件带走
    if (!isInside(this.root, record.installPath) || path.resolve(record.installPath) === path.resolve(this.root)) {
      throw invalidArgument(t('plugin.error.installPathInvalid'))
    }
    await rm(record.installPath, { recursive: true, force: true })
    this.repository.remove(id)
    this.invalidate()
    this.onChange()
  }

  /** 供渲染进程把已安装插件的入口放进 Blob Worker */
  async entrySource(id: string): Promise<{ code: string }> {
    const record = this.repository.find(id)
    if (!record) throw notFound(t('plugin.error.notInstalled'))
    const manifest = await this.readManifest(record.installPath)
    if (manifest.id !== record.id) throw invalidArgument(t('plugin.error.badId'))
    const entry = path.resolve(record.installPath, manifest.entry)
    if (!isInside(record.installPath, entry)) throw invalidArgument(t('plugin.error.badEntry'))

    const info = await stat(entry).catch(() => null)
    if (!info?.isFile()) throw invalidArgument(t('plugin.error.entryMissing'))
    if (info.size > TOOL_ENTRY_MAX) throw invalidArgument(t('plugin.error.entryTooLarge'))
    return { code: await readFile(entry, 'utf8') }
  }

  private async readManifest(dir: string): Promise<PluginManifest> {
    const file = path.join(dir, 'plugin.json')
    let raw: string
    try {
      const info = await stat(file)
      if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) throw new Error('invalid size')
      raw = await readFile(file, 'utf8')
    } catch {
      throw invalidArgument(t('plugin.error.manifestMissing'))
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw invalidArgument(t('plugin.error.invalidManifest'))
    }
    return parsePluginManifest(parsed)
  }

  private async ensureEntry(dir: string, manifest: PluginManifest): Promise<void> {
    const entry = path.resolve(dir, manifest.entry)
    if (!isInside(dir, entry)) throw invalidArgument(t('plugin.error.badEntry'))
    const info = await stat(entry).catch(() => null)
    if (!info?.isFile()) throw invalidArgument(t('plugin.error.entryMissing'))
    if (info.size > TOOL_ENTRY_MAX) throw invalidArgument(t('plugin.error.entryTooLarge'))
  }

  private async commit(manifest: PluginManifest, staging: string): Promise<ToolDescriptor> {
    const target = path.join(this.root, manifest.id)
    const backup = `${target}.old-${Date.now()}`
    const hadTarget = Boolean(await stat(target).catch(() => null))
    if (hadTarget) await rename(target, backup)
    try {
      await rename(staging, target)
    } catch (error) {
      if (hadTarget) await rename(backup, target).catch(() => undefined)
      throw error
    }
    if (hadTarget) await rm(backup, { recursive: true, force: true }).catch(() => undefined)

    const existing = this.repository.find(manifest.id)
    this.repository.upsert({
      id: manifest.id,
      version: manifest.version,
      enabled: existing?.enabled ?? true,
      installPath: target
    })
    this.invalidate()
    this.onChange()

    const descriptor = (await this.listDescriptors()).find((item) => item.id === manifest.id)
    if (!descriptor) throw invalidArgument(t('plugin.error.installFailed'))
    return descriptor
  }

  private async copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
    let files = 0
    let bytes = 0

    const walk = async (dir: string, relative: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue
        const source = path.join(dir, entry.name)
        const nextRelative = relative ? path.join(relative, entry.name) : entry.name
        const target = path.join(targetDir, nextRelative)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          await mkdir(target, { recursive: true })
          await walk(source, nextRelative)
          continue
        }
        if (!entry.isFile()) continue

        const info = await stat(source)
        files += 1
        bytes += info.size
        if (files > MAX_PLUGIN_FILES || bytes > MAX_PLUGIN_BYTES) {
          throw invalidArgument(t('plugin.error.tooBig'))
        }
        await mkdir(path.dirname(target), { recursive: true })
        await copyFile(source, target)
      }
    }

    await walk(sourceDir, '')
  }

  private async extractZip(entries: Record<string, Uint8Array>, targetDir: string): Promise<void> {
    const normalized = new Map<string, Uint8Array>()
    for (const [rawName, data] of Object.entries(entries)) {
      const name = rawName.replace(/\\/g, '/')
      if (normalized.has(name)) throw invalidArgument(t('plugin.error.zipInvalid'))
      normalized.set(name, data)
    }
    const names = [...normalized.keys()]
      .filter((name) => !name.endsWith('/') && !name.startsWith('__MACOSX/') && !name.endsWith('.DS_Store'))

    // 先对原始条目整体做一次安全检查，避免 `../plugin.json` 被 root 前缀“洗白”
    for (const name of names) {
      if (!this.isSafeZipPath(name)) throw invalidArgument(t('plugin.error.zipSlip'))
    }

    const rootPrefix = this.findZipRoot(names)
    let files = 0
    let bytes = 0

    for (const name of names) {
      if (!name.startsWith(rootPrefix)) continue
      const relative = name.slice(rootPrefix.length)
      if (!relative) continue
      if (!this.isSafeZipPath(relative)) throw invalidArgument(t('plugin.error.zipSlip'))

      const data = normalized.get(name)
      if (!data) continue
      files += 1
      bytes += data.byteLength
      if (files > MAX_PLUGIN_FILES || bytes > MAX_PLUGIN_BYTES) {
        throw invalidArgument(t('plugin.error.tooBig'))
      }
      const target = path.join(targetDir, ...relative.split('/'))
      if (!isInside(targetDir, target)) throw invalidArgument(t('plugin.error.zipSlip'))
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, data)
    }

    if (files === 0) throw invalidArgument(t('plugin.error.zipInvalid'))
  }

  /** zip 根目录：plugin.json 在根部，或恰好在一个顶层目录里 */
  private findZipRoot(names: string[]): string {
    if (names.includes('plugin.json')) return ''
    const roots = new Set<string>()
    for (const name of names) {
      const match = /^([^/]+)\/plugin\.json$/.exec(name)
      if (match) roots.add(`${match[1]}/`)
    }
    if (roots.size === 1) return [...roots][0]
    if (roots.size > 1) throw invalidArgument(t('plugin.error.zipRoot'))
    throw invalidArgument(t('plugin.error.manifestMissing'))
  }

  private isSafeZipPath(value: string): boolean {
    if (!value || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false
    const normalized = path.posix.normalize(value)
    return normalized !== '..' && !normalized.startsWith('../') && normalized !== '.'
  }
}
