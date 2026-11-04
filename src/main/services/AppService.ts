import { spawn } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { app, nativeImage, shell } from 'electron'
import { invalidArgument } from '../errors'
import { t } from '../i18n'

/** 一次搜索最多返回多少个应用（应用名短，搜「e」会命中一大堆） */
export const MAX_APP_RESULTS = 12
/** 应用列表与图标的缓存时长：装了新应用不用重启，超过这个时间会重新扫一遍 */
const CACHE_MS = 5 * 60 * 1000
/** 图标统一按这个高度转 data URL，避免一次搜索传出去几百 KB */
const ICON_HEIGHT = 32
/** SVG 直接内联（矢量、不用缩放），过大的跳过，免得每次都传一大坨 */
const SVG_MAX_BYTES = 64 * 1024
/** 主题目录里按这些尺寸找图标（先大后小，最后才是 scalable） */
const ICON_SIZES = ['256x256', '128x128', '96x96', '64x64', '48x48', '32x32', 'scalable']
/** 图标优先级：png 能直接转 data URL，svg 次之（位图渲染更可控） */
const ICON_EXTS = ['png', 'svg']
/** 主题优先级：找不到就按目录里实际的其它主题兜底 */
const PREFERRED_THEMES = ['hicolor', 'breeze', 'breeze-dark', 'Adwaita', 'Yaru', 'Papirus', 'Tela']
/** Exec 里这些命令名做关键字没意义（几乎所有应用都带） */
const NOISE_COMMANDS = new Set(['env', 'sh', 'bash', 'flatpak', 'snap', 'gtk-launch', 'nohup'])
/** Exec 里的占位符：%f %F %u %U %i %c %k %v %m %d %D %n %N（%% 是百分号本身） */
const EXEC_PLACEHOLDER = /%[fFuUiIcdkvmDnN]/

/** 已安装的应用：不同平台「打开」的目标不一样 */
export interface InstalledApp {
  /** 启动目标：Linux 是 .desktop 文件，Windows 是开始菜单快捷方式，macOS 是 .app */
  path: string
  /** 展示名（Linux 用本地化的 Name） */
  name: string
  /** 副标题，取 .desktop 的 Comment；没有就是空字符串 */
  comment: string
  /** Linux 的 Icon= 值（主题图标名或绝对路径），其它平台为 null */
  icon: string | null
  /** 额外关键字（命令名、桌面文件名等），用来提高命中率 */
  keywords: string[]
  /** Linux 启动用的 Exec=；其它平台为 null（交给系统 openPath） */
  exec: string | null
}

/**
 * 解析 .desktop 文件，只取 `[Desktop Entry]` 段。
 * 同名键按规范只认第一个，后面的段（`[Desktop Action ...]`）直接忽略。
 */
export function parseDesktopEntry(text: string): Record<string, string> {
  const entry: Record<string, string> = {}
  let inEntry = false

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]'
      continue
    }
    if (!inEntry) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator)
    if (!(key in entry)) entry[key] = line.slice(separator + 1)
  }

  return entry
}

/** 按当前语言挑本地化字段：zh-CN 先找 Name[zh_CN]，再找 Name[zh]，最后用 Name */
export function localizedValue(entry: Record<string, string>, key: string, locale: string): string {
  const normalized = locale.replace('-', '_')
  for (const candidate of [normalized, normalized.split('_')[0]]) {
    const value = entry[`${key}[${candidate}]`]
    if (value) return value
  }
  return entry[key] ?? ''
}

/**
 * 拆 Exec=：按 freedesktop 规范处理引号与反斜杠，并丢掉 %f %U 这类占位符
 * （我们永远是「只启动应用、不带文件」，带占位符的参数留着反而会启动失败）。
 * 没有可用命令时返回 null。
 */
export function parseExecLine(exec: string): { command: string; args: string[] } | null {
  const tokens: string[] = []
  let current = ''
  let quoted = false
  let escaped = false

  for (const char of exec) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && !quoted) {
      escaped = true
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && /\s/.test(char)) {
      if (current) tokens.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) tokens.push(current)

  // 带占位符的参数整条丢掉：占位符要的是「被打开的文件」，而这里只是启动应用
  const args = tokens.filter((token) => !EXEC_PLACEHOLDER.test(token)).map((token) => token.replace(/%%/g, '%'))

  const [command, ...rest] = args
  return command ? { command, args: rest } : null
}

