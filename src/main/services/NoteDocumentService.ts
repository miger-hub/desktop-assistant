import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  NoteDocument,
  NoteDocumentCreateInput,
  NoteDocumentPatch,
  NoteDocumentSummary,
  NoteDocumentTree,
  NoteFolder
} from '../../shared/types'
import { markdownExcerpt } from '../../shared/noteDocument'
import { alreadyExists, fromFsError, invalidArgument, ServiceError } from '../errors'
import { t } from '../i18n'
import type { WorkspaceRepository } from '../repositories/WorkspaceRepository'

const NOTE_EXTENSION = '.md'
const ATTACHMENTS_DIRECTORY = 'attachments'
const TITLE_MAX = 120
const CONTENT_MAX = 5 * 1024 * 1024
const ATTACHMENT_MAX = 25 * 1024 * 1024
const WORKSPACE_LINE = /^\s*workmetaWorkspaceId\s*:\s*(.*?)\s*$/

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

interface NoteFileParts {
  body: string
  frontmatter: string[]
  workspaceId: number | null
}

export interface NoteAssetResult {
  /** 可直接写进 Markdown 的相对路径 */
  src: string
  /** 同一目录 attachments 下的文件名 */
  name: string
}

function normalizeRelative(input: string | undefined): string {
  const value = (input ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!value) return ''
  if (/^[a-zA-Z]:/.test(value)) throw invalidArgument(t('svc.notePathInvalid', { value }))

  const segments = value.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw invalidArgument(t('svc.notePathInvalid', { value }))
  }
  if (segments.includes(ATTACHMENTS_DIRECTORY)) {
    throw invalidArgument(t('svc.noteAttachmentReserved'))
  }
  return segments.join('/')
}

function normalizeTitle(input: string): string {
  const title = (input ?? '').trim()
  if (!title) throw invalidArgument(t('svc.titleRequired'))
  if (title.length > TITLE_MAX) throw invalidArgument(t('svc.titleTooLong', { max: TITLE_MAX }))
  return title
}

/** 文件名安全化：保留中文，只替换跨平台非法字符和 Windows 保留名 */
export function safeNoteTitle(title: string): string {
  let value = title
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/^\.+/, '_')
    .trim()
    .slice(0, 100)

  if (!value) value = t('svc.noteUntitled')
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value)) value = `_${value}`
  return value
}

/** 拆出笔记自己的 frontmatter，同时保留用户写入的其它 YAML 行 */
export function parseNoteFile(raw: string): NoteFileParts {
  const normalized = raw.replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) {
    return { body: normalized, frontmatter: [], workspaceId: null }
  }

  const lines = normalized.split('\n')
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return { body: normalized, frontmatter: [], workspaceId: null }

  const frontmatter = lines.slice(1, end)
  let workspaceId: number | null = null
  for (const line of frontmatter) {
    const match = line.match(WORKSPACE_LINE)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isInteger(value) && value > 0) workspaceId = value
  }

  const body = lines.slice(end + 1).join('\n').replace(/^\n/, '').replace(/\n$/, '')
  return {
    body,
    frontmatter,
    workspaceId
  }
}

export function serializeNoteFile(parts: Pick<NoteFileParts, 'frontmatter' | 'workspaceId'> & { body: string }): string {
  const frontmatter = parts.frontmatter.filter((line) => !WORKSPACE_LINE.test(line))
  if (parts.workspaceId !== null) frontmatter.push(`workmetaWorkspaceId: ${parts.workspaceId}`)

  const body = parts.body.replace(/\s+$/g, '')
  const prefix = frontmatter.length > 0 ? `---\n${frontmatter.join('\n')}\n---\n\n` : ''
  return `${prefix}${body}\n`
}

function imageExtension(fileName: string): string | null {
  const extension = path.extname(fileName).slice(1).toLowerCase()
  return Object.prototype.hasOwnProperty.call(IMAGE_TYPES, extension) ? extension : null
}

