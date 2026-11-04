import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import type {
  BulkResult,
  FileItem,
  FileType,
  ListFilesOptions,
  RenameEntry,
  TransferOptions
} from '../../shared/types'
import { alreadyExists, fromFsError, invalidArgument, notFound, ServiceError } from '../errors'
import { t } from '../i18n'

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function toFileType(dirent: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): FileType {
  if (dirent.isDirectory()) return 'directory'
  if (dirent.isFile()) return 'file'
  if (dirent.isSymbolicLink()) return 'symlink'
  return 'other'
}

function assertSafeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw invalidArgument(t('svc.nameRequired'))
  if (trimmed === '.' || trimmed === '..') throw invalidArgument(t('svc.nameInvalid'))
  if (trimmed.includes('/') || trimmed.includes('\\')) throw invalidArgument(t('svc.nameHasSeparator'))
  if (trimmed.includes('\0')) throw invalidArgument(t('svc.nameBadChar'))
  return trimmed
}

/** win32 / darwin 的文件系统通常大小写不敏感 */
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin'

/**
 * 两个路径是否指向同一个条目。
 * 大小写不敏感的平台（Windows / macOS）上只改大小写就是同一个文件，
 * 这种"重命名"绝不能走"先删目标再改名"的覆盖分支，否则会把源文件删掉。
 * 导出是为了不依赖平台也能单测。
 */
export function isSamePath(a: string, b: string, caseInsensitive: boolean = CASE_INSENSITIVE_FS): boolean {
  const from = path.resolve(a)
  const to = path.resolve(b)
  return caseInsensitive ? from.toLowerCase() === to.toLowerCase() : from === to
}

/** 跨平台判断 child 是否位于 parent 目录内部（win32 / darwin 的文件系统通常大小写不敏感） */
function isInsideDirectory(parent: string, child: string): boolean {
  const from = CASE_INSENSITIVE_FS ? parent.toLowerCase() : parent
  const to = CASE_INSENSITIVE_FS ? child.toLowerCase() : child
  return to.startsWith(from + path.sep)
}

/**
 * 所有文件操作统一走这里。
 * 只依赖 Node fs，不依赖 Electron，方便用临时目录做测试。
 */
export class FileService {
  resolve(target: string): string {
    return path.resolve(target)
  }

  /** 取上级目录，避免渲染进程手写路径分隔符 */
  parentOf(target: string): string {
    return path.dirname(path.resolve(target))
  }

  /** 把绝对路径拆成面包屑，平台差异交给 node:path */
  splitPath(root: string, target: string): Array<{ label: string; path: string }> {
    const rootPath = path.resolve(root)
    const targetPath = path.resolve(target)
    const crumbs: Array<{ label: string; path: string }> = [
      { label: path.basename(rootPath) || rootPath, path: rootPath }
    ]

    const relative = path.relative(rootPath, targetPath)
    if (!relative || relative.startsWith('..')) return crumbs

    let accumulated = rootPath
    for (const segment of relative.split(path.sep)) {
      accumulated = path.join(accumulated, segment)
      crumbs.push({ label: segment, path: accumulated })
    }
    return crumbs
  }

  /** 拒绝把文件系统根目录当作操作目标 */
  private assertNotRoot(target: string): void {
    const resolved = path.resolve(target)
    if (resolved === path.parse(resolved).root) {
      throw invalidArgument(t('svc.rootNotAllowed'))
    }
  }

  async list(dirPath: string, options: ListFilesOptions = {}): Promise<FileItem[]> {
    const target = path.resolve(dirPath)
    let dirents: Dirent[]
    try {
      dirents = await fs.readdir(target, { withFileTypes: true })
    } catch (error) {
      throw fromFsError(error, target)
    }

    // lstat 并行执行：大目录（数千条目）下避免逐条串行等待
    const entries = await Promise.all(
      dirents.map(async (dirent): Promise<FileItem | null> => {
        if (!options.showHidden && dirent.name.startsWith('.')) return null
        const itemPath = path.join(target, dirent.name)
        try {
          const stats = await fs.lstat(itemPath)
          return {
            name: dirent.name,
            path: itemPath,
            type: toFileType(dirent),
            size: stats.size,
            modifiedAt: stats.mtimeMs,
            isHidden: dirent.name.startsWith('.')
          }
        } catch {
          // 读取单个条目失败（权限/失效软链接）时跳过，不影响整个目录
          return null
        }
      })
    )
    const items = entries.filter((item): item is FileItem => item !== null)

    return items.sort((a, b) => {
      if (a.type === 'directory' !== (b.type === 'directory')) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    })
  }

