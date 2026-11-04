<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { RecentEntry, SearchNavigation, SearchResult, SearchResultType } from '@shared/types'
import { SEARCH_DEBOUNCE, SEARCH_RESULT_LIMIT } from '@shared/types'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'
import { t } from '../i18n'

const ui = useUi()
const settings = useSettings()
const workspaces = useWorkspaces()

/**
 * 弹框里的一行：关键字搜索结果和「最近打开」统一成同一种结构，
 * 这样过滤、方向键选择、回车激活都只有一条代码路径。
 */
interface SearchEntry {
  key: string
  type: SearchResultType
  title: string
  subtitle: string
  path: string | null
  url: string | null
  /** 已安装应用的图标（data URL），没有就用内置图标兜底 */
  iconUrl: string | null
  /** 归属工作区；null 表示没有归属（桌面文件、收件箱待办、备忘） */
  workspaceId: number | null
  result: SearchResult | null
  recent: RecentEntry | null
}

type TypeFilter = SearchResultType | 'all'
type WorkspaceFilter = number | 'all' | 'inbox'

const keyword = ref('')
const results = ref<SearchResult[]>([])
const recents = ref<RecentEntry[]>([])
const searching = ref(false)
const activeIndex = ref(-1)
const typeFilter = ref<TypeFilter>('all')
const workspaceFilter = ref<WorkspaceFilter>('all')
const inputRef = ref<{ focus: () => void; select?: () => void } | null>(null)
const cardRef = ref<{ $el?: HTMLElement } | null>(null)
/** 独立搜索窗口里弹框铺满整个窗口（主界面里还是 720px 的浮动弹框） */
const inSearchWindow = window.location.hash === '#search'
/** 独立搜索窗口：把弹框量到的高度报给主进程，让窗口跟着内容变高变矮 */
let sizeObserver: ResizeObserver | null = null
let sizeTimer: number | undefined
/** 图标加载失败的行（data URL 异常 / 平台给不出图）：这些行退回内置图标，不留空方框 */
const brokenIcons = reactive(new Set<string>())

/** 防抖延时可以在设置里改：调大能减少连续输入时的结果刷新，0 表示按下即搜 */
const debounceMs = computed(() => settings.state.settings?.searchDebounceMs ?? SEARCH_DEBOUNCE.default)
/** 默认只展示这么多条结果，更多的点「展开」；同样可以在设置里改 */
const resultLimit = computed(() => settings.state.settings?.searchResultLimit ?? SEARCH_RESULT_LIMIT.default)
/** 是否已经展开全部结果（每次换关键字 / 换过滤条件回到收起） */
const expanded = ref(false)
/** 请求序号：连续输入时旧请求可能后返回，只认最后一次的结果 */
let requestSeq = 0

const typeLabels = computed<Record<SearchResultType, string>>(() => ({
  workspace: t('search.typeWorkspace'),
  directory: t('search.typeDirectory'),
  todo: t('search.typeTodo'),
  file: t('search.typeFile'),
  note: t('search.typeNote'),
  clipboard: t('search.typeClipboard'),
  app: t('search.typeApp'),
  tool: t('search.typeTool')
}))

const typeFilters = computed<Array<{ value: TypeFilter; label: string }>>(() => [
  { value: 'all', label: t('search.filterAll') },
  { value: 'app', label: t('search.typeApp') },
  { value: 'file', label: t('search.typeFile') },
  { value: 'directory', label: t('search.typeDirectory') },
  { value: 'workspace', label: t('search.typeWorkspace') },
  { value: 'todo', label: t('search.typeTodo') },
  { value: 'note', label: t('search.typeNote') },
  { value: 'clipboard', label: t('search.typeClipboard') },
  { value: 'tool', label: t('search.typeTool') }
])

const workspaceOptions = computed(() => [
  { title: t('search.allOwners'), value: 'all' as const },
  { title: t('search.inboxOption'), value: 'inbox' as const },
  ...workspaces.state.items.map((workspace) => ({ title: workspace.name, value: workspace.id }))
])

const hasKeyword = computed(() => keyword.value.trim().length > 0)
/** 有文件 / 目录的打开记录时才显示「清空」：最近编辑的备忘来自备忘本身，清不掉 */
const hasFileRecents = computed(() => recents.value.some((recent) => recent.kind !== 'note'))

