<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { WorkspaceDetail } from '@shared/types'
import FileBrowser from '../components/FileBrowser.vue'
import { moveItem } from '../composables/reorder'
import { t } from '../i18n'
import { usePanel, usePanels } from '../stores/panels'
import { useShortcuts } from '../stores/shortcuts'
import { useUi } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'

const ui = useUi()
const shortcuts = useShortcuts()
const { state, current, load, create, rename, remove, reorder, addDirectory, removeDirectory } = useWorkspaces()

/** Ctrl/Cmd + 方向键在这些板块之间跳转（文件列表面板由 FileBrowser 注册） */
const panels = usePanels()
const FILE_PANEL = 'workspace-files'
const workspacePanelEl = ref<HTMLElement | null>(null)
const directoriesPanelEl = ref<HTMLElement | null>(null)
const { active: workspacePanelActive, activate: activateWorkspacePanel } = usePanel(
  'workspace-list',
  workspacePanelEl
)
const { active: directoriesPanelActive, activate: activateDirectoriesPanel } = usePanel(
  'workspace-directories',
  directoriesPanelEl
)

const selectedDirectoryId = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
/** 拖拽落点：0 ~ items.length，表示插入到第几个工作区之前 */
const dropIndex = ref<number | null>(null)

/**
 * 选中的映射目录：没选过、或选中的目录已被移除时，回退到第一个目录。
 * 用计算属性而不是 watch，保证带着已加载数据重新进入本页时也有默认选中项。
 */
const activeDirectoryId = computed(() => {
  const workspace = current.value
  if (!workspace) return null
  const stillExists = workspace.directories.some((directory) => directory.id === selectedDirectoryId.value)
  return stillExists ? selectedDirectoryId.value : workspace.directories[0]?.id ?? null
})

const selectedDirectory = computed(
  () => current.value?.directories.find((directory) => directory.id === activeDirectoryId.value) ?? null
)

