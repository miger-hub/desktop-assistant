<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch, type Component } from 'vue'
import AppDialog from './components/AppDialog.vue'
import AppSidebar from './components/AppSidebar.vue'
import GlobalSearchDialog from './components/GlobalSearchDialog.vue'
import TitleBar from './components/TitleBar.vue'
import ToastStack from './components/ToastStack.vue'
import { uiScaleFactor, useSettings } from './stores/settings'
import { useNotes } from './stores/notes'
import { useTools } from './stores/tools'
import { useShortcuts } from './stores/shortcuts'
import { useOperations } from './stores/operations'
import { usePanels } from './stores/panels'
import { useTodos } from './stores/todos'
import { useUi, type ViewName } from './stores/ui'
import { useWorkspaces } from './stores/workspaces'
import { matchesAccelerator } from './composables/accelerator'
import type { SearchNavigation } from '@shared/types'
import { enterPath } from './composables/navigation'
import { t } from './i18n'
import DesktopView from './views/Desktop.vue'
import HomeView from './views/Home.vue'
import ClipboardView from './views/Clipboard.vue'
import NotesView from './views/Notes.vue'
import RulesView from './views/Rules.vue'
import ToolsView from './views/Tools.vue'
import SettingsView from './views/Settings.vue'
import TodoView from './views/Todo.vue'
import WorkspaceView from './views/Workspace.vue'
import type { PanelDirection } from './composables/panels'
import { SETTINGS_ACCELERATOR, zoomActionForKey } from '@shared/accelerator'

const ui = useUi()
const settings = useSettings()
const workspaces = useWorkspaces()
const panels = usePanels()
const operations = useOperations()
const shortcuts = useShortcuts()
const todos = useTodos()
const notes = useNotes()
const tools = useTools()
/**
 * 当前这页是不是「独立搜索窗口」。
 * 同一份渲染进程产物在两个窗口里跑：主界面从 index.html 进入，
 * 搜索窗口加载 index.html#search —— 后者只渲染搜索弹框。
 */
const searchOnly = window.location.hash === '#search'
/** 托盘 / 全局快捷键呼出搜索的订阅（卸载时取消） */
let unsubscribeOpenSearch: (() => void) | null = null
/** 托盘菜单「设置…」的订阅（卸载时取消） */
let unsubscribeOpenSettings: (() => void) | null = null
/** 「搜索结果要求跳转」的订阅（只有主窗口需要） */
let unsubscribeNavigate: (() => void) | null = null
/** 「设置变了」的订阅（独立搜索窗口靠它跟随主题 / 缩放） */
let unsubscribeSettings: (() => void) | null = null
/** 全局搜索打开链接后，刷新首页常用链接的最近使用排序 */
let unsubscribeNoteLinkUsed: (() => void) | null = null

const views: Record<ViewName, Component> = {
  home: HomeView,
  workspace: WorkspaceView,
  desktop: DesktopView,
  todo: TodoView,
  notes: NotesView,
  clipboard: ClipboardView,
  rules: RulesView,
  tools: ToolsView,
  settings: SettingsView
}

/** 数字 1~8 只对应菜单页；设置使用独立的 Ctrl/Cmd + , */
const numberedViews: ViewName[] = ['home', 'workspace', 'desktop', 'todo', 'notes', 'clipboard', 'rules', 'tools']
const currentView = computed(() => views[ui.state.view])

/** Ctrl/Cmd + 方向键在板块之间跳转（工作区：列表 / 映射目录 / 文件列表） */
const panelDirections: Record<string, PanelDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

