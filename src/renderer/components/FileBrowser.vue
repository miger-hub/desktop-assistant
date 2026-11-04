<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { BulkResult, FileItem, RenameEntry, TransferOptions } from '@shared/types'
import { formatDate, formatSize, iconForFile } from '../composables/format'
import { isInsideDirectory, normalizePath } from '../composables/location'
import { t } from '../i18n'
import { usePanel, usePanels } from '../stores/panels'
import { useSettings } from '../stores/settings'
import { useShortcuts } from '../stores/shortcuts'
import { useUi } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'

const props = defineProps<{
  /** 浏览范围的根目录，不允许再往上走 */
  rootPath: string
  emptyHint?: string
  /** 作为键盘跳转的板块名（Ctrl/Cmd + 方向键） */
  panelId?: string
}>()

/** 单次渲染上限，避免超大目录一次性插入过多 DOM */
const PAGE_SIZE = 300
/** 提示里最多列出几条失败原因 */
const FAILURE_PREVIEW = 3

const ui = useUi()
const settings = useSettings()
const shortcuts = useShortcuts()
const { allDirectories } = useWorkspaces()

const panelId = props.panelId ?? 'files'
const panels = usePanels()
const panelEl = ref<HTMLElement | null>(null)
const { active: panelActive, activate: activatePanel, focus: focusPanel } = usePanel(panelId, panelEl)

/** 焦点在别的板块上时，这些键归那个板块，文件列表不要再抢 */
const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

const currentPath = ref(props.rootPath)
const items = ref<FileItem[]>([])
const loading = ref(false)
const selectedPaths = ref<string[]>([])
const anchorPath = ref<string | null>(null)
const visibleCount = ref(PAGE_SIZE)
const dropTargetPath = ref<string | null>(null)
const breadcrumbs = ref<Array<{ label: string; path: string }>>([])
/** 快速切换目录时用序号丢弃过期响应，避免旧目录的结果覆盖新目录 */
let loadToken = 0
/** 目录变化推送的取消订阅函数 */
let unsubscribeChange: (() => void) | null = null

const moveDialog = reactive({ open: false, sources: [] as string[] })
const renameDialog = reactive({
  open: false,
  base: '',
  start: 1 as number | string,
  keepExtension: true
})

/** Ctrl/Cmd + F：只过滤当前目录，不去动全局搜索 */
const filterOpen = ref(false)
const filterKeyword = ref('')
const filterInput = ref<{ focus: () => void; select?: () => void } | null>(null)

const selectedItems = computed(() => items.value.filter((item) => selectedPaths.value.includes(item.path)))
const canGoUp = computed(() => currentPath.value !== props.rootPath)

/** 只选中一个条目时才能置顶到快捷入口 */
const pinnedCandidate = computed(() => (selectedItems.value.length === 1 ? selectedItems.value[0] : null))
const canPin = computed(() => pinnedCandidate.value !== null && !shortcuts.hasPath(pinnedCandidate.value.path))

const filteredItems = computed(() => {
  const keyword = filterKeyword.value.trim().toLowerCase()
  if (!keyword) return items.value
  return items.value.filter((item) => item.name.toLowerCase().includes(keyword))
})

const visibleItems = computed(() => filteredItems.value.slice(0, visibleCount.value))
const hiddenCount = computed(() => Math.max(0, filteredItems.value.length - visibleItems.value.length))

/** 序号从 1 或用户输入值开始，非法输入回退到 1 */
const startIndex = computed(() => {
  const value = Number(renameDialog.start)
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 1
})

/** 位数按最大序号自动决定：9 项 → 1 位，10 项 → 2 位 */
const indexWidth = computed(() =>
  String(startIndex.value + Math.max(0, selectedItems.value.length - 1)).length
)

interface RenamePreview {
  path: string
  from: string
  name: string
}

function splitExtension(item: FileItem): { base: string; ext: string } {
  if (item.type === 'directory') return { base: item.name, ext: '' }
  const dot = item.name.lastIndexOf('.')
  if (dot <= 0) return { base: item.name, ext: '' }
  return { base: item.name.slice(0, dot), ext: item.name.slice(dot) }
}