/** 关键字结果 + 最近打开，统一成 SearchEntry */
const entries = computed<SearchEntry[]>(() => {
  if (!hasKeyword.value) {
    return recents.value.map((recent) => {
      const isNote = recent.kind === 'note'
      return {
        key: `recent-${recent.path}`,
        type: recent.kind === 'directory' ? ('directory' as const) : isNote ? ('note' as const) : ('file' as const),
        title: recent.name,
        subtitle: isNote ? t('search.recentNoteSubtitle') : recent.path,
        path: isNote ? null : recent.path,
        url: null,
        iconUrl: null,
        workspaceId: null,
        result: null,
        recent
      }
    })
  }

  return results.value.map((result, index) => ({
    key: `${result.type}-${result.id ?? result.path ?? index}`,
    type: result.type,
    title: result.title,
    subtitle: result.subtitle,
    path: result.path ?? null,
    url: result.url ?? null,
    iconUrl: result.iconUrl ?? null,
    workspaceId: result.workspaceId ?? null,
    result,
    recent: null
  }))
})

/** 类型 / 归属过滤都在渲染进程做，主进程只负责返回候选结果 */
const filteredEntries = computed(() =>
  entries.value.filter((entry) => {
    if (typeFilter.value !== 'all' && entry.type !== typeFilter.value) return false
    if (workspaceFilter.value === 'all') return true
    if (workspaceFilter.value === 'inbox') return entry.workspaceId === null
    return entry.workspaceId === workspaceFilter.value
  })
)

/** 实际渲染的行：默认截到设置里的条数，展开后显示全部 */
const visibleEntries = computed(() =>
  expanded.value ? filteredEntries.value : filteredEntries.value.slice(0, resultLimit.value)
)

/** 被收起来的条数：按设置截断时才有（展开后仍然知道总数，方便「收起」） */
const hiddenCount = computed(() => Math.max(0, filteredEntries.value.length - resultLimit.value))

/** 键盘能走到的行：可见条目 + 最后那行「展开 / 收起」 */
const navLength = computed(() => visibleEntries.value.length + (hiddenCount.value > 0 ? 1 : 0))

/** 「展开 / 收起」那一行在列表里的下标（没有它就返回 -1） */
const moreIndex = computed(() => (hiddenCount.value > 0 ? visibleEntries.value.length : -1))

/** 有内容时才撑到固定高度；初始只有一行提示时按内容自适应，不要一上来就是大空框 */
const filled = computed(() => visibleEntries.value.length > 0)

let timer: number | undefined
/** 「窗口被隐藏」的订阅（按设置决定是否顺手收起搜索弹框） */
let unsubscribeHidden: (() => void) | null = null
/** 「搜索被呼出」的订阅（独立搜索窗口每次呼出刷新最近打开 + 重量高度） */
let unsubscribeSummon: (() => void) | null = null

onMounted(() => {
  unsubscribeHidden = window.desktop.window.onHidden(() => {
    if (settings.state.settings?.closeSearchOnHide ?? true) close()
  })
  // 独立搜索窗口没有自己的关闭按钮：失焦会被主进程收起，这同样算"关闭"，
  // 所以「关闭搜索后清空关键字与结果」这个设置在这里也要生效
  if (inSearchWindow) window.addEventListener('blur', onWindowBlur)
  /*
   * 独立搜索窗口每次被呼出都刷新「最近打开」并重新量一次高度：
   * 窗口是常驻复用的，「最近打开」只在第一次打开时取过，之后一直用旧数据，
   * 上一次没搜到内容时窗口会停在"没有匹配"那个矮高度上，下次打开明明该显示最近打开却长不出来。
   */
  if (inSearchWindow) {
    unsubscribeSummon = window.desktop.system.onOpenSearch(() => {
      void loadRecents().then(() => nextTick(() => reportSearchWindowHeight()))
    })
  }
})

onBeforeUnmount(() => {
  unsubscribeHidden?.()
  unsubscribeHidden = null
  window.removeEventListener('blur', onWindowBlur)
  unsubscribeSummon?.()
  unsubscribeSummon = null
  sizeObserver?.disconnect()
  sizeObserver = null
  window.clearTimeout(sizeTimer)
})

/** 独立搜索窗口失去焦点（随即被收起）：按设置清理上一次的搜索 */
function onWindowBlur(): void {
  if (settings.state.settings?.clearSearchOnClose) resetSearch()
}

