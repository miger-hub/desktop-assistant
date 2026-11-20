<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Shortcut } from '@shared/types'
import { SETTINGS_ACCELERATOR } from '@shared/accelerator'
import { enterPath, focusPanelSoon, PANEL } from '../composables/navigation'
import { t } from '../i18n'
import { usePanel, usePanels } from '../stores/panels'
import { useShortcuts } from '../stores/shortcuts'
import { useUi, type ViewName } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'

const ui = useUi()
const shortcuts = useShortcuts()
const workspaces = useWorkspaces()
const panels = usePanels()

/**
 * 把侧边栏注册成一个板块：Ctrl/Cmd + 方向键可以聚焦过来（尤其从工作区 / 桌面的
 * 文件列表按 Ctrl/Cmd + ← 一路回到这里）。
 */
const sidebarEl = ref<HTMLElement | null>(null)
const { active: sidebarActive } = usePanel('sidebar', sidebarEl)

const isMac = navigator.userAgent.includes('Mac')

/** 修饰键按平台显示，避免在 Windows 上提示 ⌘ */
function shortcutLabel(key: string): string {
  return isMac ? `⌘ ${key}` : `Ctrl ${key}`
}

function settingsShortcutLabel(): string {
  return shortcutLabel(SETTINGS_ACCELERATOR.split('+').pop() ?? ',')
}

interface SidebarEntry {
  view: ViewName
  /** 文案 key，模板里用 t() 取，语言切换后能跟着变 */
  labelKey: string
  icon: string
  shortcut: string
}

/** 主菜单：Ctrl/Cmd + 1~8；设置单独使用 Ctrl/Cmd + , */
const entries: SidebarEntry[] = [
  { view: 'home', labelKey: 'nav.home', icon: 'mdi-home-variant-outline', shortcut: '1' },
  { view: 'workspace', labelKey: 'nav.workspace', icon: 'mdi-folder-multiple-outline', shortcut: '2' },
  { view: 'desktop', labelKey: 'nav.desktop', icon: 'mdi-monitor', shortcut: '3' },
  { view: 'todo', labelKey: 'nav.todo', icon: 'mdi-check-circle-outline', shortcut: '4' },
  { view: 'notes', labelKey: 'nav.notes', icon: 'mdi-note-text-outline', shortcut: '5' },
  { view: 'clipboard', labelKey: 'nav.clipboard', icon: 'mdi-content-paste', shortcut: '6' },
  { view: 'rules', labelKey: 'nav.rules', icon: 'mdi-auto-fix', shortcut: '7' },
  { view: 'tools', labelKey: 'nav.tools', icon: 'mdi-toolbox-outline', shortcut: '8' }
]

/** 设置单独放在左下角，和主菜单分开 */
const settingsEntry: SidebarEntry = {
  view: 'settings',
  labelKey: 'nav.settings',
  icon: 'mdi-cog-outline',
  shortcut: ''
}

/**
 * 键盘上下选择的可选项，按屏幕顺序排列：主菜单 → 快捷入口 → 设置。
 * 按键逻辑和全局搜索一致：↑↓ 选择、回车激活，循环走到底。
 */
interface NavItem {
  key: string
  kind: 'view' | 'shortcut'
  view?: ViewName
  shortcut?: Shortcut
}

const navItems = computed<NavItem[]>(() => [
  ...entries.map((entry) => ({ key: `view-${entry.view}`, kind: 'view' as const, view: entry.view })),
  ...shortcuts.state.items.map((item) => ({
    key: `shortcut-${item.id}`,
    kind: 'shortcut' as const,
    shortcut: item
  })),
  { key: `view-${settingsEntry.view}`, kind: 'view' as const, view: settingsEntry.view }
])

/** 当前键盘高亮在 navItems 里的下标；-1 表示没有高亮 */
const navIndex = ref(-1)
const selectedKey = computed(() => (navIndex.value >= 0 ? navItems.value[navIndex.value]?.key ?? null : null))

function isViewCursor(view: ViewName): boolean {
  return selectedKey.value === `view-${view}`
}

function isShortcutCursor(id: number): boolean {
  return selectedKey.value === `shortcut-${id}`
}

/** 当前键盘高亮的是不是某个快捷入口 */
const selectedShortcut = computed<Shortcut | null>(() => {
  const item = navIndex.value >= 0 ? navItems.value[navIndex.value] : undefined
  return item?.kind === 'shortcut' ? item.shortcut ?? null : null
})

