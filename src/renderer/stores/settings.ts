import { reactive } from 'vue'
import type { AppSettings, PathInfo, UiScale } from '@shared/types'
import { resolveLocale } from '@shared/i18n'
import { setLocale, t } from '../i18n'
import { applyVuetifyLocale } from '../plugins/vuetify'
import { useUi } from './ui'

/** 界面大小档位 → 窗口缩放比例 */
const UI_SCALE_FACTOR: Record<UiScale, number> = {
  small: 0.9,
  normal: 1,
  large: 1.1,
  'x-large': 1.25
}

export function uiScaleFactor(scale: UiScale | undefined): number {
  return scale ? UI_SCALE_FACTOR[scale] ?? 1 : 1
}

const state = reactive({
  settings: null as AppSettings | null,
  paths: null as PathInfo | null,
  loading: false
})

async function load(): Promise<void> {
  state.loading = true
  try {
    state.settings = await window.desktop.settings.get()
    useUi().setTheme(state.settings.theme)
    applyUiScale(state.settings.uiScale)
    applyLanguage(state.settings.language)
    state.paths = await window.desktop.system.paths()
  } catch (error) {
    useUi().handleError(error, t('error.readSettings'))
  } finally {
    state.loading = false
  }
}

async function update(patch: Partial<AppSettings>): Promise<boolean> {
  try {
    state.settings = await window.desktop.settings.update(patch)
    useUi().setTheme(state.settings.theme)
    applyUiScale(state.settings.uiScale)
    applyLanguage(state.settings.language)
    return true
  } catch (error) {
    useUi().handleError(error, t('error.saveSettings'))
    return false
  }
}

/** 语言：设置里选「跟随系统」时按浏览器语言解析 */
function applyLanguage(setting: AppSettings['language']): void {
  const locale = setting === 'system' ? resolveLocale(navigator.language) : setting
  setLocale(locale)
  applyVuetifyLocale(locale)
}

/** 界面大小交给窗口缩放，主进程做范围兜底 */
function applyUiScale(scale: UiScale): void {
  void window.desktop.window.setZoom(uiScaleFactor(scale)).catch(() => {
    // 缩放失败不影响其它功能，忽略即可
  })
}

/** 未加载完成时的默认值，避免 UI 里到处判空 */
function showHidden(): boolean {
  return state.settings?.showHiddenFiles ?? false
}

function confirmDelete(): boolean {
  return state.settings?.confirmDelete ?? true
}

export function useSettings() {
  return { state, load, update, showHidden, confirmDelete }
}
