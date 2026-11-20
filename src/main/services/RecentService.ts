import path from 'node:path'
import type { RecentEntry } from '../../shared/types'
import type { RecentRepository } from '../repositories/RecentRepository'

/** 库里最多保留的条数，弹框默认只展示一小部分 */
export const RECENT_KEEP = 50
export const RECENT_LIMIT = 15

/** limit 收敛到 [1, RECENT_KEEP]，缺省时用 RECENT_LIMIT */
export function clampRecentLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return RECENT_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), RECENT_KEEP)
}

/**
 * 把「从搜索打开的文件 / 目录」和「从搜索打开的备忘」按时间合并成一份「最近打开」。
 * 纯函数，方便单测；时间相同时保持传入顺序（文件在前）。
 */
export function mergeRecent(files: RecentEntry[], notes: RecentEntry[], limit: number): RecentEntry[] {
  return [...files, ...notes]
    .sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0))
    .slice(0, limit)
}

/** 最近打开：只记录成功打开过的文件 / 目录，给搜索弹框的「最近打开」用 */
export class RecentService {
  /** 上一次写入的时间戳：同一毫秒内连续打开多个文件时保证排序稳定 */
  private lastOpenedAt = 0

  constructor(private readonly recents: RecentRepository) {}

  touch(target: string, kind: 'file' | 'directory'): void {
    const resolved = path.resolve(target)
    this.recents.touch(resolved, path.basename(resolved) || resolved, kind, this.nextOpenedAt())
    this.recents.prune(RECENT_KEEP)
  }

  list(limit = RECENT_LIMIT): RecentEntry[] {
    return this.recents.find(clampRecentLimit(limit))
  }

  clear(): void {
    this.recents.clear()
  }

  /**
   * `new Date().toISOString()` 只有毫秒精度：连续打开两个文件很可能落在同一毫秒，
   * 排序就会变成随机。这里保证每次写入的时间戳严格递增。
   */
  private nextOpenedAt(now = Date.now()): string {
    this.lastOpenedAt = now > this.lastOpenedAt ? now : this.lastOpenedAt + 1
    return new Date(this.lastOpenedAt).toISOString()
  }
}