const renamePreviews = computed<RenamePreview[]>(() => {
  const base = renameDialog.base.trim()
  const width = indexWidth.value

  return selectedItems.value.map((item, position) => {
    const index = String(startIndex.value + position).padStart(width, '0')
    const { ext } = splitExtension(item)
    return {
      path: item.path,
      from: item.name,
      name: `${base}${index}${renameDialog.keepExtension ? ext : ''}`
    }
  })
})

const renameNameError = computed(() => {
  const base = renameDialog.base.trim()
  if (!base) return t('file.nameRequired')
  if (base === '.' || base === '..') return t('file.nameInvalid')
  if (base.includes('/') || base.includes('\\')) return t('file.nameHasSeparator')
  return ''
})

/** 批次内重名会导致互相覆盖，直接禁止提交 */
const renameDuplicates = computed(() => {
  const seen = new Set<string>()
  let duplicates = 0
  for (const preview of renamePreviews.value) {
    const key = preview.name.toLowerCase()
    if (seen.has(key)) duplicates += 1
    seen.add(key)
  }
  return duplicates
})

/** 与目录里现有条目同名：提示用户，确认后会走覆盖重试 */
const renameExistingConflicts = computed(() => {
  const untouched = new Set(
    items.value.filter((item) => !selectedPaths.value.includes(item.path)).map((item) => item.name)
  )
  return renamePreviews.value.filter((preview) => untouched.has(preview.name)).length
})

const canBatchRename = computed(
  () => !renameNameError.value && renameDuplicates.value === 0 && selectedItems.value.length > 1
)

async function load(): Promise<void> {
  const token = ++loadToken
  const target = currentPath.value
  loading.value = true
  try {
    const [list, crumbs] = await Promise.all([
      window.desktop.files.list(target, { showHidden: settings.showHidden() }),
      window.desktop.files.splitPath(props.rootPath, target)
    ])
    if (token !== loadToken) return

    items.value = list
    breadcrumbs.value = crumbs
    selectedPaths.value = []
    anchorPath.value = null
    visibleCount.value = PAGE_SIZE
  } catch (error) {
    if (token !== loadToken) return
    items.value = []
    ui.handleError(error, t('error.readDirectory'))
  } finally {
    if (token === loadToken) loading.value = false
  }

  // 外部要求高亮某个文件时，列表加载完再选中它
  if (token === loadToken) void tryReveal()
}

function reset(): void {
  currentPath.value = props.rootPath
  void load()
}

/** 重新读取当前目录，尽量保留还能找到的选中项（外部改动 / 撤销之后） */
async function reload(): Promise<void> {
  const previous = [...selectedPaths.value]
  await load()

  const available = new Set(items.value.map((item) => item.path))
  selectedPaths.value = previous.filter((target) => available.has(target))
  anchorPath.value = selectedPaths.value[selectedPaths.value.length - 1] ?? null
}

/**
 * 监听当前目录：外部程序（或整理规则 / 撤销）改动文件后自动刷新。
 * 不支持监听的挂载点会返回 false，此时只能手动刷新（F5）。
 */
async function startWatching(): Promise<void> {
  try {
    await window.desktop.files.watch(currentPath.value)
  } catch {
    // 监听失败不影响浏览，保留手动刷新
  }
}

function openFilter(): void {
  filterOpen.value = true
  void nextTick(() => {
    filterInput.value?.focus()
    filterInput.value?.select?.()
  })
}

function closeFilter(): void {
  filterKeyword.value = ''
  filterOpen.value = false
}

function onFilterKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeFilter()
  }
}

function enter(item: FileItem): void {
  if (item.type !== 'directory') return
  ui.state.revealPath = null
  currentPath.value = item.path
  void load()
}

async function goUp(): Promise<void> {
  if (!canGoUp.value) return
  ui.state.revealPath = null
  const parent = await window.desktop.files.parent(currentPath.value)
  currentPath.value = parent.length >= props.rootPath.length ? parent : props.rootPath
  void load()
}

