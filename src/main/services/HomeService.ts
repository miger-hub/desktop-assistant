import path from 'node:path'
import type { HomeShortcut, HomeShortcutInput } from '../../shared/types'
import { alreadyExists, invalidArgument, notFound } from '../errors'
import { t } from '../i18n'
import type { HomeShortcutRepository } from '../repositories/HomeShortcutRepository'
import type { FileService } from './FileService'

const LABEL_MAX = 80

/** 首页快捷访问：只保存系统应用的启动目标，路径存在性实时判断 */
export class HomeService {
  constructor(
    private readonly shortcuts: HomeShortcutRepository,
    private readonly files: FileService
  ) {}

  async list(): Promise<HomeShortcut[]> {
    const items = this.shortcuts.findAll()
    return Promise.all(items.map(async (item) => ({ ...item, exists: await this.files.exists(item.path) })))
  }

  async add(input: HomeShortcutInput): Promise<HomeShortcut> {
    const raw = input.path?.trim()
    if (!raw) throw invalidArgument(t('svc.chooseAppShortcut'))

    const target = path.resolve(raw)
    if (!(await this.files.exists(target))) {
      throw notFound(t('svc.notExist', { what: t('svc.application'), value: target }))
    }
    if (this.shortcuts.findByPath(target)) throw alreadyExists(t('svc.appAlreadyPinned'))

    const fallback = path.basename(target, path.extname(target)) || path.basename(target) || target
    const label = (input.label?.trim() || fallback).trim().slice(0, LABEL_MAX)
    if (!label) throw invalidArgument(t('svc.nameRequired'))

    const shortcut = this.shortcuts.insert({
      label,
      path: target,
      sortOrder: this.shortcuts.nextSortOrder()
    })
    return { ...shortcut, exists: true }
  }

  remove(id: number): void {
    if (!this.shortcuts.delete(id)) {
      throw notFound(t('svc.notExist', { what: t('svc.appShortcut'), value: id }))
    }
  }
}