function shortcutIcon(shortcut: Shortcut): string {
  if (shortcut.kind === 'workspace') return 'mdi-folder-multiple-outline'
  return shortcut.kind === 'directory' ? 'mdi-folder-outline' : 'mdi-file-outline'
}

/**
 * 点击快捷入口：工作区和已映射的目录在应用内跳转，
 * 其它文件 / 目录交给系统默认程序打开。
 */
async function openShortcut(shortcut: Shortcut): Promise<void> {
  try {
    if (shortcut.kind === 'workspace' && shortcut.workspaceId !== null) {
      workspaces.focusWorkspace(shortcut.workspaceId)
      ui.setView('workspace')
      return
    }
    if (shortcut.path === null) return

    if (shortcut.kind === 'directory') {
      const mapped = workspaces.allDirectories.value.find((entry) => entry.directory.path === shortcut.path)
      if (mapped) {
        workspaces.focusWorkspace(mapped.workspace.id)
        workspaces.focusDirectory(mapped.directory.id)
        ui.setView('workspace')
        return
      }
    }
    await window.desktop.files.open(shortcut.path)
  } catch (error) {
    ui.handleError(error, t('sidebar.openFailed'))
  }
}

/** 在系统文件管理器里打开快捷入口的路径（目录直接打开，文件定位到所在目录） */
async function openShortcutInSystem(shortcut: Shortcut): Promise<void> {
  if (!shortcut.path) return
  try {
    if (shortcut.kind === 'directory') await window.desktop.files.open(shortcut.path)
    else await window.desktop.files.reveal(shortcut.path)
  } catch (error) {
    ui.handleError(error, t('error.openContaining'))
  }
}

/**
 * ←：进入快捷入口对应的位置并聚焦。
 * 工作区快捷入口没有路径，直接切到该工作区并聚焦工作区列表；文件 / 目录走统一的进入逻辑。
 */
async function enterShortcut(shortcut: Shortcut): Promise<void> {
  if (shortcut.kind === 'workspace') {
    if (shortcut.workspaceId === null) return
    workspaces.focusWorkspace(shortcut.workspaceId)
    ui.setView('workspace')
    await nextTick()
    focusPanelSoon(PANEL.workspaceList)
    return
  }

  if (!shortcut.path) return
  const entered = await enterPath(shortcut.path, {
    kind: shortcut.kind === 'directory' ? 'directory' : 'file'
  })
  // 不在任何工作区 / 桌面下（比如临时目录）：退回到文件管理器
  if (!entered) await openShortcutInSystem(shortcut)
}

/** 聚焦侧边栏时，把高亮落在当前页面对应的菜单项上 */
watch(sidebarActive, (active) => {
  if (!active) {
    navIndex.value = -1
    return
  }
  navIndex.value = navItems.value.findIndex((item) => item.kind === 'view' && item.view === ui.state.view)
})

/** 聚焦侧边栏时又用别的方式换了页面（Ctrl/Cmd + 数字等）：把高亮跟着挪过去 */
watch(
  () => ui.state.view,
  (view) => {
    if (!sidebarActive.value) return
    navIndex.value = navItems.value.findIndex((item) => item.kind === 'view' && item.view === view)
  }
)

/**
 * ↑↓：在菜单 / 快捷入口之间移动高亮，循环并滚动到可见区域。
 * 菜单项移动到位就直接激活（切换页面）；快捷入口只高亮，等回车触发。
 */
