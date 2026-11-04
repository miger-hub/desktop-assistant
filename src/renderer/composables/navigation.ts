import { nextTick } from 'vue'
import { normalizePath, ownerOfPath } from './location'
import { usePanels } from '../stores/panels'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'

export type EnterTargetKind = 'file' | 'directory'

/** 各视图里文件列表 / 映射目录板块的 id（focusPanelSoon / 聚焦时用） */
export const PANEL = {
  workspaceList: 'workspace-list',
  workspaceDirectories: 'workspace-directories',
  workspaceFiles: 'workspace-files',
  desktopFiles: 'desktop-files'
} as const

export interface EnterPathOptions {
  kind?: EnterTargetKind
  /**
   * 已知的归属（搜索文件结果里带着的）。
   * 同一个目录映射到多个工作区时，按路径推断会有歧义，这时以它为准。
   */
  workspaceId?: number | null
  directoryId?: number | null
}

/**
 * 聚焦到某个板块。视图切换 / 板块刚挂载时元素可能还没渲染好，
 * 交给 panels.focusWhenReady 重试，直到真正拿到元素并把 DOM 焦点交过去。
 */
export function focusPanelSoon(id: string): void {
  usePanels().focusWhenReady(id)
}

/**
 * 进入某个路径所在的位置并聚焦：
 * - 工作区下的文件：切到工作区、选中映射目录，并把文件在文件列表里高亮出来
 * - 工作区下的映射目录本身：选中该目录并聚焦「映射目录」板块
 * - 桌面下的路径：切到桌面并把条目在文件列表里高亮出来
 *
 * 找不到归属时返回 false，调用方可以退回到「在系统文件管理器里打开」。
 */
export async function enterPath(target: string, options: EnterPathOptions = {}): Promise<boolean> {
  const ui = useUi()
  const settings = useSettings()
  const workspaces = useWorkspaces()

  let workspaceId = options.workspaceId
  let directoryId = options.directoryId

  // 没带归属信息时按路径推断（快捷入口、最近打开）
  if (workspaceId === undefined) {
    const owner = ownerOfPath(target, {
      desktop: settings.state.paths?.desktop,
      workspaces: workspaces.state.items
    })
    if (owner === null) return false
    if (owner === 'desktop') {
      workspaceId = null
    } else {
      workspaceId = owner.workspaceId
      directoryId = owner.directoryId
    }
  }

  // 桌面：文件 / 目录都是桌面的直接子项，切过去再高亮
  if (workspaceId === null) {
    ui.setView('desktop')
    await nextTick()
    focusPanelSoon(PANEL.desktopFiles)
    ui.requestReveal(target)
    return true
  }

  workspaces.focusWorkspace(workspaceId)
  if (directoryId != null) workspaces.focusDirectory(directoryId)
  ui.setView('workspace')
  await nextTick()

  /*
   * 目标正好是映射目录本身时，聚焦「映射目录」板块（卡片高亮）；
   * 目标只是映射目录里的子目录 / 文件时，聚焦文件列表并高亮该条目——
   * 置顶的往往是子目录，焦点应该落在文件列表里而不是映射目录卡片上。
   */
  const mapped = workspaces.state.items
    .find((workspace) => workspace.id === workspaceId)
    ?.directories.find((directory) => directory.id === directoryId)
  const isMappingRoot = mapped != null && normalizePath(mapped.path) === normalizePath(target)

  if (options.kind === 'directory' && isMappingRoot) {
    focusPanelSoon(PANEL.workspaceDirectories)
  } else {
    focusPanelSoon(PANEL.workspaceFiles)
    ui.requestReveal(target)
  }
  return true
}
