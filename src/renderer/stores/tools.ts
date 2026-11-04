import { computed, reactive } from 'vue'
import type {
  ToolDescriptor,
  ToolOptionValue,
  ToolResult
} from '@shared/tools/types'
import { t } from '../i18n'
import { useUi } from './ui'

export interface ToolSession {
  input: string
  options: Record<string, ToolOptionValue>
  result: ToolResult | null
}

const state = reactive({
  items: [] as ToolDescriptor[],
  loading: false,
  /** 当前打开的工具；null 表示显示工具列表 */
  activeToolId: null as string | null,
  /** 本次运行期里的输入 / 选项 / 结果；不落盘 */
  sessions: {} as Record<string, ToolSession>
})

const activeTool = computed(() => state.items.find((tool) => tool.id === state.activeToolId) ?? null)

function sessionFor(tool: ToolDescriptor): ToolSession {
  const existing = state.sessions[tool.id]
  if (existing) return existing
  state.sessions[tool.id] = {
    input: '',
    options: Object.fromEntries(tool.options.map((option) => [option.key, option.default])),
    result: null
  }
  return state.sessions[tool.id]
}

/** 工具运行结束后保存结果（只在内存里） */
function saveResult(tool: ToolDescriptor, result: ToolResult | null): void {
  sessionFor(tool).result = result
}

async function load(): Promise<void> {
  state.loading = true
  try {
    state.items = await window.desktop.plugins.list()
    if (state.activeToolId && !state.items.some((tool) => tool.id === state.activeToolId)) {
      state.activeToolId = null
    }
  } catch (error) {
    useUi().handleError(error, t('error.readTools'))
  } finally {
    state.loading = false
  }
}

async function installFolder(): Promise<void> {
  try {
    const tool = await window.desktop.plugins.installFolder()
    if (!tool) return
    await load()
    state.activeToolId = tool.id
    useUi().toast(t('tools.installed', { name: tool.name }), 'success')
  } catch (error) {
    useUi().handleError(error, t('error.installPlugin'))
  }
}

async function installZip(): Promise<void> {
  try {
    const tool = await window.desktop.plugins.installZip()
    if (!tool) return
    await load()
    state.activeToolId = tool.id
    useUi().toast(t('tools.installed', { name: tool.name }), 'success')
  } catch (error) {
    useUi().handleError(error, t('error.installPlugin'))
  }
}

async function setEnabled(id: string, enabled: boolean): Promise<void> {
  try {
    await window.desktop.plugins.setEnabled(id, enabled)
    await load()
  } catch (error) {
    useUi().handleError(error, t('error.updatePlugin'))
  }
}

async function uninstall(id: string): Promise<void> {
  try {
    await window.desktop.plugins.uninstall(id)
    delete state.sessions[id]
    if (state.activeToolId === id) state.activeToolId = null
    await load()
    useUi().toast(t('tools.uninstalled'), 'success')
  } catch (error) {
    useUi().handleError(error, t('error.uninstallPlugin'))
  }
}

async function open(id: string): Promise<void> {
  if (state.items.length === 0) await load()
  const tool = state.items.find((item) => item.id === id)
  if (!tool) {
    useUi().toast(t('tools.notFound'), 'error')
    return
  }
  if (!tool.enabled) {
    useUi().toast(t('tools.disabled', { name: tool.name }), 'info')
    return
  }
  sessionFor(tool)
  state.activeToolId = tool.id
}

function close(): void {
  state.activeToolId = null
}

/** 订阅主进程的插件变化；返回取消订阅函数 */
function subscribe(listener: () => void): () => void {
  return window.desktop.plugins.onChanged(listener)
}

export function useTools() {
  return {
    state,
    activeTool,
    sessionFor,
    saveResult,
    load,
    installFolder,
    installZip,
    setEnabled,
    uninstall,
    open,
    close,
    subscribe
  }
}
