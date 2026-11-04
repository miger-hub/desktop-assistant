import type { RuleInput, RulePatch } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

export function registerRuleIpc(context: AppContext): void {
  const { rules, operations } = context

  registerHandler(IPC.ruleList, () => rules.list())
  registerHandler(IPC.ruleCreate, (input: RuleInput) => rules.create(input))
  registerHandler(IPC.ruleUpdate, (id: number, patch: RulePatch) => rules.update(id, patch))
  registerHandler(IPC.ruleRemove, (id: number) => rules.remove(id))
  registerHandler(IPC.rulePreview, (ids?: number[]) => rules.preview(ids))
  registerHandler(IPC.ruleApply, (ids?: number[]) => rules.apply(ids))

  registerHandler(IPC.operationList, (limit?: number) => operations.listBatches(limit ?? 20))
  registerHandler(IPC.operationUndoLast, () => operations.undoLast())
  registerHandler(IPC.operationUndo, (batchId: string) => operations.undo(batchId))
}
