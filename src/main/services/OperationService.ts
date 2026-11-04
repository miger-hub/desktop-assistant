import { randomUUID } from 'node:crypto'
import type { BulkResult, FileOperationKind, FileOperationOrigin, OperationBatch } from '../../shared/types'
import { fromFsError, notFound } from '../errors'
import { t } from '../i18n'
import type { OperationRepository } from '../repositories/OperationRepository'
import type { FileService } from './FileService'

/**
 * 文件操作历史：记录移动 / 重命名，并支持撤销最近一批。
 * 删除不入历史——删除走系统回收站，恢复交给系统文件管理器。
 */
export class OperationService {
  constructor(
    private readonly operations: OperationRepository,
    private readonly files: FileService
  ) {}

  /** 记录一次批量操作；没有成功条目时不产生空批次 */
  record(input: {
    entries: Array<{ source: string; target: string }>
    kind: FileOperationKind
    origin: FileOperationOrigin
    ruleId?: number | null
  }): string | null {
    if (input.entries.length === 0) return null

    const batchId = randomUUID()
    this.operations.insertMany(batchId, input.entries, input.kind, input.origin, input.ruleId ?? null)
    return batchId
  }

  listBatches(limit = 20): OperationBatch[] {
    return this.operations.findBatches(limit)
  }

  lastUndoable(): OperationBatch | null {
    return this.operations.findLastUndoable()
  }

  /** 撤销最近一次还有内容的操作 */
  async undoLast(): Promise<{ batchId: string; result: BulkResult } | null> {
    const batch = this.lastUndoable()
    if (!batch) return null
    return { batchId: batch.batchId, result: await this.undo(batch.batchId) }
  }

  /**
   * 撤销一批操作：逐条把 target 移回 source。
   * 原位置已被占用、或目标已经不在时该条目失败，其余条目继续，最后只标记成功的条目。
   */
  async undo(batchId: string): Promise<BulkResult> {
    const entries = this.operations.findByBatch(batchId).filter((entry) => entry.undoneAt === null)
    if (entries.length === 0) throw notFound(t('svc.batchUndoEmpty'))

    const result: BulkResult = { succeeded: [], skipped: [], failed: [], entries: [] }
    const undoneIds: number[] = []

    // 反向撤销：后做的先还原，避免同批次内的中间状态互相影响
    for (const entry of [...entries].reverse()) {
      try {
        if (!(await this.files.exists(entry.targetPath))) {
          throw notFound(t('svc.originalMissing', { value: entry.targetPath }))
        }
        const restored = await this.files.move(entry.targetPath, entry.sourcePath)
        result.succeeded.push(restored.path)
        result.entries?.push({ source: entry.targetPath, target: restored.path })
        undoneIds.push(entry.id)
      } catch (error) {
        result.failed.push({ path: entry.targetPath, message: fromFsError(error, entry.targetPath).message })
      }
    }

    this.operations.markUndone(undoneIds)
    return result
  }
}
