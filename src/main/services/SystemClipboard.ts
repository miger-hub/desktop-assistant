import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ClipboardItem, clipboard } from 'electron'
import type { ClipboardEntry } from '../../shared/types'
import type { ClipboardSnapshot, ClipboardSource } from './ClipboardService'

/** 文件列表在剪贴板里的 MIME 类型（Linux / macOS） */
const URI_LIST = 'text/uri-list'
/** GNOME 的私有格式：第一行是 copy / cut，后面是 URI 列表 */
const GNOME_FILES = 'x-special/gnome-copied-files'
/** Windows 上复制文件时 Chromium 暴露的原始格式（UTF-16 路径列表） */
const WINDOWS_FILES = 'FileNameW'

/** 密码管理器复制时会带这类标记，历史里不记录 */
const CONCEALED = /password|concealed|secret/i

/** 单条文本的上限：再大就不像「复制一段东西」，也没必要在历史里占位置 */
const MAX_TEXT_LENGTH = 100 * 1024

async function readTypeText(item: Electron.ClipboardItem, type: string): Promise<string | null> {
  try {
    const value: unknown = await item.getType(type)
    if (typeof value === 'string') return value
    if (value instanceof Blob) return await value.text()
    return null
  } catch {
    return null
  }
}

/** Windows 的 FileNameW 是 UTF-16LE + \0 分隔的路径列表 */
async function readTypeBuffer(item: Electron.ClipboardItem, type: string): Promise<Buffer | null> {
  try {
    const value: unknown = await item.getType(type)
    if (!(value instanceof Blob)) return null
    return Buffer.from(await value.arrayBuffer())
  } catch {
    return null
  }
}

/** file:// URI 或绝对路径 → 本地路径，其它一律忽略 */
function toLocalPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  if (trimmed.startsWith('file://')) {
    try {
      return fileURLToPath(trimmed)
    } catch {
      return null
    }
  }
  return path.isAbsolute(trimmed) ? trimmed : null
}

function toPaths(values: string[]): string[] {
  const paths: string[] = []
  for (const value of values) {
    const resolved = toLocalPath(value)
    if (resolved && !paths.includes(resolved)) paths.push(resolved)
  }
  return paths
}

/**
 * Electron 的系统剪贴板。
 *
 * 支持两类内容：纯文本，以及复制文件 / 目录时的路径列表。
 * 图片、HTML 等格式暂不记录（历史里放不下，收益也低）。
 */
export class SystemClipboardSource implements ClipboardSource {
  async read(): Promise<ClipboardSnapshot | null> {
    let items: Array<Electron.ClipboardItem>
    try {
      items = await clipboard.read()
    } catch {
      // 某些桌面环境 / 无 X 服务的场景下读剪贴板会失败，忽略这一轮
      return null
    }

    const item = items[0]
    if (!item) return null

    const types = item.types ?? []
    if (types.some((type) => CONCEALED.test(type))) return null

    const files = await this.readFiles(item, types)
    if (files.length > 0) {
      return { kind: 'files', text: files.join('\n'), paths: files, signature: `files:${files.join('\u0000')}` }
    }

    const text = await readTypeText(item, 'text/plain')
    if (text !== null && text.trim()) {
      if (text.length > MAX_TEXT_LENGTH) return null
      return { kind: 'text', text, paths: [], signature: `text:${text}` }
    }

    return null
  }

  async write(entry: ClipboardEntry): Promise<void> {
    if (entry.kind === 'files' && entry.paths.length > 0) {
      // 同时写 uri-list 与 text/plain：文件管理器能粘贴文件，编辑器拿到的是路径
      const uriList = `${entry.paths.map((target) => pathToFileURL(target).toString()).join('\r\n')}\r\n`
      await clipboard.write([
        new ClipboardItem({ [URI_LIST]: uriList, 'text/plain': entry.paths.join('\n') })
      ])
      return
    }

    await clipboard.writeText(entry.text)
  }

  private async readFiles(item: Electron.ClipboardItem, types: string[]): Promise<string[]> {
    for (const type of types) {
      if (type === URI_LIST) {
        const value = await readTypeText(item, type)
        if (value) return toPaths(value.split(/\r?\n/))
      } else if (type === GNOME_FILES) {
        const value = await readTypeText(item, type)
        // 第一行是操作类型（copy / cut），剩下的才是 URI
        if (value) return toPaths(value.split(/\r?\n/).slice(1))
      } else if (type.includes(WINDOWS_FILES)) {
        const buffer = await readTypeBuffer(item, type)
        if (buffer) return toPaths(buffer.toString('utf16le').split('\0'))
      }
    }
    return []
  }
}