async function readNames(dir: string, kind: 'file' | 'dir'): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => (kind === 'file' ? entry.isFile() : entry.isDirectory()))
      .map((entry) => entry.name)
  } catch {
    // 目录不存在 / 没权限：当成空目录
    return []
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/** 命令行里取一个能当关键字的命令名（`/usr/bin/dolphin %U` → dolphin） */
function commandKeyword(exec: string): string {
  const command = parseExecLine(exec)?.command ?? ''
  const base = path.basename(command)
  if (!base || NOISE_COMMANDS.has(base)) return ''
  return base
}

/**
 * Linux：扫 .desktop 文件。`dirs` 前面的优先（用户的 ~/.local/share 在系统目录前面），
 * 同名文件只认先出现的那个，避免系统里的旧版本覆盖用户自己改过的。
 */
export async function scanDesktopApps(dirs: string[], locale: string): Promise<InstalledApp[]> {
  const apps: InstalledApp[] = []
  const seen = new Set<string>()

  for (const dir of dirs) {
    for (const name of (await readNames(dir, 'file')).sort()) {
      if (!name.endsWith('.desktop') || seen.has(name)) continue
      seen.add(name)

      const file = path.join(dir, name)
      let entry: Record<string, string>
      try {
        entry = parseDesktopEntry(await readFile(file, 'utf8'))
      } catch {
        continue
      }

      if (entry.Type !== 'Application') continue
      if (entry.NoDisplay === 'true' || entry.Hidden === 'true') continue
      const exec = entry.Exec ?? ''
      if (!exec || !parseExecLine(exec)) continue

      apps.push({
        path: file,
        name: localizedValue(entry, 'Name', locale) || path.basename(name, '.desktop'),
        comment: localizedValue(entry, 'Comment', locale),
        icon: entry.Icon ?? null,
        keywords: [
          path.basename(name, '.desktop'),
          commandKeyword(exec),
          // 其它语言的 Name[...] 也当关键字：中文系统语言下也能搜到英文名的应用，反过来也一样
          ...Object.entries(entry)
            .filter(([key]) => key.startsWith('Name['))
            .map(([, value]) => value)
        ].filter(Boolean),
        exec
      })
    }
  }

  return apps
}

/** Windows：开始菜单里的快捷方式（.lnk），放在子目录里的也算 */
export async function scanShortcutApps(dirs: string[]): Promise<InstalledApp[]> {
  const apps: InstalledApp[] = []
  const seen = new Set<string>()

  const walk = async (dir: string, depth: number): Promise<void> => {
    for (const name of await readNames(dir, 'file')) {
      if (!name.toLowerCase().endsWith('.lnk')) continue
      if (seen.has(name)) continue
      seen.add(name)
      apps.push({
        path: path.join(dir, name),
        name: path.basename(name, path.extname(name)),
        comment: '',
        icon: null,
        keywords: [],
        exec: null
      })
    }
    if (depth <= 0) return
    for (const child of await readNames(dir, 'dir')) await walk(path.join(dir, child), depth - 1)
  }

  for (const dir of dirs) await walk(dir, 2)
  return apps
}

/** macOS：/Applications 下的 .app，含 Utilities 这类一层子目录 */
export async function scanBundleApps(dirs: string[]): Promise<InstalledApp[]> {
  const apps: InstalledApp[] = []
  const seen = new Set<string>()

  const push = (target: string): void => {
    const name = path.basename(target, '.app')
    if (!name || seen.has(name)) return
    seen.add(name)
    apps.push({ path: target, name, comment: '', icon: null, keywords: [], exec: null })
  }

  for (const dir of dirs) {
    for (const name of await readNames(dir, 'dir')) {
      const target = path.join(dir, name)
      if (name.endsWith('.app')) {
        push(target)
        continue
      }
      for (const child of await readNames(target, 'dir')) {
        if (child.endsWith('.app')) push(path.join(target, child))
      }
    }
  }

  return apps
}

/** 按相关度挑应用：完全相同 > 名字前缀 > 名字包含 > 关键字命中，同级短名优先 */
export function rankApps(apps: InstalledApp[], needle: string, limit: number): InstalledApp[] {
  const query = needle.toLowerCase()
  const scored: Array<{ app: InstalledApp; score: number }> = []

  for (const appEntry of apps) {
    const name = appEntry.name.toLowerCase()
    let score = -1
    if (name === query) score = 0
    else if (name.startsWith(query)) score = 1
    else if (name.includes(query)) score = 2
    else if (appEntry.keywords.some((keyword) => keyword.toLowerCase().includes(query))) score = 3
    if (score < 0) continue
    scored.push({ app: appEntry, score })
  }

  return scored
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.app.name.length - right.app.name.length ||
        left.app.name.localeCompare(right.app.name)
    )
    .slice(0, limit)
    .map((item) => item.app)
}