async function moveSelection(step: number): Promise<void> {
  const length = navItems.value.length
  if (length === 0) return

  const current = navIndex.value
  navIndex.value = current < 0 ? (step > 0 ? 0 : length - 1) : (current + step + length) % length

  const item = navItems.value[navIndex.value]
  if (item?.kind === 'view' && item.view) ui.setView(item.view)

  await nextTick()
  sidebarEl.value
    ?.querySelector(`[data-sidebar-index="${navIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

/** 回车：激活高亮项（菜单切页面，快捷入口走打开逻辑）；没有高亮时激活第一项 */
async function activateSelection(): Promise<void> {
  const item = navItems.value[navIndex.value >= 0 ? navIndex.value : 0]
  if (!item) return

  if (item.kind === 'view' && item.view) {
    ui.setView(item.view)
  } else if (item.shortcut) {
    await openShortcut(item.shortcut)
  }
}

/** Esc：离开侧边栏，把方向键交还给内容区 */
function leaveSidebar(): void {
  navIndex.value = -1
  panels.setActive(null)
  sidebarEl.value?.blur()
}

function onKeydown(event: KeyboardEvent): void {
  // Ctrl/Cmd + 方向键是板块间跳转，交给 App.vue 处理
  if (event.ctrlKey || event.metaKey) return

  const target = event.target as HTMLElement | null
  // 输入框 / 按钮（快捷入口的删除按钮）保留原生键盘行为
  if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return

  const shortcut = selectedShortcut.value
  const horizontalShortcut = shortcut !== null && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
  const vertical =
    event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === 'Escape'
  if (!vertical && !horizontalShortcut) return

  // Vuetify 的 v-list 自带 ↑↓ 焦点移动，这里统一由上面的选择逻辑接管，避免两边各动一次
  event.stopPropagation()
  event.preventDefault()

  if (event.key === 'ArrowLeft') {
    void enterShortcut(shortcut!)
  } else if (event.key === 'ArrowRight') {
    void openShortcutInSystem(shortcut!)
  } else if (event.key === 'ArrowDown') {
    void moveSelection(1)
  } else if (event.key === 'ArrowUp') {
    void moveSelection(-1)
  } else if (event.key === 'Enter') {
    void activateSelection()
  } else {
    leaveSidebar()
  }
}
</script>

<template>
  <aside
    ref="sidebarEl"
    class="sidebar"
    :class="{ 'is-focused': sidebarActive }"
    tabindex="-1"
    @keydown.capture="onKeydown"
  >
    <v-list density="compact" nav class="sidebar__list">
      <v-list-item
        v-for="(entry, index) in entries"
        :key="entry.view"
        :data-sidebar-index="index"
        :active="ui.state.view === entry.view"
        :class="{ 'is-cursor': isViewCursor(entry.view) }"
        :prepend-icon="entry.icon"
        :title="t(entry.labelKey)"
        rounded="lg"
        color="primary"
        @click="ui.setView(entry.view)"
      >
        <template #append>
          <span class="sidebar__shortcut">{{ shortcutLabel(entry.shortcut) }}</span>
        </template>
      </v-list-item>
    </v-list>

    <!-- 快捷入口：文件列表 / 工作区里的「置顶」都出现在这里 -->
    <div class="sidebar__section">
      <div class="row row--between sidebar__section-head">
        <span class="muted">{{ t('nav.shortcuts') }}</span>
        <span v-if="shortcuts.state.items.length > 0" class="muted mono">
          {{ shortcuts.state.items.length }}
        </span>
      </div>

      <v-list v-if="shortcuts.state.items.length > 0" density="compact" nav class="sidebar__list">
        <v-list-item
          v-for="(shortcut, index) in shortcuts.state.items"
          :key="shortcut.id"
          :data-sidebar-index="entries.length + index"
          :prepend-icon="shortcutIcon(shortcut)"
          :title="shortcut.exists ? shortcut.label : t('sidebar.missingName', { name: shortcut.label })"
          :class="{ 'is-missing': !shortcut.exists, 'is-cursor': isShortcutCursor(shortcut.id) }"
          rounded="lg"
          @click="openShortcut(shortcut)"
        >
          <template #append>
            <v-btn
              icon="mdi-close"
              size="x-small"
              variant="text"
              :title="t('sidebar.removeTitle')"
              @click.stop="shortcuts.remove(shortcut.id)"
            />
          </template>
        </v-list-item>
      </v-list>

      <p v-else class="muted sidebar__section-empty">{{ t('sidebar.emptyHint') }}</p>
    </div>

    <div class="sidebar__divider" />

    <!-- 设置单独放在左下角，和上面的主菜单分开 -->
    <v-list density="compact" nav class="sidebar__list">
      <v-list-item
        :data-sidebar-index="entries.length + shortcuts.state.items.length"
        :active="ui.state.view === settingsEntry.view"
        :class="{ 'is-cursor': isViewCursor(settingsEntry.view) }"
        :prepend-icon="settingsEntry.icon"
        :title="t(settingsEntry.labelKey)"
        rounded="lg"
        color="primary"
        @click="ui.setView(settingsEntry.view)"
      >
        <template #append>
          <span class="sidebar__shortcut">{{ settingsShortcutLabel() }}</span>
        </template>
      </v-list-item>
    </v-list>
  </aside>
</template>
