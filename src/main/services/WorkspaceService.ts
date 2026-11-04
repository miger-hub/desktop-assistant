import path from 'node:path'
import type { MappedDirectory, WorkspaceDetail, WorkspaceInput, WorkspacePatch } from '../../shared/types'
import { alreadyExists, invalidArgument, notFound } from '../errors'
import { t } from '../i18n'
import type { MappingRepository } from '../repositories/MappingRepository'
import type { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import type { FileService } from './FileService'

function normalizeName(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) throw invalidArgument(t('svc.nameRequired'))
  if (trimmed.length > 60) throw invalidArgument(t('svc.nameTooLong', { max: 60 }))
  return trimmed
}

/**
 * Workspace 业务逻辑：逻辑分组 + 目录映射。
 * 数据库只保存映射关系，不保存文件本身。
 */
export class WorkspaceService {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly mappings: MappingRepository,
    private readonly files: FileService
  ) {}

  async list(): Promise<WorkspaceDetail[]> {
    const workspaces = this.workspaces.findAll()
    const result: WorkspaceDetail[] = []

    for (const workspace of workspaces) {
      result.push({ ...workspace, directories: await this.decorate(this.mappings.findByWorkspace(workspace.id)) })
    }

    return result
  }

  async get(id: number): Promise<WorkspaceDetail> {
    const workspace = this.requireWorkspace(id)
    return { ...workspace, directories: await this.decorate(this.mappings.findByWorkspace(id)) }
  }

  async create(input: WorkspaceInput): Promise<WorkspaceDetail> {
    const name = normalizeName(input.name)
    if (this.workspaces.findByName(name)) {
      throw alreadyExists(t('svc.exists', { what: t('svc.workspace'), value: name }))
    }

    const workspace = this.workspaces.insert({
      name,
      sortOrder: input.sortOrder ?? this.workspaces.nextSortOrder()
    })
    return { ...workspace, directories: [] }
  }

  async update(id: number, patch: WorkspacePatch): Promise<WorkspaceDetail> {
    const current = this.requireWorkspace(id)

    if (patch.name !== undefined) {
      const name = normalizeName(patch.name)
      const duplicated = this.workspaces.findByName(name)
      if (duplicated && duplicated.id !== id) {
        throw alreadyExists(t('svc.exists', { what: t('svc.workspace'), value: name }))
      }
      patch = { ...patch, name }
    }

    if (patch.sortOrder !== undefined && !Number.isFinite(patch.sortOrder)) {
      throw invalidArgument(t('svc.orderInvalid'))
    }

    const updated = this.workspaces.update(current.id, patch)
    if (!updated) throw notFound(t('svc.notExist', { what: t('svc.workspace'), value: id }))
    return { ...updated, directories: await this.decorate(this.mappings.findByWorkspace(id)) }
  }

  remove(id: number): void {
    this.requireWorkspace(id)
    // 目录映射与 Todo 通过外键级联删除，不会动到真实文件
    this.workspaces.delete(id)
  }

  /**
   * 拖拽排序：ids 必须是当前全部工作区的完整顺序，
   * 只接受全量顺序可以避免部分更新把 sort_order 排成难以预测的结果。
   */
  async reorder(ids: number[]): Promise<WorkspaceDetail[]> {
    if (!Array.isArray(ids) || ids.length === 0) throw invalidArgument(t('svc.orderEmpty'))
    if (ids.some((id) => !Number.isInteger(id))) throw invalidArgument(t('svc.orderBadId'))
    if (new Set(ids).size !== ids.length) throw invalidArgument(t('svc.orderDuplicate'))

    const existing = this.workspaces.findAll()
    if (existing.length !== ids.length || existing.some((workspace) => !ids.includes(workspace.id))) {
      throw invalidArgument(t('svc.orderMismatch'))
    }

    this.workspaces.reorder(ids)
    return this.list()
  }

  async addDirectory(workspaceId: number, dirPath: string, name?: string): Promise<MappedDirectory> {
    this.requireWorkspace(workspaceId)

    if (!dirPath || typeof dirPath !== 'string') throw invalidArgument(t('svc.dirPathRequired'))
    const resolved = path.resolve(dirPath)

    if (!(await this.files.exists(resolved))) throw notFound(t('svc.notExist', { what: t('svc.dir'), value: resolved }))
    if (!(await this.files.isDirectory(resolved))) throw invalidArgument(t('svc.notDirectory', { value: resolved }))
    if (this.mappings.findByPath(workspaceId, resolved)) throw alreadyExists(t('svc.alreadyMapped', { value: resolved }))

    const mapping = this.mappings.insert({
      workspaceId,
      name: name?.trim() || path.basename(resolved) || resolved,
      path: resolved
    })
    return { ...mapping, exists: true }
  }

  removeDirectory(mappingId: number): void {
    if (!this.mappings.findById(mappingId)) {
      throw notFound(t('svc.notExist', { what: t('svc.mapping'), value: mappingId }))
    }
    this.mappings.delete(mappingId)
  }

  private requireWorkspace(id: number) {
    const workspace = this.workspaces.findById(id)
    if (!workspace) throw notFound(t('svc.notExist', { what: t('svc.workspace'), value: id }))
    return workspace
  }

  /** 补上目录是否存在这类运行时信息 */
  private async decorate(directories: MappedDirectory[]): Promise<MappedDirectory[]> {
    const result: MappedDirectory[] = []
    for (const directory of directories) {
      result.push({ ...directory, exists: await this.files.exists(directory.path) })
    }
    return result
  }
}
