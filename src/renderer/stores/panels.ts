import { computed, onBeforeUnmount, onMounted, reactive, type Ref } from 'vue'
import { pickPanel, type PanelDirection, type PanelRect, type PanelTarget } from '../composables/panels'

/**
 * 页面里的板块（工作区列表、映射目录、文件列表…）注册在这里，
 * `Ctrl/Cmd + 方向键` 按屏幕位置跳到该方向上最近的板块。
 */
interface PanelEntry {
  element: Ref<HTMLElement | null>
}

const entries = new Map<string, PanelEntry>()
const state = reactive({ active: null as string | null })

function rectOf(entry: PanelEntry): PanelRect | null {
  const element = entry.element.value
  if (!element || !element.isConnected) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/** 只标记当前板块，不动 DOM 焦点（点击板块时用） */
function setActive(id: string | null): void {
  state.active = id
}

/** 标记并把 DOM 焦点交给板块，之后方向键就作用于这个板块 */
function focus(id: string): void {
  const entry = entries.get(id)
  if (!entry) return
  state.active = id
  entry.element.value?.focus({ preventScroll: true })
}

/**
 * 聚焦板块，元素还没渲染出来时用 requestAnimationFrame 重试几次。
 * 切视图 / 板块刚挂载时 `focus()` 会因为 element 还是 null 而静默落空
 * （但 state.active 已经改了），这里一直等到真正拿到元素为止。
 */
function focusWhenReady(id: string, attempts = 10): void {
  state.active = id
  const element = entries.get(id)?.element.value ?? null
  if (element) {
    element.focus({ preventScroll: true })
    // 元素存在但可能还没真正可聚焦（刚挂载 / 还没布局好），确认焦点落上了再停
    if (document.activeElement === element || element.contains(document.activeElement)) return
  }
  if (attempts <= 0) return
  window.requestAnimationFrame(() => {
    // 期间焦点被交给别的板块时就不再抢回来
    if (state.active === id) focusWhenReady(id, attempts - 1)
  })
}

/** 返回是否真的换了板块，调用方据此决定要不要 preventDefault */
function move(direction: PanelDirection): boolean {
  const targets: PanelTarget[] = []
  for (const [id, entry] of entries) {
    const rect = rectOf(entry)
    if (rect) targets.push({ id, rect })
  }
  if (targets.length === 0) return false

  // 还没聚焦过任何板块时，以整个窗口为起点，按方向挑最合适的板块
  const active = targets.find((target) => target.id === state.active) ?? null
  const from = active ?? {
    id: null,
    rect: { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  }
  const next = pickPanel(direction, from.id, from.rect, targets)
  if (!next) return false

  focus(next)
  return true
}

export function usePanels() {
  return { state, move, setActive, focus, focusWhenReady }
}

/**
 * 把组件的根元素注册成板块：模板上 `ref="panelEl"` 绑定 element，卸载时自动注销。
 */
export function usePanel(id: string, element: Ref<HTMLElement | null>) {
  onMounted(() => entries.set(id, { element }))
  onBeforeUnmount(() => {
    entries.delete(id)
    if (state.active === id) state.active = null
  })

  return {
    active: computed(() => state.active === id),
    activate: () => setActive(id),
    focus: () => focusWhenReady(id)
  }
}