/** 主题目录：优先常见主题，其余按名称排在后面对兜底 */
async function themesIn(dataDir: string): Promise<string[]> {
  const names = await readNames(path.join(dataDir, 'icons'), 'dir')
  const preferred = PREFERRED_THEMES.filter((theme) => names.includes(theme))
  const rest = names.filter((theme) => !PREFERRED_THEMES.includes(theme)).sort()
  return [...preferred, ...rest]
}

/**
 * 把 .desktop 的 Icon= 解析成真正的图标文件。
 * Icon= 可能是绝对路径（用户自己配的），也可能是主题图标名（如 network-wired），
 * 后者只能按 freedesktop 的目录约定一个个试：<dataDir>/icons/<theme>/<size>/apps/。
 */
export async function resolveIconFile(icon: string, dataDirs: string[]): Promise<string | null> {
  if (path.isAbsolute(icon)) {
    for (const candidate of [icon, `${icon}.png`, `${icon}.svg`]) {
      if (await exists(candidate)) return candidate
    }
    return null
  }

  for (const dataDir of dataDirs) {
    for (const theme of await themesIn(dataDir)) {
      for (const size of ICON_SIZES) {
        for (const ext of ICON_EXTS) {
          const candidate = path.join(dataDir, 'icons', theme, size, 'apps', `${icon}.${ext}`)
          if (await exists(candidate)) return candidate
        }
      }
    }
    for (const ext of [...ICON_EXTS, 'xpm']) {
      const candidate = path.join(dataDir, 'pixmaps', `${icon}.${ext}`)
      if (await exists(candidate)) return candidate
    }
  }

  return null
}

/** NativeImage → 统一尺寸的 data URL（渲染进程有 CSP，只认 data:） */
function toIconDataUrl(image: Electron.NativeImage): string {
  return image.resize({ height: ICON_HEIGHT }).toDataURL()
}

/**
 * 取一个文件的图标：先当图片直接读（.ico / .png 这类图标文件能读出来），
 * 读不出来再让系统按「文件图标」取（.exe / .lnk 走的是 Shell）。
 */
async function iconDataUrlFromFile(file: string): Promise<string | null> {
  try {
    const direct = nativeImage.createFromPath(file)
    if (!direct.isEmpty()) return toIconDataUrl(direct)
  } catch {
    // 读不出来就交给下面的系统图标
  }

  try {
    const icon = await app.getFileIcon(file, { size: 'normal' })
    return icon.isEmpty() ? null : toIconDataUrl(icon)
  } catch {
    return null
  }
}

/**
 * Windows 上取开始菜单快捷方式（.lnk）的图标。
 *
 * 只问 .lnk 本身的话，拿到的往往是「快捷方式」自己那个带小箭头的图标，
 * 有些环境下还直接取不到；而开始菜单里的 .lnk 都是普通 Win32 程序的快捷方式
 * （UWP 应用不在磁盘上，是另一套枚举方式），所以按这个顺序取：
 *   1. 快捷方式自己指定的图标文件（安装器写的 .ico 通常最准）
 *   2. 目标程序（.exe）自己的图标 —— 就是应用真实图标，且没有快捷方式小箭头
 *   3. 兜底才用系统给这个 .lnk 的图标
 */
export async function readWindowsIcon(shortcut: string): Promise<string | null> {
  let target: string | null = null
  let customIcon: string | null = null

  try {
    const link = shell.readShortcutLink(shortcut)
    target = link.target || null
    customIcon = link.icon || null
  } catch {
    // 不是快捷方式（或读不了）：下面直接按文件图标取
  }

  for (const candidate of [customIcon, target]) {
    if (!candidate) continue
    const url = await iconDataUrlFromFile(candidate)
    if (url) return url
  }

  return iconDataUrlFromFile(shortcut)
}

