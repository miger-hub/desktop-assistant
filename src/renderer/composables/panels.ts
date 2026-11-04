/**
 * 板块（面板）之间的方向跳转：`Ctrl/Cmd + 方向键` 用。
 * 这里只做纯几何计算，不碰 DOM 与响应式，方便单测；
 * 面板注册表与当前焦点在 stores/panels.ts。
 */

export type PanelDirection = 'left' | 'right' | 'up' | 'down'

export interface PanelRect {
  left: number
  top: number
  width: number
  height: number
}

export interface PanelTarget {
  id: string
  rect: PanelRect
}

/** 垂直方向偏移的权重：越大越优先"正上方 / 正下方"，而不是斜着穿过整个页面 */
const SIDE_WEIGHT = 2

function centerX(rect: PanelRect): number {
  return rect.left + rect.width / 2
}

function centerY(rect: PanelRect): number {
  return rect.top + rect.height / 2
}

/**
 * 垂直于跳转方向的轴上要有重叠。
 * 没有这条规则时，工作区页面里从左侧列表按 ↑ 会跳到右上角的映射目录板块。
 */
function overlaps(from: PanelRect, to: PanelRect, direction: PanelDirection): boolean {
  const horizontal = direction === 'left' || direction === 'right'
  // 左右跳转时比较纵向范围，上下跳转时比较横向范围
  const fromStart = horizontal ? from.top : from.left
  const fromEnd = fromStart + (horizontal ? from.height : from.width)
  const toStart = horizontal ? to.top : to.left
  const toEnd = toStart + (horizontal ? to.height : to.width)
  return Math.min(fromEnd, toEnd) - Math.max(fromStart, toStart) > 0
}

/** 目标方向上"主距离"和"垂直偏移"，有垂直偏移的板块排在后面 */
function offsets(
  direction: PanelDirection,
  from: PanelRect,
  to: PanelRect
): { primary: number; secondary: number } {
  if (direction === 'left' || direction === 'right') {
    const steps = centerX(to) - centerX(from)
    return {
      primary: direction === 'right' ? steps : -steps,
      secondary: Math.abs(centerY(to) - centerY(from))
    }
  }

  const steps = centerY(to) - centerY(from)
  return {
    primary: direction === 'down' ? steps : -steps,
    secondary: Math.abs(centerX(to) - centerX(from))
  }
}

/**
 * 找出 `fromId` 在 `direction` 方向上的最近板块；没有就返回 null。
 * 被打分的板块中心必须在目标方向那一侧，并且在垂直方向与之重叠，
 * 避免"按 ← 反而跳到右边"或"按 ↑ 跳到另一列"。
 * `fromId` 为 null 表示没有起点（第一次按键），此时以整个窗口为起点。
 */
export function pickPanel(
  direction: PanelDirection,
  fromId: string | null,
  from: PanelRect,
  targets: PanelTarget[]
): string | null {
  let best: string | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const target of targets) {
    if (target.id === fromId) continue
    if (!overlaps(from, target.rect, direction)) continue

    const { primary, secondary } = offsets(direction, from, target.rect)
    if (primary <= 0) continue

    const score = primary + secondary * SIDE_WEIGHT
    if (score < bestScore) {
      bestScore = score
      best = target.id
    }
  }

  return best
}