  async stat(target: string): Promise<FileItem | null> {
    const resolved = path.resolve(target)
    try {
      const stats = await fs.lstat(resolved)
      const type: FileType = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : stats.isSymbolicLink() ? 'symlink' : 'other'
      return {
        name: path.basename(resolved),
        path: resolved,
        type,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        isHidden: path.basename(resolved).startsWith('.')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw fromFsError(error, resolved)
    }
  }

  async exists(target: string): Promise<boolean> {
    if (!target) return false
    return pathExists(path.resolve(target))
  }

  async isDirectory(target: string): Promise<boolean> {
    try {
      const stats = await fs.stat(target)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  async move(source: string, target: string, options: TransferOptions = {}): Promise<FileItem> {
    const from = path.resolve(source)
    const to = path.resolve(target)
    this.assertNotRoot(from)
    this.assertNotRoot(to)

    if (isSamePath(from, to)) throw invalidArgument(t('svc.samePath'))
    if (!(await this.exists(from))) throw notFound(t('svc.notExist', { what: t('svc.source'), value: from }))
    if (isInsideDirectory(from, to)) throw invalidArgument(t('svc.intoOwnChild'))

    const parent = path.dirname(to)
    if (!(await pathExists(parent))) throw notFound(t('svc.notExist', { what: t('svc.targetDir'), value: parent }))

    if (await pathExists(to)) {
      if (!options.overwrite) throw alreadyExists(t('svc.exists', { what: t('svc.target'), value: to }))
      try {
        await fs.rm(to, { recursive: true, force: true })
      } catch (error) {
        throw fromFsError(error, to)
      }
    }

    try {
      await fs.rename(from, to)
    } catch (error) {
      // 跨磁盘移动时 rename 会失败，退化为复制 + 删除
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        await this.copy(from, to, { overwrite: true })
        await fs.rm(from, { recursive: true, force: true })
      } else {
        throw fromFsError(error, from)
      }
    }

    const item = await this.stat(to)
    if (!item) throw new ServiceError('IO_ERROR', t('svc.unreadableAfter', { action: t('file.actionMove'), value: to }))
    return item
  }

  async copy(source: string, target: string, options: TransferOptions = {}): Promise<FileItem> {
    const from = path.resolve(source)
    const to = path.resolve(target)
    this.assertNotRoot(to)

    if (from === to) throw invalidArgument(t('svc.samePath'))
    if (!(await this.exists(from))) throw notFound(t('svc.notExist', { what: t('svc.source'), value: from }))
    if (isInsideDirectory(from, to)) throw invalidArgument(t('svc.intoOwnChildCopy'))

    const parent = path.dirname(to)
    if (!(await pathExists(parent))) throw notFound(t('svc.notExist', { what: t('svc.targetDir'), value: parent }))

    if ((await pathExists(to)) && !options.overwrite) throw alreadyExists(t('svc.exists', { what: t('svc.target'), value: to }))

    try {
      await fs.cp(from, to, { recursive: true, force: options.overwrite === true, errorOnExist: !options.overwrite })
    } catch (error) {
      throw fromFsError(error, to)
    }

    const item = await this.stat(to)
    if (!item) throw new ServiceError('IO_ERROR', t('svc.unreadableAfter', { action: t('common.copy'), value: to }))
    return item
  }

  async rename(targetPath: string, name: string, options: TransferOptions = {}): Promise<FileItem> {
    const from = path.resolve(targetPath)
    this.assertNotRoot(from)
    if (!(await this.exists(from))) throw notFound(t('svc.notExist', { what: t('svc.path'), value: from }))

    const safeName = assertSafeName(name)
    const to = path.join(path.dirname(from), safeName)

    // 只改大小写（Windows / macOS）时，目标是同一个文件：直接改名，
    // 不能走下面的"先删目标"分支，否则会把文件删掉。
    if (isSamePath(from, to)) {
      if (from !== to) {
        try {
          await fs.rename(from, to)
        } catch (error) {
          throw fromFsError(error, from)
        }
      }
      const item = await this.stat(to)
      if (!item) throw notFound(t('svc.notExist', { what: t('svc.path'), value: to }))
      return item
    }

    if (await pathExists(to)) {
      if (!options.overwrite) throw alreadyExists(t('svc.sameNameExists', { value: to }))
      try {
        await fs.rm(to, { recursive: true, force: true })
      } catch (error) {
        throw fromFsError(error, to)
      }
    }

    try {
      await fs.rename(from, to)
    } catch (error) {
      throw fromFsError(error, from)
    }

    const item = await this.stat(to)
    if (!item) throw new ServiceError('IO_ERROR', t('svc.unreadableAfter', { action: t('common.rename'), value: to }))
    return item
  }

  async mkdir(target: string): Promise<FileItem> {
    const resolved = path.resolve(target)
    this.assertNotRoot(resolved)

    if (await this.exists(resolved)) throw alreadyExists(t('svc.exists', { what: t('svc.target'), value: resolved }))
    if (!(await pathExists(path.dirname(resolved)))) {
      throw notFound(t('svc.notExist', { what: t('svc.parent'), value: path.dirname(resolved) }))
    }

    try {
      await fs.mkdir(resolved)
    } catch (error) {
      throw fromFsError(error, resolved)
    }

    const item = await this.stat(resolved)
    if (!item) {
      throw new ServiceError('IO_ERROR', t('svc.unreadableAfter', { action: t('common.create'), value: resolved }))
    }
    return item
  }

  /** 在指定目录下新建子目录，名称校验与路径拼接都在主进程完成 */
  async createDirectory(parentPath: string, name: string): Promise<FileItem> {
    const parent = path.resolve(parentPath)
    if (!(await this.exists(parent))) throw notFound(t('svc.notExist', { what: t('svc.dir'), value: parent }))
    if (!(await this.isDirectory(parent))) throw invalidArgument(t('svc.notDirectory', { value: parent }))
    return this.mkdir(path.join(parent, assertSafeName(name)))
  }

  /**
   * 批量移动到目标目录，目标名沿用原文件名。
   * 单个失败不影响其它条目，冲突时不会静默覆盖。
   */
  async moveIntoMany(sources: string[], targetDirectory: string, options: TransferOptions = {}): Promise<BulkResult> {
    const targetDir = path.resolve(targetDirectory)
    const result: BulkResult = { succeeded: [], skipped: [], failed: [], entries: [] }

    if (!(await this.exists(targetDir))) {
      throw notFound(t('svc.notExist', { what: t('svc.targetDir'), value: targetDir }))
    }
    if (!(await this.isDirectory(targetDir))) throw invalidArgument(t('svc.notDirectory', { value: targetDir }))

    for (const source of sources) {
      const resolved = path.resolve(source)
      try {
        const target = path.join(targetDir, path.basename(resolved))
        // 已经在目标目录里：跳过而不是报错（例如把文件"移动"到它所在的目录）
        if (isSamePath(path.dirname(resolved), targetDir)) {
          result.skipped.push(resolved)
          continue
        }
        const moved = await this.move(resolved, target, options)
        result.succeeded.push(moved.path)
        result.entries?.push({ source: resolved, target: moved.path })
      } catch (error) {
        result.failed.push({ path: resolved, message: fromFsError(error, resolved).message })
      }
    }

    return result
  }

  /**
   * 批量重命名：每个条目只换名字，留在原目录。
   * 与 moveIntoMany 一致，单个失败不影响其它条目，默认不覆盖。
   */
  async renameMany(entries: RenameEntry[], options: TransferOptions = {}): Promise<BulkResult> {
    const result: BulkResult = { succeeded: [], skipped: [], failed: [], entries: [] }

    if (entries.length === 0) throw invalidArgument(t('svc.nothingToRename'))

    for (const entry of entries) {
      const resolved = path.resolve(entry.path)
      try {
        const renamed = await this.rename(resolved, entry.name, options)
        result.succeeded.push(renamed.path)
        result.entries?.push({ source: resolved, target: renamed.path })
      } catch (error) {
        result.failed.push({ path: resolved, message: fromFsError(error, resolved).message })
      }
    }

    return result
  }

  /**
   * 批量永久删除（不可恢复）。逐个执行，失败不影响其它条目。
   * 日常删除走 SystemService.trash()（系统回收站），只有调用方明确要求永久删除时才用这里。
   */
  async remove(targets: string[]): Promise<BulkResult> {
    const result: BulkResult = { succeeded: [], skipped: [], failed: [] }

    for (const target of targets) {
      const resolved = path.resolve(target)
      try {
        this.assertNotRoot(resolved)
        if (!(await this.exists(resolved))) throw notFound(t('svc.notExist', { what: t('svc.path'), value: resolved }))

        await fs.rm(resolved, { recursive: true, force: false })
        result.succeeded.push(resolved)
      } catch (error) {
        result.failed.push({ path: resolved, message: fromFsError(error, resolved).message })
      }
    }

    return result
  }
}
