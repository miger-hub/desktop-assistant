import { reactive } from 'vue'
import type { BulkResult, OperationBatch } from '@shared/types'
import { t } from '../i18n'
import { useUi } from './ui'

const state = reactive({
  batches: [] as OperationBatch[],
  loading: false
})

async function load(limit = 20): Promise<void> {
  state.loading = true
  try {
    state.batches = await window.desktop.operations.list(limit)
  } catch (error) {
    useUi().handleError(error, t('error.readOperations'))
  } finally {
    state.loading = false
  }
}

/** 撤销后刷新历史与文件列表；返回撤销结果，由调用方决定提示文案 */
async function undo(batchId: string): Promise<BulkResult | null> {
  try {
    const result = await window.desktop.operations.undo(batchId)
    await load()
    useUi().requestRefresh()
    return result
  } catch (error) {
    useUi().handleError(error, t('error.undo'))
    return null
  }
}

async function undoLast(): Promise<BulkResult | null> {
  try {
    const undone = await window.desktop.operations.undoLast()
    if (!undone) {
      useUi().toast(t('toast.noUndo'), 'info')
      return null
    }
    await load()
    useUi().requestRefresh()
    return undone.result
  } catch (error) {
    useUi().handleError(error, t('error.undo'))
    return null
  }
}

/** 撤销结果的统一提示：成功多少、失败多少（最多列 3 条原因） */
function report(result: BulkResult): void {
  const ui = useUi()
  if (result.failed.length === 0) {
    ui.toast(t('toast.undone', { count: result.succeeded.length }), 'success')
    return
  }

  const lines = result.failed.slice(0, 3).map((item) => `· ${item.message}`)
  if (result.failed.length > 3) lines.push(t('toast.moreNotListed', { count: result.failed.length - 3 }))
  ui.toast(
    t('toast.undonePartial', {
      count: result.succeeded.length,
      failed: result.failed.length,
      lines: lines.join('\n')
    }),
    'error'
  )
}

export function useOperations() {
  return { state, load, undo, undoLast, report }
}
