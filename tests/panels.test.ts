import { describe, expect, it } from 'vitest'
import { pickPanel, type PanelTarget } from '../src/renderer/composables/panels'

/** 1200x800 窗口下工作区页面的实际布局（数值取自无头浏览器实测） */
const workspace: PanelTarget[] = [
  { id: 'workspace-list', rect: { left: 0, top: 34, width: 220, height: 623 } },
  { id: 'workspace-directories', rect: { left: 220, top: 91, width: 980, height: 110 } },
  { id: 'workspace-files', rect: { left: 220, top: 201, width: 980, height: 456 } }
]

/** 还没聚焦任何板块时，以整个窗口为起点 */
const viewport = { left: 0, top: 0, width: 1200, height: 657 }

function pick(direction: Parameters<typeof pickPanel>[0], fromId: string | null, from = viewport) {
  return pickPanel(direction, fromId, from, workspace)
}

function rectOf(id: string) {
  return workspace.find((target) => target.id === id)!.rect
}

describe('pickPanel', () => {
  it('第一次按键时从窗口整体出发，四个方向都落在合理板块', () => {
    expect(pick('left', null)).toBe('workspace-list')
    expect(pick('right', null)).toBe('workspace-files')
    expect(pick('up', null)).toBe('workspace-directories')
    expect(pick('down', null)).toBe('workspace-files')
  })

  it('工作区列表：向右到文件列表，上下左右没有别的板块', () => {
    expect(pick('right', 'workspace-list', rectOf('workspace-list'))).toBe('workspace-files')
    expect(pick('left', 'workspace-list', rectOf('workspace-list'))).toBeNull()
    // 映射目录在右侧那一列，按 ↑ 不该横跨过去
    expect(pick('up', 'workspace-list', rectOf('workspace-list'))).toBeNull()
    expect(pick('down', 'workspace-list', rectOf('workspace-list'))).toBeNull()
  })

  it('文件列表：向左回工作区列表，向上回映射目录', () => {
    expect(pick('left', 'workspace-files', rectOf('workspace-files'))).toBe('workspace-list')
    expect(pick('up', 'workspace-files', rectOf('workspace-files'))).toBe('workspace-directories')
    expect(pick('down', 'workspace-files', rectOf('workspace-files'))).toBeNull()
    // 文件列表本身就在最右边，按 → 不该绕回左边的列表
    expect(pick('right', 'workspace-files', rectOf('workspace-files'))).toBeNull()
  })

  it('映射目录：向下进文件列表，向右没有板块', () => {
    expect(pick('down', 'workspace-directories', rectOf('workspace-directories'))).toBe('workspace-files')
    expect(pick('right', 'workspace-directories', rectOf('workspace-directories'))).toBeNull()
    expect(pick('up', 'workspace-directories', rectOf('workspace-directories'))).toBeNull()
    expect(pick('left', 'workspace-directories', rectOf('workspace-directories'))).toBe('workspace-list')
  })

  it('只有一个板块时不会自己跳到自己，也没有别的板块可去', () => {
    const desktop: PanelTarget[] = [
      { id: 'desktop-files', rect: { left: 220, top: 91, width: 980, height: 566 } }
    ]
    expect(pickPanel('left', 'desktop-files', desktop[0].rect, desktop)).toBeNull()
    expect(pickPanel('up', 'desktop-files', desktop[0].rect, desktop)).toBeNull()
    expect(pickPanel('down', 'desktop-files', desktop[0].rect, desktop)).toBeNull()
    expect(pickPanel('right', 'desktop-files', desktop[0].rect, desktop)).toBeNull()
  })

  it('起点板块先按主方向距离选，距离相同再按垂直偏移', () => {
    const targets: PanelTarget[] = [
      { id: 'a', rect: { left: 200, top: 0, width: 200, height: 200 } },
      { id: 'b', rect: { left: 500, top: 300, width: 200, height: 200 } }
    ]
    const from = { left: 0, top: 0, width: 200, height: 600 }
    // 两个板块都在右侧，远的那个垂直偏移更大，选近的
    expect(pickPanel('right', null, from, targets)).toBe('a')
  })
})