/** 把弹框高度报给主进程（独立搜索窗口用它调整窗口大小） */
function reportSearchWindowHeight(): void {
  const element = cardRef.value?.$el
  if (!element) return
  // 用布局高度（offsetHeight）而不是 getBoundingClientRect()：
  // 弹框有「放大出现」的过渡，过渡没结束时 rect 带着缩放，量出来的会偏小，
  // 而偏移量变化不会触发 ResizeObserver，窗口就永远停在偏矮的高度上。
  const height = element.offsetHeight
  void window.desktop.system.resizeSearch(height).catch(() => undefined)
}

/**
 * 独立搜索窗口：盯着弹框高度，内容变了就跟着调窗口（防抖一下，别跟着打开动画抖）。
 * 每次打开都重新挂：弹框内容在关闭后会被销毁，observer 老盯着旧元素就不会再回调了。
 */
function watchSearchWindowHeight(): void {
  if (!inSearchWindow) return
  sizeObserver?.disconnect()
  sizeObserver = null

  const element = cardRef.value?.$el
  if (!element) return

  sizeObserver = new ResizeObserver(() => {
    window.clearTimeout(sizeTimer)
    sizeTimer = window.setTimeout(() => reportSearchWindowHeight(), 60)
  })
  sizeObserver.observe(element)
  reportSearchWindowHeight()
}

/**
 * 内容变化后也主动报一次高度。
 * 只靠 ResizeObserver 不够：弹框刚打开时内容还在陆续渲染（最近打开 / 搜索结果），
 * 观察的元素一旦被重建就再也收不到回调，窗口会停在第一次量的那个偏矮的高度上。
 */
watch(
  () =>
    [
      ui.state.globalSearch,
      hasKeyword.value,
      visibleEntries.value.length,
      hiddenCount.value,
      expanded.value,
      searching.value,
      recents.value.length
    ].join('|'),
  () => {
    if (!inSearchWindow) return
    void nextTick(() => reportSearchWindowHeight())
  }
)

watch(
  () => ui.state.globalSearch,
  async (value) => {
    if (!value) return
    // 每次打开都回到干净状态：高亮清空、超出部分收起（关键字保留，方便接着找）
    activeIndex.value = -1
    expanded.value = false
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select?.()
    watchSearchWindowHeight()
    void loadRecents()
    if (keyword.value.trim()) void run()
  }
)

watch(keyword, () => {
  window.clearTimeout(timer)
  expanded.value = false
  // 清空关键字不用等：列表要立刻回到「最近打开」
  if (!hasKeyword.value) {
    void run()
    return
  }
  // 防抖等待期间也算「搜索中」：否则结果还是上一次的，会先闪一下「没有匹配」
  requestSeq += 1
  searching.value = true
  timer = window.setTimeout(() => void run(), debounceMs.value)
})

// 过滤条件变化后，原来的高亮行可能已经不在列表里
watch([typeFilter, workspaceFilter], () => {
  activeIndex.value = -1
  expanded.value = false
})

function close(): void {
  // 设置里开了「关闭后清空」时，退出搜索就把关键字和结果一起清掉，下次打开是干净的
  if (settings.state.settings?.clearSearchOnClose) resetSearch()
  ui.closeGlobalSearch()
}

/** 清空关键字与结果，回到初始状态（不动「最近打开」） */
function resetSearch(): void {
  window.clearTimeout(timer)
  timer = undefined
  // 序号 +1：还在路上的请求回来也不会再写回结果
  requestSeq += 1
  keyword.value = ''
  results.value = []
  searching.value = false
  activeIndex.value = -1
  expanded.value = false
}

/** Esc / 点击遮罩关闭时，把 store 里的开关也一起复位 */
function onDialogModel(value: boolean): void {
  if (!value) close()
}

async function loadRecents(): Promise<void> {
  try {
    recents.value = await window.desktop.system.recent(15)
  } catch (error) {
    ui.handleError(error, t('error.readRecent'))
  }
}

async function clearRecents(): Promise<void> {
  try {
    await window.desktop.system.clearRecent()
    // 清空的是文件 / 目录记录；最近编辑的备忘来自备忘本身，清完再读一次让它们继续显示
    await loadRecents()
  } catch (error) {
    ui.handleError(error, t('error.clearRecent'))
  }
}

