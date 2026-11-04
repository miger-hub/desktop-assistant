import path from 'node:path'
import type { Shortcut, ShortcutInput, ShortcutKind } from '../../shared/types'
import { alreadyExists, invalidArgument, notFound } from '../errors'
import { t } from '../i18n'
import type { ShortcutRepository } from '../repositories/ShortcutRepository'
import type { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import type { FileService } from './FileService'

const KINDS: ShortcutKind[] = ['file', 'directory', 'workspace']
const LABEL_MAX = 80

/** 快捷入口：把常用文件 / 目录 / 工作区置顶，路径存在性实时判断 */
export class ShortcutService {
  constructor(
    private readonly shortcuts: ShortcutRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly files: FileService
  ) {}

  async list(): Promise<Shortcut[]> {
    const items = this.shortcuts.findAll()
    return Promise.all(items.map(async (item) => ({ ...item, exists: await this.exists(item) })))
  }

  async add(input: ShortcutInput): Promise<Shortcut> {
    const kind = input.kind
    if (!KINDS.includes(kind)) throw invalidArgument(t('svc.unknownShortcutKind', { value: kind }))

    const shortcut =
      kind === 'workspace' ? this.addWorkspace(input) : this.addPath(kind, input)
    return { ...shortcut, exists: await this.exists(shortcut) }
  }

  remove(id: number): void {
    if (!this.shortcuts.delete(id)) throw notFound(t('svc.notExist', { what: t('svc.shortcut'), value: id }))
  }

  private addPath(kind: 'file' | 'directory', input: ShortcutInput): Shortcut {
    const raw = input.path?.trim()
    if (!raw) throw invalidArgument(t('svc.chooseShortcutTarget'))

    const target = path.resolve(raw)
    if (this.shortcuts.findByPath(target)) throw alreadyExists(t('svc.alreadyPinned'))

    return this.shortcuts.insert({
      kind,
      label: this.label(input.label, path.basename(target) || target),
      path: target,
      workspaceId: null,
      sortOrder: this.shortcuts.nextSortOrder()
    })
  }

  private addWorkspace(input: ShortcutInput): Shortcut {
    const workspaceId = input.workspaceId
    if (typeof workspaceId !== 'number' || !Number.isFinite(workspaceId)) {
      throw invalidArgument(t('svc.chooseShortcutWorkspace'))
    }

    const workspace = this.workspaces.findById(workspaceId)
    if (!workspace) throw notFound(t('svc.notExist', { what: t('svc.workspace'), value: workspaceId }))
    if (this.shortcuts.findByWorkspace(workspaceId)) throw alreadyExists(t('svc.workspaceAlreadyPinned'))

    return this.shortcuts.insert({
      kind: 'workspace',
      label: this.label(input.label, workspace.name),
      path: null,
      workspaceId,
      sortOrder: this.shortcuts.nextSortOrder()
    })
  }

  private label(input: string | undefined, fallback: string): string {
    const label = (input?.trim() || fallback).trim()
    if (!label) throw invalidArgument(t('svc.nameRequired'))
    return label.slice(0, LABEL_MAX)
  }

  /** 工作区看数据库，文件 / 目录看磁盘 */
  private async exists(shortcut: Shortcut): Promise<boolean> {
    if (shortcut.kind === 'workspace') {
      return shortcut.workspaceId !== null && this.workspaces.findById(shortcut.workspaceId) !== null
    }
    return shortcut.path !== null && this.files.exists(shortcut.path)
  }
}