// 从搜索结果跳转过来时，定位到对应目录
watch(
  () => state.focusDirectoryId,
  async (id) => {
    if (id === null) return
    selectedDirectoryId.value = id
    state.focusDirectoryId = null
    await nextTick()
    document.querySelector(`[data-directory-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true }
)

function select(workspace: WorkspaceDetail): void {
  state.currentId = workspace.id
  activateWorkspacePanel()
}

/** 点击映射目录卡片：选中该目录，并把键盘焦点标记到目录板块 */
function selectDirectory(directoryId: number): void {
  selectedDirectoryId.value = directoryId
  activateDirectoriesPanel()
}

/** 工作区列表面板：方向键在工作区之间移动选择，→ / 回车跳到文件列表 */
function onWorkspaceKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey) return

  const items = state.items
  if (items.length === 0) return

  const index = items.findIndex((workspace) => workspace.id === state.currentId)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    select(items[Math.min(index + 1, items.length - 1)])
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    select(items[Math.max(index - 1, 0)])
  } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    panels.focus(FILE_PANEL)
  }
}

/** 映射目录面板：方向键切换目录，回车跳到文件列表 */
function onDirectoriesKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey) return

  const directories = current.value?.directories ?? []
  if (directories.length === 0) return

  if (event.key === 'Enter') {
    event.preventDefault()
    panels.focus(FILE_PANEL)
    return
  }

  const step =
    event.key === 'ArrowDown' || event.key === 'ArrowRight'
      ? 1
      : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? -1
        : 0
  if (step === 0) return

  event.preventDefault()
  const index = directories.findIndex((directory) => directory.id === activeDirectoryId.value)
  const next = directories[Math.min(Math.max(index + step, 0), directories.length - 1)]
  if (next) {
    selectedDirectoryId.value = next.id
    activateDirectoriesPanel()
  }
}

function onDragStart(index: number, event: DragEvent): void {
  dragIndex.value = index
  dropIndex.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function resetDrag(): void {
  dragIndex.value = null
  dropIndex.value = null
}

/**
 * 按指针位置算插入点，而不是要求精确落在某一行上：
 * 拖到两个工作区之间、列表下方的空白处都能排序。
 */
function dropSlotAt(container: EventTarget | null, clientY: number): number {
  const element = container as HTMLElement | null
  const rows = element ? Array.from(element.querySelectorAll<HTMLElement>('.v-list-item')) : []
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) return index
  }
  return rows.length
}

/**
 * 拖拽事件挂在落点区域上，列表里各行的事件冒泡上来。
 * 只有在 dragover 里 preventDefault，浏览器才会允许在这里放置。
 */
function onListDragOver(event: DragEvent): void {
  if (dragIndex.value === null) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropIndex.value = dropSlotAt(event.currentTarget, event.clientY)
}

/** 拖拽结束后一次性提交完整顺序，由主进程在事务里重排 sort_order */
async function onListDrop(event: DragEvent): Promise<void> {
  const from = dragIndex.value
  const slot = dropIndex.value
  resetDrag()
  if (from === null || slot === null) return
  event.preventDefault()

  const ids = state.items.map((workspace) => workspace.id)
  const next = moveItem(ids, from, slot)
  // 落点没变就不要再打一次 IPC
  if (next.every((id, index) => id === ids[index])) return

  await reorder(next)
}

async function createWorkspace(): Promise<void> {
  const name = await ui.promptInput({
    title: t('workspace.create'),
    label: t('workspace.nameLabel'),
    placeholder: t('workspace.namePlaceholder')
  })
  if (!name) return
  const workspace = await create(name)
  if (workspace) ui.toast(t('workspace.created', { name: workspace.name }), 'success')
}

/** 把当前工作区置顶到快捷入口 */
async function pinWorkspace(): Promise<void> {
  const workspace = current.value
  if (!workspace) return
  const ok = await shortcuts.add({ kind: 'workspace', workspaceId: workspace.id, label: workspace.name })
  if (ok) ui.toast(t('toast.pinned'), 'success')
}

async function renameWorkspace(): Promise<void> {
  if (!current.value) return
  const name = await ui.promptInput({
    title: t('workspace.rename'),
    label: t('workspace.nameLabel'),
    value: current.value.name
  })
  if (!name || name === current.value.name) return
  const ok = await rename(current.value.id, name)
  if (ok) ui.toast(t('workspace.renamed'), 'success')
}

async function removeWorkspace(): Promise<void> {
  const workspace = current.value
  if (!workspace) return
  const confirmed = await ui.confirm({
    title: t('workspace.removeTitle', { name: workspace.name }),
    message: t('workspace.removeMessage'),
    confirmText: t('common.delete'),
    danger: true
  })
  if (!confirmed) return
  const ok = await remove(workspace.id)
  if (ok) ui.toast(t('workspace.removed'), 'success')
}

async function addMappedDirectory(): Promise<void> {
  const workspace = current.value
  if (!workspace) return
  try {
    const directory = await window.desktop.files.pickDirectory({ title: t('workspace.pickDirectoryTitle') })
    if (!directory) return
    // store 内部已经 load 并处理错误，这里不再重复加载、也不在失败时提示成功
    const ok = await addDirectory(workspace.id, directory)
    if (ok) ui.toast(t('workspace.mapped'), 'success')
  } catch (error) {
    ui.handleError(error, t('error.addDirectory'))
  }
}

async function removeMappedDirectory(mappingId: number, name: string): Promise<void> {
  const confirmed = await ui.confirm({
    title: t('workspace.removeDirectoryTitle', { name }),
    message: t('workspace.removeDirectoryMessage'),
    confirmText: t('common.remove'),
    danger: true
  })
  if (!confirmed) return
  const ok = await removeDirectory(mappingId)
  if (ok) ui.toast(t('workspace.directoryRemoved'), 'success')
}

async function openDirectory(path: string): Promise<void> {
  try {
    await window.desktop.files.open(path)
  } catch (error) {
    ui.handleError(error, t('workspace.openDirectoryFailed'))
  }
}
</script>

<template>
  <div class="layout-split">
    <!-- tabindex=-1：Ctrl/Cmd + 方向键切过来的板块要能接住方向键 -->
    <aside
      ref="workspacePanelEl"
      class="panel"
      :class="{ 'is-focused': workspacePanelActive }"
      tabindex="-1"
      @keydown="onWorkspaceKeydown"
    >
      <div class="row row--between" style="padding: 4px 6px 10px">
        <span class="muted">{{ t('workspace.listLabel') }}</span>
        <v-btn size="small" variant="tonal" @click="createWorkspace">{{ t('common.create') }}</v-btn>
      </div>

      <v-progress-linear v-if="state.loading && state.items.length === 0" indeterminate color="primary" />

      <!-- 落点区域铺满整个面板：拖到列表下方的空白处也能把项目排到最后 -->
      <div
        v-if="state.items.length > 0"
        class="workspace-dropzone"
        @dragover="onListDragOver"
        @drop="onListDrop"
      >
        <v-list class="workspace-list" density="compact" nav>
          <v-list-item
            v-for="(workspace, index) in state.items"
            :key="workspace.id"
            :active="workspace.id === state.currentId"
            :class="{
              'is-dragging': dragIndex === index,
              'is-drop-before': dropIndex === index,
              'is-drop-after': dropIndex === state.items.length && index === state.items.length - 1
            }"
            :title="workspace.name"
            color="primary"
            draggable="true"
            rounded="lg"
            @click="select(workspace)"
            @dragstart="onDragStart(index, $event)"
            @dragend="resetDrag"
          >
            <template #append>
              <div class="row" style="gap: 4px">
                <span class="muted mono">{{ workspace.directories.length }}</span>
                <v-icon icon="mdi-drag-vertical" size="16" class="workspace-list__handle" />
              </div>
            </template>
          </v-list-item>
        </v-list>
      </div>

      <p v-else-if="!state.loading" class="muted" style="padding: 10px">{{ t('workspace.empty') }}</p>
    </aside>

    <section class="view">
      <div class="view__header">
        <div class="view__title">
          <span>{{ current?.name ?? t('workspace.noneSelected') }}</span>
          <span v-if="current" class="muted mono">
            {{ t('workspace.directoryCount', { count: current.directories.length }) }}
          </span>
        </div>
        <div class="row">
          <v-btn size="small" variant="tonal" :disabled="!current" @click="addMappedDirectory">
            {{ t('workspace.mapDirectory') }}
          </v-btn>
          <v-btn
            size="small"
            variant="text"
            prepend-icon="mdi-pin-outline"
            :disabled="!current || shortcuts.hasWorkspace(current.id)"
            :title="
              current && shortcuts.hasWorkspace(current.id) ? t('workspace.pinAlready') : t('workspace.pinToSidebar')
            "
            @click="pinWorkspace"
          >
            {{ t('workspace.pin') }}
          </v-btn>
          <v-btn size="small" variant="text" :disabled="!current" @click="renameWorkspace">
            {{ t('common.rename') }}
          </v-btn>
          <v-btn size="small" variant="text" color="error" :disabled="!current" @click="removeWorkspace">
            {{ t('common.delete') }}
          </v-btn>
          <v-btn size="small" variant="text" prepend-icon="mdi-refresh" @click="load">{{ t('common.refresh') }}</v-btn>
        </div>
      </div>

      <div v-if="!current" class="view__body">
        <v-empty-state
          icon="mdi-folder-multiple-outline"
          :title="t('workspace.createFirstTitle')"
          :text="t('workspace.createFirstText')"
        />
      </div>

      <template v-else>
        <div
          ref="directoriesPanelEl"
          class="workspace__directories"
          :class="{ 'is-focused': directoriesPanelActive }"
          tabindex="-1"
          @keydown="onDirectoriesKeydown"
        >
          <div class="row" style="flex-wrap: wrap">
            <v-card
              v-for="directory in current.directories"
              :key="directory.id"
              :data-directory-id="directory.id"
              class="workspace__directory"
              :class="{ 'is-active': directory.id === activeDirectoryId }"
              @click="selectDirectory(directory.id)"
            >
              <v-card-text>
                <div class="row row--between">
                  <strong class="truncate">{{ directory.name }}</strong>
                  <v-chip v-if="!directory.exists" size="small" color="error" variant="tonal">
                    {{ t('common.missing') }}
                  </v-chip>
                </div>
                <div class="muted mono truncate" :title="directory.path">{{ directory.path }}</div>
                <div class="row" style="margin-top: 8px">
                  <v-btn size="small" variant="text" @click.stop="openDirectory(directory.path)">
                    {{ t('common.open') }}
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="text"
                    color="error"
                    @click.stop="removeMappedDirectory(directory.id, directory.name)"
                  >
                    {{ t('common.remove') }}
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
            <p v-if="current.directories.length === 0" class="muted">
              {{ t('workspace.emptyDirectories') }}
            </p>
          </div>
        </div>

        <div class="workspace__browser">
          <FileBrowser
            v-if="selectedDirectory && selectedDirectory.exists"
            :key="selectedDirectory.path"
            :root-path="selectedDirectory.path"
            :panel-id="FILE_PANEL"
            :empty-hint="t('workspace.fileEmptyHint')"
          />
          <v-empty-state
            v-else-if="selectedDirectory"
            icon="mdi-alert-circle-outline"
            :title="t('workspace.missingDirectory')"
            :text="selectedDirectory.path"
          />
          <v-empty-state
            v-else
            icon="mdi-folder-open-outline"
            :title="t('workspace.chooseDirectory')"
          />
        </div>
      </template>
    </section>
  </div>
</template>