function onKeydown(event: KeyboardEvent): void {
  // 已经被更具体的处理消费掉（文件列表的方向键等），这里不要再动
  if (event.defaultPrevented) return

  if (event.ctrlKey || event.metaKey) {
    // 设置里配置的两个全局快捷键：和全局快捷键同样的动作。
    // 全局快捷键在 Wayland 或按键被占用时可能注册不上，这里是应用内兜底。
    const shortcuts = settings.state.settings
    if (shortcuts && matchesAccelerator(event, shortcuts.toggleShortcut)) {
      event.preventDefault()
      void toggleWindow()
      return
    }
    if (shortcuts && matchesAccelerator(event, shortcuts.searchShortcut)) {
      event.preventDefault()
      void openSearch()
      return
    }

    if (matchesAccelerator(event, SETTINGS_ACCELERATOR)) {
      event.preventDefault()
      ui.setView('settings')
      return
    }

    const zoomAction = zoomActionForKey(event.key, event.code)
    if (zoomAction) {
      event.preventDefault()
      if (zoomAction === 'reset') {
        void window.desktop.window.setZoom(uiScaleFactor(settings.state.settings?.uiScale))
      } else {
        void window.desktop.window.zoomBy(zoomAction === 'in' ? 0.1 : -0.1)
      }
      return
    }

    const index = Number(event.key)
    if (index >= 1 && index <= numberedViews.length) {
      event.preventDefault()
      ui.setView(numberedViews[index - 1])
      return
    }
    if (event.key.toLowerCase() === 'k') {
      event.preventDefault()
      void openSearch()
      return
    }

    // Ctrl/Cmd + Z：撤销最近一次文件操作（输入框里保留原生的文本撤销）
    if (event.key.toLowerCase() === 'z' && !isEditing(event) && !ui.state.dialog && !ui.state.globalSearch) {
      event.preventDefault()
      void undoLast()
      return
    }

    const direction = panelDirections[event.key]
    if (direction && !isEditing(event) && !ui.state.dialog && !ui.state.globalSearch && panels.move(direction)) {
      event.preventDefault()
    }
  }
}

async function toggleWindow(): Promise<void> {
  try {
    const result = await window.desktop.window.toggle()
    // 没有唤回方式时主进程会拒绝隐藏，把原因告诉用户（窗口还在，提示看得见）
    if (result && !result.hidden && result.reason) ui.toast(result.reason, 'info')
  } catch (error) {
    ui.handleError(error, t('app.toggleWindowFailed'))
  }
}

/**
 * 呼出搜索：交给主进程决定去哪儿。
 * 默认只用独立搜索窗口（不动主界面）；设置里选了「搜索显示在主界面里」就打开主界面里的弹框。
 */
async function openSearch(): Promise<void> {
  try {
    await window.desktop.system.showSearch()
  } catch (error) {
    ui.handleError(error, t('app.openSearchFailed'))
  }
}

/** 独立搜索窗口点了结果：主进程把跳转要求发回来，这里在主界面里执行 */
async function applySearchNavigation(target: SearchNavigation): Promise<void> {
  if (target.kind === 'tool') {
    if (target.toolId) await tools.open(target.toolId)
    ui.setView('tools')
    return
  }

  if (target.kind === 'path' && target.path) {
    // 进入并高亮对应条目；找不到归属（不在任何工作区 / 桌面下）就退回文件管理器
    const entered = await enterPath(target.path, {
      kind: target.pathKind,
      workspaceId: target.workspaceId,
      directoryId: target.directoryId
    })
    if (!entered) {
      try {
        await window.desktop.files.reveal(target.path)
      } catch (error) {
        ui.handleError(error, t('error.openContaining'))
      }
    }
    return
  }

  if (target.kind === 'desktop') {
    ui.setView('desktop')
    return
  }

  if (target.kind === 'workspace') {
    if (target.workspaceId != null) workspaces.focusWorkspace(target.workspaceId)
    ui.setView('workspace')
    return
  }

  if (target.kind === 'directory') {
    if (target.workspaceId != null) workspaces.focusWorkspace(target.workspaceId)
    if (target.directoryId != null) workspaces.focusDirectory(target.directoryId)
    ui.setView('workspace')
    return
  }

  if (target.kind === 'todo') {
    todos.state.filter.keyword = target.keyword ?? ''
    await todos.load()
    ui.setView('todo')
    return
  }

  if (target.noteId != null) notes.focus(target.noteId)
  ui.setView('notes')
}

