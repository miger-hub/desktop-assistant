import { reactive } from 'vue'
import type { Rule, RuleInput, RulePatch, RulePreview, RuleRunResult } from '@shared/types'
import { t } from '../i18n'
import { useUi } from './ui'

interface RuleAvailability {
  source: boolean
  target: boolean
}

const state = reactive({
  items: [] as Rule[],
  /** 源 / 目标目录当前是否存在（实时判断，不存库） */
  availability: {} as Record<number, RuleAvailability>,
  loading: false,
  busy: false
})

/** files.exists 出错（路径为空等）时按"不存在"处理，不要打断整个列表 */
async function exists(target: string): Promise<boolean> {
  try {
    return await window.desktop.files.exists(target)
  } catch {
    return false
  }
}

async function refreshAvailability(): Promise<void> {
  const entries = await Promise.all(
    state.items.map(async (rule) => {
      const [source, target] = await Promise.all([exists(rule.sourcePath), exists(rule.targetPath)])
      return [rule.id, { source, target }] as const
    })
  )
  state.availability = Object.fromEntries(entries)
}

async function load(): Promise<void> {
  state.loading = true
  try {
    state.items = await window.desktop.rule.list()
    await refreshAvailability()
  } catch (error) {
    useUi().handleError(error, t('error.readRules'))
  } finally {
    state.loading = false
  }
}

async function create(input: RuleInput): Promise<boolean> {
  try {
    await window.desktop.rule.create(input)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.createRule'))
    return false
  }
}

async function update(id: number, patch: RulePatch): Promise<boolean> {
  try {
    await window.desktop.rule.update(id, patch)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.saveRule'))
    return false
  }
}

async function remove(id: number): Promise<boolean> {
  try {
    await window.desktop.rule.remove(id)
    await load()
    return true
  } catch (error) {
    useUi().handleError(error, t('error.removeRule'))
    return false
  }
}

/** 预览：不修改文件，只列出会被移动的条目 */
async function preview(ids?: number[]): Promise<RulePreview[]> {
  try {
    return await window.desktop.rule.preview(ids)
  } catch (error) {
    useUi().handleError(error, t('error.preview'))
    return []
  }
}

/** 执行规则并刷新文件列表 */
async function apply(ids?: number[]): Promise<RuleRunResult | null> {
  state.busy = true
  try {
    const result = await window.desktop.rule.apply(ids)
    useUi().requestRefresh()
    return result
  } catch (error) {
    useUi().handleError(error, t('error.runRule'))
    return null
  } finally {
    state.busy = false
  }
}

export function useRules() {
  return { state, load, create, update, remove, preview, apply, refreshAvailability }
}