async function run(): Promise<void> {
  window.clearTimeout(timer)
  timer = undefined

  const value = keyword.value.trim()
  activeIndex.value = -1
  const seq = ++requestSeq

  if (!value) {
    results.value = []
    searching.value = false
    return
  }

  searching.value = true
  try {
    const found = await window.desktop.system.search(value)
    // 期间用户又输入了，丢弃这次结果，避免旧结果盖掉新结果
    if (seq === requestSeq) results.value = found
  } catch (error) {
    ui.handleError(error, t('error.search'))
  } finally {
    if (seq === requestSeq) searching.value = false
  }
}

/** 跳到某个工作区；目录还要选中对应映射目录 */
/** 需要主界面配合的跳转：交给主进程，由主窗口执行（搜索窗口自己不在主界面里） */
async function navigate(target: SearchNavigation): Promise<void> {
  try {
    await window.desktop.system.navigate(target)
  } catch (error) {
    ui.handleError(error, t('error.navigate'))
  }
  close()
}

async function openLink(url: string, noteId: number | null = null): Promise<void> {
  try {
    // 备忘里的链接：交给主进程，打开浏览器时顺便把这条备忘记入「最近打开」
    if (noteId != null) await window.desktop.system.openNoteUrl(noteId, url)
    else await window.desktop.system.openUrl(url)
    close()
  } catch (error) {
    ui.handleError(error, t('error.openLink'))
  }
}

/** 只有带真实路径的文件 / 目录条目才有「所在目录」和「归属工作区」 */
function isFilesystemEntry(entry: SearchEntry): boolean {
  return (entry.type === 'file' || entry.type === 'directory') && Boolean(entry.path)
}

/** →：打开所在目录（文件在文件管理器中定位，目录直接打开） */
async function revealEntry(entry: SearchEntry): Promise<void> {
  const target = entry.path
  if (!target) return
  try {
    if (entry.type === 'directory') await window.desktop.files.open(target)
    else await window.desktop.files.reveal(target)
  } catch (error) {
    ui.handleError(error, t('error.openContaining'))
  }
  close()
}

/** ←：跳到条目归属的工作区（选中所在映射目录）；桌面文件跳到桌面页 */
function openOwner(entry: SearchEntry): boolean {
  const target = entry.path
  if (!target) return false

  // 关键字结果带着自己的归属（同一个目录映射到多个工作区时，各条结果各跳各的）；
  // 最近打开没有归属信息，交给主界面按路径推断。
  const result = entry.result
  void navigate({
    kind: 'path',
    path: target,
    pathKind: entry.type === 'directory' ? 'directory' : 'file',
    workspaceId: result ? result.workspaceId : undefined,
    directoryId: result ? (result.type === 'directory' ? result.id ?? null : result.directoryId ?? null) : undefined
  })
  return true
}

/**
 * ← / → 只作用在已选中的文件 / 目录条目上（先用 ↑↓ 选中）。
 * 返回是否处理了这次按键：没处理时让方向键按普通方式移动输入框光标。
 */
function handleSideKey(direction: 'left' | 'right'): boolean {
  const index = activeIndex.value
  if (index < 0 || index >= visibleEntries.value.length) return false
  const entry = visibleEntries.value[index]
  if (!isFilesystemEntry(entry)) return false

  if (direction === 'right') {
    void revealEntry(entry)
    return true
  }
  return openOwner(entry)
}