/** 已安装应用的枚举、图标与启动 */
export class AppService {
  private cache: { apps: InstalledApp[]; at: number } | null = null
  private readonly iconCache = new Map<string, string | null>()

  /** 应用列表（带缓存，装了新应用最多 5 分钟后可见） */
  async list(): Promise<InstalledApp[]> {
    const now = Date.now()
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.apps

    const apps = await this.scan()
    this.cache = { apps, at: now }
    return apps
  }

  /** 按关键字挑应用；`limit` 控制最多返回几条 */
  async search(needle: string, limit = MAX_APP_RESULTS): Promise<InstalledApp[]> {
    if (!needle.trim()) return []
    return rankApps(await this.list(), needle, limit)
  }

  /** 图标统一转成 data URL：渲染进程有 CSP，只有 data: / self 能当图片加载 */
  async iconDataUrl(target: InstalledApp): Promise<string | null> {
    const key = `${process.platform}:${target.icon ?? target.path}`
    const cached = this.iconCache.get(key)
    if (cached !== undefined) return cached

    const url = await this.loadIcon(target)
    this.iconCache.set(key, url)
    return url
  }

  /** 打开应用：Linux 用 .desktop 里的 Exec 启动，其它平台交给系统打开快捷方式 / 应用包 */
  async open(target: string): Promise<void> {
    if (!target) throw invalidArgument(t('svc.openAppMissing'))

    if (process.platform !== 'linux') {
      const error = await shell.openPath(target)
      if (error) throw invalidArgument(t('svc.openFailed', { value: error }))
      return
    }

    let exec: string
    try {
      exec = parseDesktopEntry(await readFile(target, 'utf8')).Exec ?? ''
    } catch {
      throw invalidArgument(t('svc.appMissing', { value: path.basename(target) }))
    }

    const command = parseExecLine(exec)
    if (!command) throw invalidArgument(t('svc.appNoCommand', { value: path.basename(target) }))

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command.command, command.args, { detached: true, stdio: 'ignore' })
      child.once('error', reject)
      child.once('spawn', () => {
        // 应用独立于本程序运行：解除引用，桌面助手退出不影响它
        child.unref()
        resolve()
      })
    }).catch((error: Error) => {
      throw invalidArgument(t('svc.launchFailed', { value: error.message }))
    })
  }

  private async scan(): Promise<InstalledApp[]> {
    if (process.platform === 'win32') return scanShortcutApps(this.startMenuDirs())
    if (process.platform === 'darwin') return scanBundleApps(this.bundleDirs())
    return scanDesktopApps(this.applicationDirs(), app.getLocale())
  }

  private async loadIcon(target: InstalledApp): Promise<string | null> {
    try {
      if (process.platform === 'linux' && target.icon) {
        const file = await resolveIconFile(target.icon, this.dataDirs())
        if (file?.endsWith('.svg')) {
          const svg = await readFile(file, 'utf8')
          if (Buffer.byteLength(svg) <= SVG_MAX_BYTES) {
            return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
          }
        } else if (file) {
          const image = nativeImage.createFromPath(file)
          if (!image.isEmpty()) return toIconDataUrl(image)
        }
      }

      // Windows：开始菜单快捷方式要顺着目标程序去取真实图标
      if (process.platform === 'win32') return await readWindowsIcon(target.path)

      // macOS：.app 直接问系统要图标；Linux 上 .desktop 的图标没解析出来时只能给个通用图标
      return await iconDataUrlFromFile(target.path)
    } catch {
      // 图标拿不到不影响搜索和打开，渲染进程会退回内置图标
      return null
    }
  }

  /** XDG 数据目录：用户的放最前面 */
  private dataDirs(): string[] {
    const home = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
    const system = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean)
    return [...new Set([home, ...system])]
  }

  private applicationDirs(): string[] {
    return this.dataDirs().map((dir) => path.join(dir, 'applications'))
  }

  private startMenuDirs(): string[] {
    const programData = process.env.ProgramData || 'C:\\ProgramData'
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return [
      path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ]
  }

  private bundleDirs(): string[] {
    return ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')]
  }
}
