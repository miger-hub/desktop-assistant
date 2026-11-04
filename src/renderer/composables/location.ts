import type { WorkspaceDetail } from '@shared/types'

/** 变成正斜杠并去掉结尾的斜杠，方便跨平台做「是否在某目录下」的前缀判断 */
export function normalizePath(target: string): string {
  return target.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function isInsideDirectory(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}/`)
}

export interface PathOwner {
  workspaceId: number
  directoryId: number
}

/**
 * 一个路径归谁：「桌面」返回 'desktop'，映射目录里取匹配最长的工作区 + 目录，
 * 都不匹配时返回 null。前面的桌面先判，桌面本身被映射进工作区时也归桌面。
 */
export function ownerOfPath(
  target: string,
  context: { desktop?: string | null; workspaces: WorkspaceDetail[] }
): PathOwner | 'desktop' | null {
  const normalized = normalizePath(target)
  if (context.desktop && isInsideDirectory(normalizePath(context.desktop), normalized)) return 'desktop'

  let best: (PathOwner & { length: number }) | null = null
  for (const workspace of context.workspaces) {
    for (const directory of workspace.directories) {
      const root = normalizePath(directory.path)
      if (isInsideDirectory(root, normalized) && (!best || root.length > best.length)) {
        best = { workspaceId: workspace.id, directoryId: directory.id, length: root.length }
      }
    }
  }
  return best ? { workspaceId: best.workspaceId, directoryId: best.directoryId } : null
}
