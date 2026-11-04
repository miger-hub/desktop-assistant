import path from 'node:path'
import type {
  FileItem,
  Rule,
  RuleInput,
  RuleMatch,
  RuleMatchType,
  RulePatch,
  RulePreview,
  RuleRunResult
} from '../../shared/types'
import { invalidArgument, notFound } from '../errors'
import { t } from '../i18n'
import type { RuleRepository } from '../repositories/RuleRepository'
import type { FileService } from './FileService'
import type { OperationService } from './OperationService'

const MATCH_TYPES: RuleMatchType[] = ['extension', 'name']
const NAME_MAX = 60
const PATTERN_MAX = 200

/**
 * 把规则里的匹配串拆成小写 token：
 * 扩展名支持 `png, .jpg`，名称关键字支持 `截图, Screenshot`（逗号 / 空格分隔）。
 */
export function parsePattern(matchType: RuleMatchType, pattern: string): string[] {
  const tokens = pattern
    .split(/[,，\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)

  // 扩展名允许写成 `png` / `.png` / `*.PNG`，统一去掉前缀再比较
  return matchType === 'extension' ? tokens.map((token) => token.replace(/^\*?\./, '')).filter(Boolean) : tokens
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

/**
 * 规则只作用于普通文件：目录和符号链接保持原样，避免一次误操作把整个目录搬走。
 * 导出成纯函数方便单测。
 */
export function matchesRule(
  rule: Pick<Rule, 'matchType' | 'pattern'>,
  item: Pick<FileItem, 'name' | 'type'>
): boolean {
  if (item.type !== 'file') return false

  const tokens = parsePattern(rule.matchType, rule.pattern)
  if (tokens.length === 0) return false

  if (rule.matchType === 'extension') {
    const extension = extensionOf(item.name)
    return extension !== '' && tokens.includes(extension)
  }

  const name = item.name.toLowerCase()
  return tokens.some((token) => name.includes(token))
}

/** 自动整理规则：扫描源目录 → 命中条件 → 移动到目标目录，执行前先预览 */
export class RuleService {
  constructor(
    private readonly rules: RuleRepository,
    private readonly files: FileService,
    private readonly operations: OperationService
  ) {}

  list(): Rule[] {
    return this.rules.findAll()
  }

  create(input: RuleInput): Rule {
    const normalized = this.normalize(input, true)
    return this.rules.insert({
      name: normalized.name!,
      enabled: normalized.enabled ?? true,
      sourcePath: normalized.sourcePath!,
      matchType: normalized.matchType!,
      pattern: normalized.pattern!,
      targetPath: normalized.targetPath!,
      // 新建的规则放在最上面（列表按 sort_order 升序显示）
      sortOrder: normalized.sortOrder ?? this.rules.topSortOrder()
    })
  }

  update(id: number, patch: RulePatch): Rule {
    this.requireRule(id)
    const normalized = this.normalize(patch, false)
    const updated = this.rules.update(id, normalized)
    if (!updated) throw notFound(t('svc.notExist', { what: t('svc.rule'), value: id }))
    return updated
  }

  remove(id: number): void {
    if (!this.rules.delete(id)) throw notFound(t('svc.notExist', { what: t('svc.rule'), value: id }))
  }

  /** 预览：只读源目录，不移动任何文件 */
  async preview(ids?: number[]): Promise<RulePreview[]> {
    return Promise.all(this.resolve(ids).map((rule) => this.previewOne(rule)))
  }

  /** 执行规则（不传 ids 表示所有启用的规则），并记录一次可撤销的操作 */
  async apply(ids?: number[]): Promise<RuleRunResult> {
    const rules = this.resolve(ids)
    const result: RuleRunResult = {
      batchId: null,
      ruleNames: [],
      succeeded: [],
      skipped: [],
      failed: [],
      entries: []
    }
    const moved: Array<{ source: string; target: string }> = []

    for (const rule of rules) {
      const preview = await this.previewOne(rule)
      for (const message of preview.errors) {
        result.failed.push({ path: rule.sourcePath, message })
      }

      const paths = preview.matches.map((match) => match.path)
      if (paths.length === 0) continue

      const bulk = await this.files.moveIntoMany(paths, rule.targetPath)
      result.succeeded.push(...bulk.succeeded)
      result.skipped.push(...bulk.skipped)
      result.failed.push(...bulk.failed)
      moved.push(...(bulk.entries ?? []))
      result.ruleNames.push(rule.name)
    }

    result.entries = moved
    result.batchId = this.operations.record({
      entries: moved,
      kind: 'move',
      origin: 'rule',
      // 一次执行跨多条规则时不归到单条规则名下
      ruleId: rules.length === 1 ? rules[0].id : null
    })
    return result
  }

  private resolve(ids?: number[]): Rule[] {
    if (ids === undefined) return this.rules.findEnabled()
    if (ids.length === 0) return []
    return ids.map((id) => this.requireRule(id))
  }

  private requireRule(id: number): Rule {
    const rule = this.rules.findById(id)
    if (!rule) throw notFound(t('svc.notExist', { what: t('svc.rule'), value: id }))
    return rule
  }

  private async previewOne(rule: Rule): Promise<RulePreview> {
    const preview: RulePreview = { ruleId: rule.id, ruleName: rule.name, matches: [], errors: [] }

    const sourcePath = path.resolve(rule.sourcePath)
    const targetPath = path.resolve(rule.targetPath)

    if (!(await this.files.exists(sourcePath))) {
      preview.errors.push(t('svc.notExist', { what: t('rules.sourcePath'), value: sourcePath }))
      return preview
    }
    if (!(await this.files.exists(targetPath))) {
      preview.errors.push(t('svc.notExist', { what: t('rules.targetPath'), value: targetPath }))
      return preview
    }

    let items: FileItem[]
    try {
      // 隐藏文件不参与整理，避免把 .DS_Store 之类也搬走
      items = await this.files.list(sourcePath, { showHidden: false })
    } catch (error) {
      preview.errors.push((error as Error).message)
      return preview
    }

    const matches: RuleMatch[] = []
    for (const item of items) {
      if (!matchesRule(rule, item)) continue
      const destination = path.join(targetPath, item.name)
      matches.push({
        path: item.path,
        name: item.name,
        targetPath: destination,
        conflict: await this.files.exists(destination)
      })
    }
    preview.matches = matches
    return preview
  }

  /** 规则字段校验 + 归一化（路径统一 resolve，名称与匹配串去空白） */
  private normalize(input: RuleInput | RulePatch, requireAll: boolean): RulePatch {
    const patch: RulePatch = {}

    if (input.name !== undefined || requireAll) {
      const name = (input.name ?? '').trim()
      if (!name) throw invalidArgument(t('svc.ruleNameRequired'))
      if (name.length > NAME_MAX) throw invalidArgument(t('svc.ruleNameTooLong', { max: NAME_MAX }))
      patch.name = name
    }

    if (input.matchType !== undefined || requireAll) {
      const matchType = input.matchType ?? 'extension'
      if (!MATCH_TYPES.includes(matchType)) throw invalidArgument(t('svc.unknownMatchType', { value: matchType }))
      patch.matchType = matchType
    }

    if (input.pattern !== undefined || requireAll) {
      const pattern = (input.pattern ?? '').trim()
      if (!pattern) throw invalidArgument(t('svc.patternRequired'))
      if (pattern.length > PATTERN_MAX) throw invalidArgument(t('svc.patternTooLong', { max: PATTERN_MAX }))
      const resolved = parsePattern(input.matchType ?? 'extension', pattern)
      if (resolved.length === 0) throw invalidArgument(t('svc.patternInvalid'))
      patch.pattern = pattern
    }

    if (input.sourcePath !== undefined || requireAll) {
      const sourcePath = (input.sourcePath ?? '').trim()
      if (!sourcePath) throw invalidArgument(t('svc.chooseSource'))
      patch.sourcePath = path.resolve(sourcePath)
    }

    if (input.targetPath !== undefined || requireAll) {
      const targetPath = (input.targetPath ?? '').trim()
      if (!targetPath) throw invalidArgument(t('svc.chooseTarget'))
      patch.targetPath = path.resolve(targetPath)
    }

    if (input.enabled !== undefined) patch.enabled = input.enabled
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder

    // 源目录与目标目录相同会让规则变成空转
    if (patch.sourcePath && patch.targetPath && patch.sourcePath === patch.targetPath) {
      throw invalidArgument(t('svc.sourceTargetSame'))
    }
    return patch
  }
}
