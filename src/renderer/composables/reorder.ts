/**
 * 拖拽排序里唯一需要算的东西：把"插入位置"换算成最终下标。
 * 抽出来是为了不依赖 DOM 也能单测（下标算错是这类功能最常见的 bug）。
 */

/** slot 是插入位置（0 ~ 长度），去掉被拖动的项之后，它后面的下标都要左移一位 */
export function dropTargetIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot
}

/** 返回把 from 移动到 slot 之后的新数组；没有变化时顺序与传入一致 */
export function moveItem<T>(items: readonly T[], from: number, slot: number): T[] {
  const next = [...items]
  if (from < 0 || from >= next.length) return next

  const target = dropTargetIndex(from, slot)
  if (target === from) return next

  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}
