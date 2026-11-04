import { reactive } from 'vue'
import type { ThemeMode } from '@shared/types'
import { t } from '../i18n'
import { vuetify } from '../plugins/vuetify'

export type ViewName = 'workspace' | 'desktop' | 'todo' | 'notes' | 'clipboard' | 'rules' | 'tools' | 'settings'
export type ToastType = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  type: ToastType
  message: string
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export interface PromptOptions {
  title: string
  label?: string
  value?: string
  placeholder?: string
  confirmText?: string
}

export type DialogState =
  | ({ kind: 'confirm' } & ConfirmOptions & { resolve: (value: boolean) => void })
  | ({ kind: 'prompt' } & PromptOptions & { resolve: (value: string | null) => void })
  | null

const state = reactive({
  view: 'workspace' as ViewName,
  dialog: null as DialogState,
  toasts: [] as Toast[],
  /** 全局搜索（Ctrl/Cmd + K）是浮动弹框，不是页面 */
  globalSearch: false,
  /**
   * 内容区要选中 / 高亮某个路径（搜索、快捷入口的「←」用）。
   * FileBrowser 挂载或重新加载后消费一次，选中对应文件并滚进可视区域。
   */
  revealPath: null as string | null,
  /**
   * 数据刷新令牌：撤销、执行整理规则后会 +1，
   * 文件列表监听它重新读取当前目录（不依赖文件监听是否可用）。
   */
  refreshToken: 0
})

let toastSeq = 0

function toast(message: string, type: ToastType = 'info'): void {
  const id = ++toastSeq
  state.toasts.push({ id, type, message })
  window.setTimeout(() => dismissToast(id), type === 'error' ? 7000 : 3500)
}

function dismissToast(id: number): void {
  const index = state.toasts.findIndex((item) => item.id === id)
  if (index >= 0) state.toasts.splice(index, 1)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** 统一兜底错误提示，业务层不用每个 catch 都写 toast */
function handleError(error: unknown, fallback?: string): void {
  const message = error instanceof Error ? error.message : ''
  toast(message || fallback || t('error.generic'), 'error')
}

function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    state.dialog = {
      kind: 'confirm',
      confirmText: t('common.ok'),
      cancelText: t('common.cancel'),
      danger: false,
      ...options,
      resolve
    }
  })
}

function promptInput(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    state.dialog = { kind: 'prompt', value: '', confirmText: t('common.ok'), ...options, resolve }
  })
}

function closeDialog(result: boolean | string | null): void {
  const dialog = state.dialog
  state.dialog = null
  if (!dialog) return
  if (dialog.kind === 'confirm') dialog.resolve(Boolean(result))
  else dialog.resolve(typeof result === 'string' ? result : null)
}

/** 主题交给 Vuetify（'system' 会跟随系统深浅色） */
function setTheme(mode: ThemeMode): void {
  void vuetify.theme.change(mode)
}

function openGlobalSearch(): void {
  state.globalSearch = true
}

function closeGlobalSearch(): void {
  state.globalSearch = false
}

/** 请求内容区把某个路径选中 / 高亮出来（消费方是 FileBrowser） */
function requestReveal(path: string): void {
  state.revealPath = path
}

/** 数据在页面之外被改动（撤销、整理规则执行）后，让文件列表重新读取 */
function requestRefresh(): void {
  state.refreshToken += 1
}

export function useUi() {
  return {
    state,
    toast,
    dismissToast,
    errorMessage,
    handleError,
    confirm,
    promptInput,
    closeDialog,
    setTheme,
    openGlobalSearch,
    closeGlobalSearch,
    requestReveal,
    requestRefresh,
    setView: (view: ViewName) => {
      state.view = view
    }
  }
}