async function activate(entry: SearchEntry): Promise<void> {
  // 「最近打开」按打开处理，普通文件结果按在文件管理器中定位处理
  if (entry.recent) {
    // 最近的备忘没有路径，跳回备忘页并定位到这一条
    if (entry.recent.kind === 'note' && entry.recent.id != null) {
      await navigate({ kind: 'note', noteId: entry.recent.id })
      return
    }
    try {
      await window.desktop.files.open(entry.recent.path)
    } catch (error) {
      ui.handleError(error, t('error.open'))
    }
    close()
    return
  }

  const result = entry.result
  if (!result) return

  // 剪贴板条目：回车 / 点击都会把它写回系统剪贴板
  if (result.type === 'clipboard') {
    if (result.id != null) {
      try {
        await window.desktop.clipboard.copy(result.id)
        ui.toast(t('toast.copiedClipboard'), 'success')
      } catch (error) {
        ui.handleError(error, t('error.copy'))
      }
    }
    close()
    return
  }

  // 工具：交给主界面打开工具页并进入对应工具
  if (result.type === 'tool') {
    if (result.toolId) await navigate({ kind: 'tool', toolId: result.toolId })
    else close()
    return
  }

  // 工作区 / 目录 / 待办 / 备忘：这些要在主界面里显示，
  // 弹框可能跑在独立搜索窗口里（不在主界面里），所以统一交给主进程转发给主窗口
  if (result.type === 'workspace' || result.type === 'directory') {
    await navigate({ kind: result.type, workspaceId: result.workspaceId ?? null, directoryId: result.id ?? null })
    return
  }

  if (result.type === 'todo') {
    await navigate({ kind: 'todo', keyword: keyword.value.trim() })
    return
  }

  if (result.type === 'note') {
    // 带链接的备忘：回车直接打开链接（和行尾那个按钮同一个动作）
    if (result.url) {
      await openLink(result.url, result.id ?? null)
      return
    }
    await navigate({ kind: 'note', noteId: result.id ?? undefined })
    return
  }

  // 已安装的应用：交给主进程启动（Linux 走 .desktop 的 Exec，其它平台交给系统）
  if (result.type === 'app') {
    if (result.path) {
      try {
        await window.desktop.apps.open(result.path)
      } catch (error) {
        ui.handleError(error, t('error.openApp'))
      }
    }
    close()
    return
  }

  if (result.path) {
    // 文件 / 目录结果回车直接打开（和「最近打开」一致），目录会交给系统文件管理器
    try {
      await window.desktop.files.open(result.path)
    } catch (error) {
      ui.handleError(error, t('error.open'))
    }
    close()
  }
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    if (navLength.value === 0) return
    event.preventDefault()
    void moveActive(1)
  } else if (event.key === 'ArrowUp') {
    if (navLength.value === 0) return
    event.preventDefault()
    void moveActive(-1)
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    // 只有选中的文件 / 目录条目才接管左右键；否则留给输入框移动光标
    if (handleSideKey(event.key === 'ArrowRight' ? 'right' : 'left')) event.preventDefault()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    // 「展开 / 收起」那一行只有在真的收起了结果时才存在（moreIndex 为 -1 时不能拿它比）
    if (activeIndex.value >= 0 && activeIndex.value === moreIndex.value) toggleExpanded()
    // 没用方向键时回车直接打开第一条：搜到应用想立刻启动是最常见的用法
    else if (activeIndex.value >= 0) void activate(visibleEntries.value[activeIndex.value])
    else if (visibleEntries.value.length > 0) void activate(visibleEntries.value[0])
    else void run()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    if (keyword.value) {
      keyword.value = ''
      results.value = []
    } else {
      close()
    }
  }
}

/**
 * 上下移动高亮行：走完列表会绕回开头，并且把当前行滚进可视区域
 * （列表比弹框高时，光改高亮是看不见的）。
 */