function imageBytesMatch(extension: string, data: Buffer): boolean {
  if (extension === 'png') return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (extension === 'jpg' || extension === 'jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  if (extension === 'gif') {
    const head = data.subarray(0, 6).toString('ascii')
    return head === 'GIF87a' || head === 'GIF89a'
  }
  if (extension === 'webp') {
    return data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}

/**
 * 文件型笔记。
 * 正文直接写 Markdown 文件；SQLite 不保存正文，工作区归属写在轻量 frontmatter 里。
 */
export class NoteDocumentService {
  private readonly root: string

  constructor(
    rootPath: string,
    private readonly workspaces: WorkspaceRepository
  ) {
    this.root = path.resolve(rootPath)
  }

  get rootPath(): string {
    return this.root
  }

  async list(): Promise<NoteDocumentTree> {
    await this.ensureRoot()
    const notes: NoteDocumentSummary[] = []
    const folders = await this.walkDirectory('', notes)
    notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { folders, notes }
  }

  async search(keyword: string): Promise<NoteDocumentSummary[]> {
    const needle = keyword.trim().toLowerCase()
    if (!needle) return (await this.list()).notes

    const tree = await this.list()
    const found: NoteDocumentSummary[] = []
    for (const note of tree.notes) {
      try {
        const document = await this.read(note.path)
        if (
          document.title.toLowerCase().includes(needle) ||
          document.content.toLowerCase().includes(needle)
        ) {
          found.push(note)
        }
      } catch {
        // 单个文件在扫描后被外部删除 / 改坏时，不让全局搜索整体失败
      }
    }
    return found
  }

  async read(relativePath: string): Promise<NoteDocument> {
    const relative = this.noteRelative(relativePath)
    const absolute = this.resolve(relative)
    try {
      const [raw, stat] = await Promise.all([fs.readFile(absolute, 'utf8'), fs.lstat(absolute)])
      if (!stat.isFile() || stat.isSymbolicLink()) throw invalidArgument(t('svc.notePathInvalid', { value: relative }))
      if (raw.length > CONTENT_MAX) throw invalidArgument(t('svc.contentTooLong', { max: CONTENT_MAX }))
      const parts = parseNoteFile(raw)
      return {
        path: relative,
        title: path.basename(relative, NOTE_EXTENSION),
        folderPath: this.folderOf(relative),
        workspaceId: this.validWorkspace(parts.workspaceId),
        excerpt: markdownExcerpt(parts.body),
        updatedAt: stat.mtime.toISOString(),
        content: parts.body
      }
    } catch (error) {
      if (error instanceof ServiceError) throw error
      throw fromFsError(error, absolute)
    }
  }

  async create(input: NoteDocumentCreateInput): Promise<NoteDocument> {
    const title = normalizeTitle(input.title)
    const folderPath = normalizeRelative(input.folderPath)
    const workspaceId = this.requireWorkspace(input.workspaceId ?? null)
    const content = this.normalizeContent(input.content ?? '')

    await this.ensureRoot()
    if (folderPath) await this.requireDirectory(folderPath)

    const fileName = await this.uniqueFileName(folderPath, title)
    const relative = folderPath ? `${folderPath}/${fileName}` : fileName
    const absolute = this.resolve(relative)
    const raw = serializeNoteFile({ body: content, frontmatter: [], workspaceId })

    try {
      await fs.writeFile(absolute, raw, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      throw fromFsError(error, absolute)
    }
    return this.read(relative)
  }

  async save(relativePath: string, patch: NoteDocumentPatch): Promise<NoteDocument> {
    const currentRelative = this.noteRelative(relativePath)
    const currentAbsolute = this.resolve(currentRelative)
    let raw: string
    try {
      const stat = await fs.lstat(currentAbsolute)
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw invalidArgument(t('svc.notePathInvalid', { value: currentRelative }))
      }
      raw = await fs.readFile(currentAbsolute, 'utf8')
    } catch (error) {
      throw fromFsError(error, currentAbsolute)
    }
    if (raw.length > CONTENT_MAX) throw invalidArgument(t('svc.contentTooLong', { max: CONTENT_MAX }))

    const parts = parseNoteFile(raw)
    const title = patch.title === undefined ? path.basename(currentRelative, NOTE_EXTENSION) : normalizeTitle(patch.title)
    const body = patch.content === undefined ? parts.body : this.normalizeContent(patch.content)
    const workspaceId =
      patch.workspaceId === undefined ? this.validWorkspace(parts.workspaceId) : this.requireWorkspace(patch.workspaceId)

    const folderPath = this.folderOf(currentRelative)
    const fileName = `${safeNoteTitle(title)}${NOTE_EXTENSION}`
    const nextRelative = folderPath ? `${folderPath}/${fileName}` : fileName
    const nextAbsolute = this.resolve(nextRelative)

    const caseInsensitiveFileSystem = process.platform === 'win32' || process.platform === 'darwin'
    const samePath = caseInsensitiveFileSystem
      ? currentAbsolute.toLowerCase() === nextAbsolute.toLowerCase()
      : currentAbsolute === nextAbsolute

    if (nextAbsolute !== currentAbsolute) {
      if (!samePath && (await this.exists(nextAbsolute))) {
        throw alreadyExists(t('svc.sameNameExists', { value: fileName }))
      }
      try {
        await fs.rename(currentAbsolute, nextAbsolute)
      } catch (error) {
        throw fromFsError(error, currentAbsolute)
      }
    }

    await this.writeAtomic(nextAbsolute, serializeNoteFile({ body, frontmatter: parts.frontmatter, workspaceId }))
    return this.read(nextRelative)
  }

  async createFolder(parentPath: string, name: string): Promise<NoteFolder> {
    const parent = normalizeRelative(parentPath)
    const folderName = normalizeTitle(name)
    if (folderName === ATTACHMENTS_DIRECTORY) throw invalidArgument(t('svc.noteAttachmentReserved'))
    const safeName = safeNoteTitle(folderName)
    const relative = parent ? `${parent}/${safeName}` : safeName
    const absolute = this.resolve(relative)

    await this.ensureRoot()
    if (parent) await this.requireDirectory(parent)
    if (await this.exists(absolute)) throw alreadyExists(t('svc.exists', { what: t('svc.dir'), value: folderName }))
    try {
      await fs.mkdir(absolute)
    } catch (error) {
      throw fromFsError(error, absolute)
    }
    return { name: safeName, path: relative, children: [] }
  }

  async renameFolder(relativePath: string, name: string): Promise<NoteFolder> {
    const current = this.folderRelative(relativePath)
    const folderName = safeNoteTitle(normalizeTitle(name))
    if (folderName === ATTACHMENTS_DIRECTORY) throw invalidArgument(t('svc.noteAttachmentReserved'))

    const parent = this.folderOf(current)
    const next = parent ? `${parent}/${folderName}` : folderName
    const currentAbsolute = this.resolve(current)
    const nextAbsolute = this.resolve(next)
    if (currentAbsolute === nextAbsolute) return { name: folderName, path: current, children: [] }
    if (await this.exists(nextAbsolute)) throw alreadyExists(t('svc.exists', { what: t('svc.dir'), value: folderName }))

    try {
      await fs.rename(currentAbsolute, nextAbsolute)
    } catch (error) {
      throw fromFsError(error, currentAbsolute)
    }
    return { name: folderName, path: next, children: [] }
  }

  async uploadAsset(relativePath: string, fileName: string, data: ArrayBuffer | Uint8Array): Promise<NoteAssetResult> {
    const relative = this.noteRelative(relativePath)
    await this.read(relative)

    const extension = imageExtension(fileName)
    if (!extension) throw invalidArgument(t('svc.noteImageType'))
    const bytes = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data))
    if (bytes.length === 0) throw invalidArgument(t('svc.noteImageEmpty'))
    if (bytes.length > ATTACHMENT_MAX) throw invalidArgument(t('svc.noteImageTooLarge', { max: ATTACHMENT_MAX }))
    if (!imageBytesMatch(extension, bytes)) throw invalidArgument(t('svc.noteImageInvalid'))

    const folder = this.folderOf(relative)
    const attachments = folder ? `${folder}/${ATTACHMENTS_DIRECTORY}` : ATTACHMENTS_DIRECTORY
    const attachmentsAbsolute = this.resolve(attachments)
    try {
      await fs.mkdir(attachmentsAbsolute, { recursive: true })
    } catch (error) {
      throw fromFsError(error, attachmentsAbsolute)
    }

    const stem = safeNoteTitle(path.basename(fileName, path.extname(fileName))).slice(0, 60)
    const storedName = `${stem || 'image'}-${randomUUID().slice(0, 8)}.${extension}`
    const target = path.join(attachmentsAbsolute, storedName)
    try {
      await fs.writeFile(target, bytes, { flag: 'wx' })
    } catch (error) {
      throw fromFsError(error, target)
    }

    return {
      src: `${ATTACHMENTS_DIRECTORY}/${storedName}`,
      name: storedName
    }
  }

  /** 自定义协议读取附件；只允许笔记同目录 attachments 里的受支持图片 */
  async resolveAsset(noteRelativePath: string, source: string): Promise<{ path: string; mime: string } | null> {
    let relative: string
    let noteRelative: string
    try {
      noteRelative = this.noteRelative(noteRelativePath)
      relative = source.replace(/\\/g, '/').replace(/^\/+/, '')
    } catch {
      return null
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(relative) || relative.includes('\0')) return null

    const segments = relative.split('/')
    if (segments[0] !== ATTACHMENTS_DIRECTORY || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      return null
    }
    const extension = imageExtension(relative)
    if (!extension) return null

    const noteAbsolute = this.resolve(noteRelative)
    const target = path.resolve(path.dirname(noteAbsolute), ...segments)
    const attachmentsRoot = path.resolve(path.dirname(noteAbsolute), ATTACHMENTS_DIRECTORY)
    const rel = path.relative(attachmentsRoot, target)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null

    try {
      const stat = await fs.lstat(target)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > ATTACHMENT_MAX) return null
    } catch {
      return null
    }
    return { path: target, mime: IMAGE_TYPES[extension] }
  }

  /** 删除 / 重命名文件夹前拿到真实路径；调用方负责走系统回收站 */
  absolutePath(relativePath: string, kind: 'note' | 'folder'): string {
    const relative = kind === 'note' ? this.noteRelative(relativePath) : this.folderRelative(relativePath)
    return this.resolve(relative)
  }

  revealPath(relativePath: string): string {
    return this.absolutePath(relativePath, 'note')
  }

  private async walkDirectory(relativeDirectory: string, notes: NoteDocumentSummary[]): Promise<NoteFolder[]> {
    const absolute = this.resolve(relativeDirectory)
    let entries
    try {
      entries = await fs.readdir(absolute, { withFileTypes: true })
    } catch (error) {
      throw fromFsError(error, absolute)
    }

    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    })

    const folders: NoteFolder[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === ATTACHMENTS_DIRECTORY) continue
      const childRelative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        folders.push({
          name: entry.name,
          path: childRelative,
          children: await this.walkDirectory(childRelative, notes)
        })
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(NOTE_EXTENSION)) {
        try {
          notes.push(await this.read(childRelative))
        } catch {
          // 单个文件损坏或没有权限时跳过，不让整个笔记目录打不开
        }
      }
    }
    return folders
  }

  private async uniqueFileName(folderPath: string, title: string): Promise<string> {
    const stem = safeNoteTitle(title)
    for (let suffix = 1; suffix < 10_000; suffix += 1) {
      const name = `${stem}${suffix === 1 ? '' : ` (${suffix})`}${NOTE_EXTENSION}`
      const relative = folderPath ? `${folderPath}/${name}` : name
      if (!(await this.exists(this.resolve(relative)))) return name
    }
    throw new ServiceError('EXISTS', t('svc.noteNameUnavailable', { value: title }))
  }

  private normalizeContent(content: string): string {
    if (typeof content !== 'string') throw invalidArgument(t('svc.noteContentInvalid'))
    if (content.length > CONTENT_MAX) throw invalidArgument(t('svc.contentTooLong', { max: CONTENT_MAX }))
    return content.replace(/\r\n?/g, '\n')
  }

  private validWorkspace(workspaceId: number | null): number | null {
    return workspaceId !== null && this.workspaces.findById(workspaceId) ? workspaceId : null
  }

  private requireWorkspace(workspaceId: number | null): number | null {
    if (workspaceId === null) return null
    if (!Number.isInteger(workspaceId) || workspaceId <= 0 || !this.workspaces.findById(workspaceId)) {
      throw invalidArgument(t('svc.workspaceIdInvalid'))
    }
    return workspaceId
  }

  private async ensureRoot(): Promise<void> {
    try {
      await fs.mkdir(this.root, { recursive: true })
    } catch (error) {
      throw fromFsError(error, this.root)
    }
  }

  private async requireDirectory(relativePath: string): Promise<void> {
    const absolute = this.resolve(relativePath)
    try {
      const stat = await fs.stat(absolute)
      if (!stat.isDirectory()) throw invalidArgument(t('svc.notDirectory', { value: relativePath }))
    } catch (error) {
      if (error instanceof ServiceError) throw error
      throw fromFsError(error, absolute)
    }
  }

  private resolve(relativePath: string): string {
    const target = path.resolve(this.root, ...relativePath.split('/').filter(Boolean))
    const relative = path.relative(this.root, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw invalidArgument(t('svc.notePathInvalid', { value: relativePath }))
    }
    return target
  }

  private noteRelative(relativePath: string): string {
    const relative = normalizeRelative(relativePath)
    if (!relative.toLowerCase().endsWith(NOTE_EXTENSION)) {
      throw invalidArgument(t('svc.notePathInvalid', { value: relativePath }))
    }
    return relative
  }

  private folderRelative(relativePath: string): string {
    const relative = normalizeRelative(relativePath)
    if (!relative) throw invalidArgument(t('svc.noteFolderRequired'))
    return relative
  }

  private folderOf(relativePath: string): string {
    const index = relativePath.lastIndexOf('/')
    return index < 0 ? '' : relativePath.slice(0, index)
  }

  private async exists(target: string): Promise<boolean> {
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }

  private async writeAtomic(target: string, content: string): Promise<void> {
    const temporary = `${target}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporary, content, 'utf8')
      await fs.rename(temporary, target)
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
      throw fromFsError(error, target)
    }
  }
}