function navigate(path: string): void {
  ui.state.revealPath = null
  currentPath.value = path
  void load()
}

function isSelected(item: FileItem): boolean {
  return selectedPaths.value.includes(item.path)
}

/** Vuetify 的 list item 也可能以键盘事件触发 click，这里两种都接受 */
function select(item: FileItem, event: MouseEvent | KeyboardEvent): void {
  activatePanel()

  if (event.shiftKey && anchorPath.value) {
    const from = items.value.findIndex((entry) => entry.path === anchorPath.value)
    const to = items.value.findIndex((entry) => entry.path === item.path)
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from]
      selectedPaths.value = items.value.slice(start, end + 1).map((entry) => entry.path)
      return
    }
  }

  if (event.ctrlKey || event.metaKey) {
    selectedPaths.value = isSelected(item)
      ? selectedPaths.value.filter((path) => path !== item.path)
      : [...selectedPaths.value, item.path]
    anchorPath.value = item.path
    return
  }

  selectedPaths.value = [item.path]
  anchorPath.value = item.path
}

/** 方向键移动选中项；extend 为 true 时（Shift）从锚点扩展选择 */
function moveSelection(step: number, extend = false): void {
  const list = filteredItems.value
  if (list.length === 0) return

  const lastPath = selectedPaths.value[selectedPaths.value.length - 1]
  const currentIndex = lastPath ? list.findIndex((item) => item.path === lastPath) : -1
  const base = currentIndex >= 0 ? currentIndex : step > 0 ? -1 : list.length
  const next = Math.min(list.length - 1, Math.max(0, base + step))
  const target = list[next]
  if (!target) return

  if (extend && anchorPath.value) {
    const anchorIndex = list.findIndex((item) => item.path === anchorPath.value)
    const [start, end] = anchorIndex < next ? [anchorIndex, next] : [next, anchorIndex]
    selectedPaths.value = list.slice(Math.max(0, start), end + 1).map((item) => item.path)
  } else {
    selectedPaths.value = [target.path]
    anchorPath.value = target.path
  }

  revealSelection(target.path)
}

function jumpSelection(edge: 'first' | 'last'): void {
  const list = filteredItems.value
  const target = edge === 'first' ? list[0] : list[list.length - 1]
  if (!target) return

  selectedPaths.value = [target.path]
  anchorPath.value = target.path
  revealSelection(target.path)
}