async function moveActive(step: number): Promise<void> {
  const length = navLength.value
  if (length === 0) return

  activeIndex.value = (activeIndex.value + step + length) % length
  await nextTick()
  document.querySelector(`[data-search-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
}

/** 展开 / 收起超出的结果 */
function toggleExpanded(): void {
  expanded.value = !expanded.value
  activeIndex.value = -1
}

/** 图标加载失败：记下来，这一行改用内置图标 */
function markIconBroken(key: string): void {
  brokenIcons.add(key)
}

function iconFor(entry: SearchEntry): string {
  if (entry.recent) return entry.type === 'note' ? 'mdi-note-text-outline' : 'mdi-history'
  if (entry.type === 'file') return 'mdi-file-outline'
  if (entry.type === 'directory') return 'mdi-folder-outline'
  if (entry.type === 'workspace') return 'mdi-folder-multiple-outline'
  if (entry.type === 'note') return 'mdi-note-text-outline'
  if (entry.type === 'clipboard') return 'mdi-content-paste'
  if (entry.type === 'tool') return 'mdi-toolbox-outline'
  if (entry.type === 'app') return 'mdi-application-outline'
  return 'mdi-check-circle-outline'
}
</script>

<template>
  <v-dialog
    :model-value="ui.state.globalSearch"
    :max-width="inSearchWindow ? undefined : 720"
    content-class="search-dialog__content"
    @update:model-value="onDialogModel"
  >
            <v-card ref="cardRef" class="dialog__card search-dialog" :class="{ 'search-dialog--filled': filled }">
      <!-- 输入框放在 card-text 之外：scrollable 会把所有 card-text 变成可滚动区域 -->
      <div class="search-dialog__input">
        <v-text-field
          ref="inputRef"
          v-model="keyword"
          autofocus
          clearable
          prepend-inner-icon="mdi-magnify"
          :placeholder="t('search.placeholder')"
          hide-details
          @keydown="onInputKeydown"
        />
      </div>

      <!-- 类型与归属过滤：只收敛当前结果，不额外发起请求 -->
      <div class="search-dialog__filters">
        <v-chip-group v-model="typeFilter" mandatory selected-class="text-primary">
          <v-chip
            v-for="option in typeFilters"
            :key="option.value"
            :value="option.value"
            size="small"
            variant="tonal"
          >
            {{ option.label }}
          </v-chip>
        </v-chip-group>
        <v-spacer />
        <v-select
          v-model="workspaceFilter"
          class="search-dialog__workspace"
          :items="workspaceOptions"
          density="compact"
          hide-details
          variant="solo-filled"
          :menu-props="{ maxHeight: 320 }"
        />
      </div>

      <v-progress-linear v-if="searching" indeterminate color="primary" height="2" />

      <v-card-text class="search-dialog__results">
        <div v-if="!hasKeyword && recents.length > 0" class="row row--between">
          <span class="muted">{{ t('search.recentTitle') }}</span>
          <v-btn v-if="hasFileRecents" size="small" variant="text" @click="clearRecents">
            {{ t('search.clearFiles') }}
          </v-btn>
        </div>

        <p v-if="!hasKeyword && recents.length === 0" class="muted search-dialog__hint">
          {{ t('search.hint') }}
        </p>
        <p v-else-if="hasKeyword && !searching && results.length === 0" class="muted search-dialog__hint">
          {{ t('search.noMatch') }}
        </p>
        <!-- 搜索中不显示空提示：结果返回前先留着上一次的列表，避免闪一下 -->
        <p v-else-if="!searching && filteredEntries.length === 0" class="muted search-dialog__hint">
          {{ t('search.noFilterMatch') }}
        </p>

        <v-list v-else nav density="compact" class="search__results">
          <v-list-item
            v-for="(entry, index) in visibleEntries"
            :key="entry.key"
            :data-search-index="index"
            :active="index === activeIndex"
            color="primary"
            rounded="lg"
            @click="activate(entry)"
          >
            <template #prepend>
              <!--
                应用用系统里的真实图标：包在 v-icon 里，尺寸与左右边距和内置图标完全一致，
                标题才会和其它行对齐；图片加载失败（data URL 坏了、平台给不出图）时退回内置图标。
              -->
              <v-icon v-if="entry.iconUrl && !brokenIcons.has(entry.key)" class="search__icon">
                <img
                  class="search__icon-image"
                  :src="entry.iconUrl"
                  alt=""
                  @error="markIconBroken(entry.key)"
                />
              </v-icon>
              <v-icon v-else :icon="iconFor(entry)" />
            </template>
            <v-list-item-title class="truncate">{{ entry.title }}</v-list-item-title>
            <!-- 应用的注释是说明文字（不是路径），用正常字体更协调；路径 / 命令仍用等宽 -->
            <v-list-item-subtitle class="truncate" :class="{ mono: entry.type !== 'app' }">
              {{ entry.subtitle }}
            </v-list-item-subtitle>
            <template #append>
              <v-chip v-if="entry.recent" size="small" variant="tonal">{{ t('search.recentChip') }}</v-chip>
              <v-btn
                v-else-if="entry.url"
                size="small"
                variant="text"
                icon="mdi-open-in-new"
                :title="t('search.openInBrowser')"
                @click.stop="openLink(entry.url ?? '', entry.result?.id ?? null)"
              />
              <v-chip v-else size="small" variant="tonal">{{ typeLabels[entry.type] }}</v-chip>
            </template>
          </v-list-item>

          <!-- 默认只列设置里的条数：这一行同样能用方向键选中、回车展开 -->
          <v-list-item
            v-if="hiddenCount > 0"
            :data-search-index="moreIndex"
            :active="activeIndex === moreIndex"
            color="primary"
            rounded="lg"
            class="search-dialog__more"
            @click="toggleExpanded"
          >
            <template #prepend>
              <v-icon :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
            </template>
            <v-list-item-title>
              {{ expanded ? t('search.collapse') : t('search.expandRest', { count: hiddenCount }) }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