/**
 * 启动时检查全局快捷键：被别的程序占用（或桌面环境不支持）时提示一次，
 * 否则用户只会觉得「按了没反应」。Electron 分不清是哪种情况，所以让用户自己判断怎么配置。
 */
async function checkGlobalShortcutConflicts(): Promise<void> {
  try {
    const info = await window.desktop.system.info()
    const { enabled, entries } = info.globalShortcuts
    if (!enabled) return

    const conflicts = entries.filter((entry) => !entry.registered)
    if (conflicts.length === 0) return

    const detail = conflicts
      .map((entry) => `· ${entry.keys}（${entry.action}）：${entry.reason}`)
      .join('\n')
    const openSettings = await ui.confirm({
      title: t('app.shortcutConflictTitle'),
      message: t('app.shortcutConflictMessage', { detail }),
      confirmText: t('app.openSettings'),
      cancelText: t('app.gotIt')
    })
    if (openSettings) ui.setView('settings')
  } catch {
    // 检查失败不影响使用
  }
}

/** 输入框里的 Ctrl/Cmd 组合键是文本编辑，不要抢 */
function isEditing(event: KeyboardEvent): boolean {
  return (
    event.target instanceof HTMLElement &&
    (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
  )
}

async function undoLast(): Promise<void> {
  const result = await operations.undoLast()
  if (result) operations.report(result)
}

onMounted(async () => {
  await settings.load()

  if (searchOnly) {
    // 独立搜索窗口：只渲染搜索弹框，启动就把弹框打开；关掉弹框就收起整个窗口
    document.body.classList.add('search-window')
    await workspaces.load()
    window.addEventListener('keydown', onKeydown)
    unsubscribeOpenSearch = window.desktop.system.onOpenSearch(() => ui.openGlobalSearch())
    // 主界面改了主题 / 界面大小：搜索窗口跟着走（它没有自己的设置界面）
    unsubscribeSettings = window.desktop.system.onSettingsChanged(() => void settings.load())
    watch(
      () => ui.state.globalSearch,
      (open) => {
        if (!open) void window.desktop.system.hideSearch().catch(() => undefined)
      }
    )
    ui.openGlobalSearch()
    return
  }

  await workspaces.load()
  await shortcuts.load()
  window.addEventListener('keydown', onKeydown)
  // 托盘 / 全局快捷键 / 主界面里的快捷键要求呼出搜索（默认是独立搜索窗口）
  unsubscribeOpenSearch = window.desktop.system.onOpenSearch(() => ui.openGlobalSearch())
  unsubscribeSettings = window.desktop.system.onSettingsChanged(() => void settings.load())
  unsubscribeNoteLinkUsed = window.desktop.note.onLinkUsed(() => void notes.load())
  // 独立搜索窗口点了需要主界面配合的结果
  unsubscribeNavigate = window.desktop.system.onNavigate((target) => void applySearchNavigation(target))
  // 托盘菜单「设置…」：直接跳到设置页
  unsubscribeOpenSettings = window.desktop.system.onOpenSettings(() => ui.setView('settings'))
  void checkGlobalShortcutConflicts()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  unsubscribeOpenSearch?.()
  unsubscribeOpenSettings?.()
  unsubscribeNavigate?.()
  unsubscribeSettings?.()
  unsubscribeNoteLinkUsed?.()
})
</script>

<template>
  <v-app>
    <!-- 独立搜索窗口：只有搜索弹框，没有标题栏 / 侧边栏 / 页面 -->
    <template v-if="searchOnly">
      <GlobalSearchDialog />
      <ToastStack />
    </template>

    <template v-else>
    <TitleBar />
    <div class="app-body">
      <AppSidebar />
      <component :is="currentView" />
    </div>
    <AppDialog />
    <GlobalSearchDialog />
    <ToastStack />
    </template>
  </v-app>
</template>