/** 选中项可能落在分批渲染之外，先把对应的那一批渲染出来再滚动 */
function revealSelection(path: string): void {
  const index = filteredItems.value.findIndex((item) => item.path === path)
  if (index >= visibleCount.value) {
    visibleCount.value = Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE
  }

  void nextTick(() => {
    const row = document.querySelector(`[data-path="${CSS.escape(path)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  })
}

/**
 * 外部（搜索、快捷入口的「←」）要求高亮某个文件：切到它所在的目录再选中。
 * 目标不在浏览范围内就放弃；还没加载完就等 load 结束时再试。
 */
async function tryReveal(): Promise<void> {
  const target = ui.state.revealPath
  if (!target) return

  // 已经在当前目录：直接选中
  if (items.value.some((item) => item.path === target)) {
    ui.state.revealPath = null
    selectedPaths.value = [target]
    anchorPath.value = target
    // 聚焦文件列表，选中目标并滚进可视区域
    focusPanel()
    revealSelection(target)
    return
  }

  const parent = await window.desktop.files.parent(target)
  if (!isInsideDirectory(normalizePath(props.rootPath), normalizePath(parent))) {
    // 不在浏览范围内（理论上不会发生）：丢弃这次请求，避免以后误触发
    ui.state.revealPath = null
    return
  }
  // 还在加载就先等 load 结束时再试
  if (loading.value) return
  if (currentPath.value === parent) {
    // 已经在该目录却找不到，说明文件没了
    ui.state.revealPath = null
    return
  }

  currentPath.value = parent
  await load()
}

function selectAll(): void {
  selectedPaths.value = filteredItems.value.map((item) => item.path)
}

async function openSelected(): Promise<void> {
  const [item] = selectedItems.value
  if (!item) return
  if (item.type === 'directory') {
    enter(item)
    return
  }
  try {
    await window.desktop.files.open(item.path)
  } catch (error) {
    ui.handleError(error, t('error.open'))
  }
}

async function revealSelected(): Promise<void> {
  const [item] = selectedItems.value
  if (!item) return
  try {
    await window.desktop.files.reveal(item.path)
  } catch (error) {
    ui.handleError(error, t('error.reveal'))
  }
}

async function copySelectedPath(): Promise<void> {
  const [item] = selectedItems.value
  if (!item) return
  try {
    await navigator.clipboard.writeText(item.path)
    ui.toast(t('toast.pathCopied'), 'success')
  } catch {
    ui.toast(item.path, 'info')
  }
}

/** 置顶到侧边栏的快捷入口（文件 / 目录） */
async function pinSelected(): Promise<void> {
  const item = pinnedCandidate.value
  if (!item) return
  const ok = await shortcuts.add({
    kind: item.type === 'directory' ? 'directory' : 'file',
    path: item.path,
    label: item.name
  })
  if (ok) ui.toast(t('toast.pinned'), 'success')
}

async function createFolder(): Promise<void> {
  const name = await ui.promptInput({
    title: t('file.createFolderTitle'),
    label: t('file.folderNameLabel'),
    placeholder: t('file.folderNamePlaceholder')
  })
  if (!name) return
  try {
    await window.desktop.files.createDirectory(currentPath.value, name)
    await load()
    ui.toast(t('file.createdFolder'), 'success')
  } catch (error) {
    ui.handleError(error, t('error.createFolder'))
  }
}

async function renameSelected(): Promise<void> {
  const [item] = selectedItems.value
  if (!item) return
  if (selectedItems.value.length > 1) {
    renameDialog.base = ''
    renameDialog.start = 1
    renameDialog.keepExtension = true
    renameDialog.open = true
    return
  }
  const name = await ui.promptInput({
    title: t('file.renameTitleSimple'),
    label: t('file.newNameLabel'),
    value: item.name
  })
  if (!name || name === item.name) return
  try {
    await window.desktop.files.rename(item.path, name)
    await load()
    ui.toast(t('file.renamed'), 'success')
  } catch (error) {
    ui.handleError(error, t('error.renameWorkspace'))
  }
}

async function removeSelected(): Promise<void> {
  const targets = selectedItems.value.length > 0 ? selectedItems.value.map((item) => item.path) : []
  if (targets.length === 0) return

  const confirmation = settings.confirmDelete()
    ? await ui.confirm({
        title: t('file.trashTitle'),
        message: selectionSummary(),
        confirmText: t('file.trashConfirm'),
        danger: true
      })
    : true
  if (!confirmation) return

  try {
    let result = await window.desktop.files.remove(targets)

    // 有些挂载点没有回收站（例如临时目录、部分外置磁盘），此时提供永久删除作为兜底
    if (result.failed.length > 0) {
      const permanent = await ui.confirm({
        title: t('file.trashFailedTitle', { count: result.failed.length }),
        message: t('file.trashFailedMessage', { lines: failureLines(result) }),
        confirmText: t('file.trashFailedConfirm'),
        danger: true
      })
      if (permanent) {
        const retryPaths = result.failed.map((item) => item.path)
        const second = await window.desktop.files.remove(retryPaths, { permanent: true })
        result = {
          succeeded: [...result.succeeded, ...second.succeeded],
          skipped: [...result.skipped, ...second.skipped],
          failed: second.failed
        }
      }
    }

    reportBulk(result, t('common.delete'))
    await load()
  } catch (error) {
    ui.handleError(error, t('error.delete'))
  }
}

/** 最多列 5 个名字，避免确认框被长列表撑开 */
function selectionSummary(): string {
  const names = selectedItems.value.map((item) => item.name)
  if (names.length === 1) return names[0]
  const preview = names.slice(0, 5).join('\n')
  return names.length > 5 ? `${preview}\n${t('file.moreItems', { count: names.length - 5 })}` : preview
}

function failureLines(result: BulkResult): string {
  const lines = result.failed.slice(0, FAILURE_PREVIEW).map((item) => `· ${item.message}`)
  if (result.failed.length > FAILURE_PREVIEW) {
    lines.push(t('toast.moreNotListed', { count: result.failed.length - FAILURE_PREVIEW }))
  }
  return lines.join('\n')
}

function reportBulk(result: BulkResult, action: string): void {
  const skipped = result.skipped.length > 0 ? t('file.skippedInTarget', { count: result.skipped.length }) : ''

  if (result.failed.length === 0) {
    if (result.succeeded.length === 0 && result.skipped.length > 0) {
      ui.toast(t('file.allSkipped', { action, count: result.skipped.length }), 'info')
      return
    }
    ui.toast(
      t('file.doneWithSkips', { action, count: result.succeeded.length, skipped }),
      result.skipped.length > 0 ? 'info' : 'success'
    )
    return
  }
  const summary = t('file.donePartial', {
    action,
    count: result.succeeded.length,
    failed: result.failed.length,
    skipped
  })
  ui.toast(`${summary}\n${failureLines(result)}`, 'error')
}

/**
 * 批量操作的统一收尾：
 * 默认不覆盖；有失败项时列出原因，并允许只对失败项以覆盖方式重试。
 */
async function runBulk(
  paths: string[],
  run: (paths: string[], options: TransferOptions) => Promise<BulkResult>,
  action: string
): Promise<void> {
  try {
    let result = await run(paths, {})

    if (result.failed.length > 0) {
      const retryPaths = result.failed.map((item) => item.path)
      const retry = await ui.confirm({
        title: t('file.retryFailedTitle', { count: retryPaths.length }),
        message: t('file.retryFailedMessage', { lines: failureLines(result) }),
        confirmText: t('file.retryFailedConfirm'),
        danger: true
      })
      if (retry) {
        const second = await run(retryPaths, { overwrite: true })
        result = {
          succeeded: [...result.succeeded, ...second.succeeded],
          skipped: [...result.skipped, ...second.skipped],
          failed: second.failed
        }
      }
    }

    reportBulk(result, action)
  } catch (error) {
    ui.handleError(error, t('file.actionFailed', { action }))
  } finally {
    await load()
  }
}

function openMoveDialog(paths: string[]): void {
  if (paths.length === 0) return
  moveDialog.sources = [...paths]
  moveDialog.open = true
}

/** 冲突时询问是否覆盖；默认不覆盖 */
async function moveInto(targetDirectory: string, sources: string[]): Promise<void> {
  moveDialog.open = false
  // IPC 只能传纯数据：moveDialog.sources 是 Vue 的响应式 Proxy，
  // 直接传过去会被结构化克隆拒绝（报 "An object could not be cloned."），这里先拷贝成普通数组
  const targets = [...sources]
  await runBulk(
    targets,
    (retryPaths, options) => window.desktop.files.moveInto(retryPaths, targetDirectory, options),
    t('file.actionMove')
  )
}

async function confirmBatchRename(): Promise<void> {
  if (!canBatchRename.value) return
  const entries: RenameEntry[] = renamePreviews.value.map((preview) => ({
    path: preview.path,
    name: preview.name
  }))
  const names = new Map(entries.map((entry) => [entry.path, entry.name]))

  renameDialog.open = false
  await runBulk(
    entries.map((entry) => entry.path),
    (retryPaths, options) =>
      window.desktop.files.renameMany(
        retryPaths.map((path) => ({ path, name: names.get(path) ?? '' })),
        options
      ),
    t('file.actionRename')
  )
}

async function pickMoveTarget(): Promise<void> {
  try {
    const directory = await window.desktop.files.pickDirectory({ title: t('file.pickTargetTitle') })
    if (directory) await moveInto(directory, moveDialog.sources)
  } catch (error) {
    ui.handleError(error, t('error.chooseDirectory'))
  }
}

function pathsFromDrop(event: DragEvent): { internal: string[]; external: string[] } {
  const transfer = event.dataTransfer
  if (!transfer) return { internal: [], external: [] }

  let internalPaths: string[] = []
  const internal = transfer.getData('application/x-desktop-assistant')
  if (internal) {
    try {
      const parsed: unknown = JSON.parse(internal)
      if (Array.isArray(parsed)) internalPaths = parsed.filter((value): value is string => typeof value === 'string')
    } catch {
      internalPaths = []
    }
  }
  const external: string[] = []

  for (const file of Array.from(transfer.files ?? [])) {
    const path = window.desktop.system.getPathForFile(file)
    if (path) external.push(path)
  }

  return { internal: internalPaths, external }
}

function onRowDragStart(item: FileItem, event: DragEvent): void {
  const sources = isSelected(item) ? selectedPaths.value : [item.path]
  selectedPaths.value = sources
  event.dataTransfer?.setData('application/x-desktop-assistant', JSON.stringify(sources))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onRowDragOver(item: FileItem, event: DragEvent): void {
  if (item.type !== 'directory' || isSelected(item)) return
  event.preventDefault()
  dropTargetPath.value = item.path
}

async function onRowDrop(item: FileItem, event: DragEvent): Promise<void> {
  dropTargetPath.value = null
  if (item.type !== 'directory' || isSelected(item)) return
  const { internal, external } = pathsFromDrop(event)
  const sources = [...internal, ...external]
  if (sources.length === 0) return
  event.preventDefault()
  event.stopPropagation()
  await moveInto(item.path, sources)
}

async function onBackgroundDrop(event: DragEvent): Promise<void> {
  dropTargetPath.value = null
  const { external } = pathsFromDrop(event)
  if (external.length === 0) return
  event.preventDefault()
  await moveInto(currentPath.value, external)
}

/** 快捷键挂在 window 上，避免必须先点一次文件列表才生效 */
function onKeydown(event: KeyboardEvent): void {
  if (ui.state.dialog || moveDialog.open || renameDialog.open) return

  const target = event.target as HTMLElement | null

  // Ctrl/Cmd + F：过滤当前目录（不走全局搜索）
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    openFilter()
    return
  }

  if (target && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable)) {
    return
  }

  // Ctrl/Cmd + 方向键是板块跳转，交给 App.vue 处理
  if ((event.ctrlKey || event.metaKey) && event.key.startsWith('Arrow')) return

  // 已经用 Ctrl/Cmd + 方向键聚焦到别的板块时，方向键归那个板块
  if (panels.state.active !== null && panels.state.active !== panelId && NAVIGATION_KEYS.has(event.key)) {
    return
  }

  if (event.key === 'F5') {
    event.preventDefault()
    void load()
  } else if (event.key === 'Delete' || (event.key === 'Backspace' && event.shiftKey)) {
    event.preventDefault()
    void removeSelected()
  } else if (event.key === 'F2') {
    event.preventDefault()
    void renameSelected()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void openSelected()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveSelection(event.key === 'ArrowDown' ? 1 : -1, event.shiftKey)
  } else if (event.key === 'Home') {
    event.preventDefault()
    jumpSelection('first')
  } else if (event.key === 'End') {
    event.preventDefault()
    jumpSelection('last')
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selectAll()
  } else if (event.key === 'Escape') {
    if (filterOpen.value) closeFilter()
    else {
      selectedPaths.value = []
      anchorPath.value = null
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  unsubscribeChange = window.desktop.files.onDirectoryChanged((event) => {
    if (event.path === currentPath.value) void reload()
  })
  void load()
  void startWatching()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  unsubscribeChange?.()
  unsubscribeChange = null
  void window.desktop.files.unwatch(currentPath.value).catch(() => undefined)
})
watch(() => props.rootPath, reset)
watch(() => settings.state.settings?.showHiddenFiles, load)
// 撤销 / 执行整理规则 / 外部改动后重新读取当前目录
watch(() => ui.state.refreshToken, () => void reload())
// 外部要求高亮某个路径（搜索 / 快捷入口的「←」）
watch(() => ui.state.revealPath, () => void tryReveal())
// 换目录时不再保留上一个目录的过滤条件
watch(currentPath, () => {
  filterKeyword.value = ''
  void startWatching()
})
</script>

<template>
  <div
    ref="panelEl"
    class="view file-panel"
    :class="{ 'is-focused': panelActive }"
    style="height: 100%"
    tabindex="-1"
    @keydown.esc="selectedPaths = []"
    @mousedown="activatePanel"
  >
    <div class="view__header">
      <div class="breadcrumb grow">
        <v-btn size="small" variant="text" :disabled="!canGoUp" prepend-icon="mdi-arrow-up" @click="goUp">
          {{ t('file.up') }}
        </v-btn>
        <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
          <span v-if="index > 0" class="muted">/</span>
          <button class="breadcrumb__item truncate" type="button" @click="navigate(crumb.path)">
            {{ crumb.label }}
          </button>
        </template>
      </div>

      <div class="row">
        <v-btn size="small" variant="text" :disabled="selectedItems.length !== 1" @click="openSelected">
          {{ t('file.open') }}
        </v-btn>
        <v-btn size="small" variant="text" :disabled="selectedItems.length !== 1" @click="revealSelected">
          {{ t('file.reveal') }}
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          :disabled="selectedItems.length === 0"
          :title="selectedItems.length > 1 ? t('file.batchRename') : t('file.renameTitle')"
          @click="renameSelected"
        >
          {{ t('common.rename') }}
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          :disabled="selectedItems.length === 0"
          @click="openMoveDialog(selectedPaths)"
        >
          {{ t('file.moveTo') }}
        </v-btn>
        <v-btn size="small" variant="text" :disabled="selectedItems.length !== 1" @click="copySelectedPath">
          {{ t('file.copyPath') }}
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-pin-outline"
          :disabled="!canPin"
          :title="
            pinnedCandidate && shortcuts.hasPath(pinnedCandidate.path)
              ? t('file.pinAlready')
              : t('file.pinToSidebar')
          "
          @click="pinSelected"
        >
          {{ t('file.pin') }}
        </v-btn>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-folder-plus-outline" @click="createFolder">
          {{ t('file.newFolder') }}
        </v-btn>
        <v-btn size="small" variant="text" icon="mdi-refresh" :title="t('file.refresh')" @click="load" />
        <v-btn
          size="small"
          variant="text"
          color="error"
          icon="mdi-delete-outline"
          :disabled="selectedItems.length === 0"
          :title="t('file.trash')"
          @click="removeSelected"
        />
      </div>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" height="3" />

    <!-- Ctrl/Cmd + F：只过滤当前目录，结果就在列表上方显示条数 -->
    <div v-if="filterOpen" class="filter-bar">
      <v-text-field
        ref="filterInput"
        v-model="filterKeyword"
        class="grow"
        density="compact"
        prepend-inner-icon="mdi-filter-outline"
        :placeholder="t('file.filterPlaceholder')"
        variant="solo-filled"
        hide-details
        clearable
        @keydown="onFilterKeydown"
      />
      <span class="muted mono filter-bar__count">
        {{ filteredItems.length }} / {{ items.length }}
      </span>
    </div>

    <div
      class="view__body drop-zone"
      :class="{ 'is-active': dropTargetPath === currentPath }"
      @dragover.prevent="dropTargetPath = currentPath"
      @dragleave="dropTargetPath = null"
      @drop="onBackgroundDrop"
      @click.self="selectedPaths = []"
    >
      <v-empty-state
        v-if="!loading && items.length === 0"
        icon="mdi-folder-open-outline"
        :title="emptyHint ?? t('file.emptyHint')"
      />

      <v-empty-state
        v-else-if="!loading && filteredItems.length === 0"
        icon="mdi-filter-outline"
        :title="t('file.noMatch')"
        :text="t('file.noMatchText')"
      />

      <v-list v-else-if="filteredItems.length > 0" density="compact" class="file-list">
        <v-list-item
          v-for="item in visibleItems"
          :key="item.path"
          :data-path="item.path"
          :active="isSelected(item)"
          :class="{ 'is-drop-target': dropTargetPath === item.path }"
          color="primary"
          draggable="true"
          @click="select(item, $event)"
          @dblclick="item.type === 'directory' ? enter(item) : openSelected()"
          @dragstart="onRowDragStart(item, $event)"
          @dragover="onRowDragOver(item, $event)"
          @dragleave="dropTargetPath = null"
          @drop="onRowDrop(item, $event)"
        >
          <template #prepend>
            <v-icon v-bind="iconForFile(item)" class="file-row__icon" size="20" />
          </template>

          <v-list-item-title class="truncate">{{ item.name }}</v-list-item-title>

          <template #append>
            <span class="file-row__meta mono">{{ item.type === 'directory' ? '—' : formatSize(item.size) }}</span>
            <span class="file-row__meta mono">{{ formatDate(item.modifiedAt) }}</span>
          </template>
        </v-list-item>

        <div v-if="hiddenCount > 0" class="file-list__more">
          <v-btn size="small" variant="text" @click="visibleCount += PAGE_SIZE">
            {{ t('file.showMore', { count: hiddenCount }) }}
          </v-btn>
        </div>
      </v-list>
    </div>

    <v-dialog v-model="moveDialog.open" :max-width="480">
      <v-card class="dialog__card">
        <v-card-title class="dialog__title">{{ t('file.moveToTitle') }}</v-card-title>
        <v-card-text>
          <p class="muted" style="margin: 0 0 10px">
            {{ t('file.moveToCount', { count: moveDialog.sources.length }) }}
          </p>
          <div class="stack" style="max-height: 320px; overflow: auto">
            <v-btn
              v-for="entry in allDirectories"
              :key="entry.directory.id"
              variant="tonal"
              style="justify-content: flex-start"
              @click="moveInto(entry.directory.path, moveDialog.sources)"
            >
              <span class="truncate">{{ entry.workspace.name }} / {{ entry.directory.name }}</span>
            </v-btn>
            <p v-if="allDirectories.length === 0" class="muted">{{ t('file.noMappedDirectories') }}</p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="pickMoveTarget">{{ t('file.pickOtherDirectory') }}</v-btn>
          <v-spacer />
          <v-btn variant="text" @click="moveDialog.open = false">{{ t('common.cancel') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="renameDialog.open" :max-width="520">
      <v-card class="dialog__card">
        <v-card-title class="dialog__title">
          {{ t('file.batchRenameTitle', { count: selectedItems.length }) }}
        </v-card-title>
        <v-card-text class="stack">
          <v-text-field
            v-model="renameDialog.base"
            :label="t('file.newNameLabel')"
            :placeholder="t('file.batchNamePlaceholder')"
            autofocus
            @keydown.enter="confirmBatchRename"
          />

          <div class="row">
            <v-text-field
              v-model.number="renameDialog.start"
              type="number"
              min="0"
              :label="t('file.startIndex')"
              style="width: 140px"
            />
            <v-switch v-model="renameDialog.keepExtension" color="primary" :label="t('file.keepExtension')" hide-details />
          </div>

          <p v-if="renameNameError" class="dialog__error">{{ renameNameError }}</p>

          <div class="preview">
            <div v-for="preview in renamePreviews.slice(0, 4)" :key="preview.path" class="preview__row">
              <span class="muted truncate">{{ preview.from }}</span>
              <span class="muted">→</span>
              <span class="truncate">{{ preview.name }}</span>
            </div>
            <p v-if="renamePreviews.length > 4" class="muted" style="margin: 4px 0 0">
              {{ t('file.previewMore', { count: renamePreviews.length }) }}
            </p>
          </div>

          <p v-if="renameDuplicates > 0" class="dialog__error">
            {{ t('file.duplicates', { count: renameDuplicates }) }}
          </p>
          <p v-else-if="renameExistingConflicts > 0" class="dialog__warning">
            {{ t('file.existingConflicts', { count: renameExistingConflicts }) }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="renameDialog.open = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :disabled="!canBatchRename" @click="confirmBatchRename">
            {{ t('common.rename') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
