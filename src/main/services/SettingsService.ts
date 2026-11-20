import type { AppSettings, LanguageSetting, ThemeMode, UiScale } from '../../shared/types'
import { CLIPBOARD_HISTORY, HOME_LINK_LIMIT, SEARCH_DEBOUNCE, SEARCH_RESULT_LIMIT } from '../../shared/types'
import { LOCALES } from '../../shared/i18n'
import {
  DEFAULT_SHORTCUTS,
  isValidAccelerator,
  sameAccelerator
} from '../../shared/accelerator'
import { invalidArgument } from '../errors'
import { t } from '../i18n'
import type { SettingRepository } from '../repositories/SettingRepository'
import { clampHistoryLimit } from './ClipboardService'
import { normalizeOpenWithRules, parseOpenWithRules } from './openWith'

const THEMES: ThemeMode[] = ['light', 'dark', 'dracula', 'system']
const UI_SCALES: UiScale[] = ['small', 'normal', 'large', 'x-large']

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'system',
  theme: 'system',
  uiScale: 'normal',
  showHiddenFiles: false,
  confirmDelete: true,
  trayEnabled: true,
  globalShortcutsEnabled: true,
  toggleShortcut: DEFAULT_SHORTCUTS.toggle,
  searchShortcut: DEFAULT_SHORTCUTS.search,
  clipboardHistoryLimit: CLIPBOARD_HISTORY.default,
  searchDebounceMs: SEARCH_DEBOUNCE.default,
  searchResultLimit: SEARCH_RESULT_LIMIT.default,
  homeLinkLimit: HOME_LINK_LIMIT.default,
  closeSearchOnHide: true,
  clearSearchOnClose: false,
  searchInMainWindow: false,
  openWithRules: []
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value === 'true'
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 数值设置收敛到 [min, max]，四舍五入到整数 */
function clampTo(value: number, range: { readonly min: number; readonly max: number; readonly default: number }): number {
  if (!Number.isFinite(value)) return range.default
  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}

/** 存坏的 accelerator（手工改库等）读回时回退默认值，避免注册时炸掉 */
function readAccelerator(value: string | undefined, fallback: string): string {
  return value && isValidAccelerator(value) ? value : fallback
}

/** 存坏的语言（手工改库等）读回时回退「跟随系统」 */
function readLanguage(value: string | undefined): LanguageSetting {
  if (value === 'system') return 'system'
  return LOCALES.includes(value as (typeof LOCALES)[number]) ? (value as LanguageSetting) : 'system'
}

/** 设置以 key-value 形式存库，读取时补默认值 */
export class SettingsService {
  constructor(private readonly settings: SettingRepository) {}

  get(): AppSettings {
    const stored = this.settings.findAll()
    return {
      language: readLanguage(stored.language),
      theme: THEMES.includes(stored.theme as ThemeMode) ? (stored.theme as ThemeMode) : DEFAULT_SETTINGS.theme,
      uiScale: UI_SCALES.includes(stored.uiScale as UiScale) ? (stored.uiScale as UiScale) : DEFAULT_SETTINGS.uiScale,
      showHiddenFiles: readBoolean(stored.showHiddenFiles, DEFAULT_SETTINGS.showHiddenFiles),
      confirmDelete: readBoolean(stored.confirmDelete, DEFAULT_SETTINGS.confirmDelete),
      trayEnabled: readBoolean(stored.trayEnabled, DEFAULT_SETTINGS.trayEnabled),
      globalShortcutsEnabled: readBoolean(stored.globalShortcutsEnabled, DEFAULT_SETTINGS.globalShortcutsEnabled),
      toggleShortcut: readAccelerator(stored.toggleShortcut, DEFAULT_SETTINGS.toggleShortcut),
      searchShortcut: readAccelerator(stored.searchShortcut, DEFAULT_SETTINGS.searchShortcut),
      clipboardHistoryLimit: clampHistoryLimit(
        readNumber(stored.clipboardHistoryLimit, DEFAULT_SETTINGS.clipboardHistoryLimit)
      ),
      searchDebounceMs: clampTo(
        readNumber(stored.searchDebounceMs, DEFAULT_SETTINGS.searchDebounceMs),
        SEARCH_DEBOUNCE
      ),
      searchResultLimit: clampTo(
        readNumber(stored.searchResultLimit, DEFAULT_SETTINGS.searchResultLimit),
        SEARCH_RESULT_LIMIT
      ),
      homeLinkLimit: clampTo(
        readNumber(stored.homeLinkLimit, DEFAULT_SETTINGS.homeLinkLimit),
        HOME_LINK_LIMIT
      ),
      closeSearchOnHide: readBoolean(stored.closeSearchOnHide, DEFAULT_SETTINGS.closeSearchOnHide),
      clearSearchOnClose: readBoolean(stored.clearSearchOnClose, DEFAULT_SETTINGS.clearSearchOnClose),
      searchInMainWindow: readBoolean(stored.searchInMainWindow, DEFAULT_SETTINGS.searchInMainWindow),
      openWithRules: parseOpenWithRules(stored.openWithRules)
    }
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const values: Record<string, string> = {}

    if (patch.language !== undefined) {
      if (patch.language !== 'system' && !LOCALES.includes(patch.language)) {
        throw invalidArgument(t('svc.unknownLanguage', { value: patch.language }))
      }
      values.language = patch.language
    }
    if (patch.theme !== undefined) {
      if (!THEMES.includes(patch.theme)) throw invalidArgument(t('svc.unknownTheme', { value: patch.theme }))
      values.theme = patch.theme
    }
    if (patch.uiScale !== undefined) {
      if (!UI_SCALES.includes(patch.uiScale)) throw invalidArgument(t('svc.unknownUiScale', { value: patch.uiScale }))
      values.uiScale = patch.uiScale
    }
    if (patch.showHiddenFiles !== undefined) {
      values.showHiddenFiles = String(Boolean(patch.showHiddenFiles))
    }
    if (patch.confirmDelete !== undefined) {
      values.confirmDelete = String(Boolean(patch.confirmDelete))
    }
    if (patch.trayEnabled !== undefined) {
      values.trayEnabled = String(Boolean(patch.trayEnabled))
    }
    if (patch.globalShortcutsEnabled !== undefined) {
      values.globalShortcutsEnabled = String(Boolean(patch.globalShortcutsEnabled))
    }
    if (patch.toggleShortcut !== undefined) {
      if (!isValidAccelerator(patch.toggleShortcut)) {
        throw invalidArgument(t('svc.invalidShortcut'))
      }
      values.toggleShortcut = patch.toggleShortcut
    }
    if (patch.searchShortcut !== undefined) {
      if (!isValidAccelerator(patch.searchShortcut)) {
        throw invalidArgument(t('svc.invalidShortcut'))
      }
      values.searchShortcut = patch.searchShortcut
    }
    if (patch.clipboardHistoryLimit !== undefined) {
      if (!Number.isFinite(Number(patch.clipboardHistoryLimit))) {
        throw invalidArgument(t('svc.clipboardLimitNumber'))
      }
      // 超范围不报错，直接收敛到合理区间
      values.clipboardHistoryLimit = String(clampHistoryLimit(Number(patch.clipboardHistoryLimit)))
    }
    if (patch.searchDebounceMs !== undefined) {
      if (!Number.isFinite(Number(patch.searchDebounceMs))) {
        throw invalidArgument(t('svc.debounceNumber'))
      }
      // 超范围不报错，直接收敛到合理区间
      values.searchDebounceMs = String(clampTo(Number(patch.searchDebounceMs), SEARCH_DEBOUNCE))
    }
    if (patch.searchResultLimit !== undefined) {
      if (!Number.isFinite(Number(patch.searchResultLimit))) {
        throw invalidArgument(t('svc.searchLimitNumber'))
      }
      // 超范围不报错，直接收敛到合理区间
      values.searchResultLimit = String(clampTo(Number(patch.searchResultLimit), SEARCH_RESULT_LIMIT))
    }
    if (patch.homeLinkLimit !== undefined) {
      if (!Number.isFinite(Number(patch.homeLinkLimit))) {
        throw invalidArgument(t('svc.homeLinkLimitNumber'))
      }
      values.homeLinkLimit = String(clampTo(Number(patch.homeLinkLimit), HOME_LINK_LIMIT))
    }
    if (patch.closeSearchOnHide !== undefined) {
      values.closeSearchOnHide = String(Boolean(patch.closeSearchOnHide))
    }
    if (patch.clearSearchOnClose !== undefined) {
      values.clearSearchOnClose = String(Boolean(patch.clearSearchOnClose))
    }
    if (patch.searchInMainWindow !== undefined) {
      values.searchInMainWindow = String(Boolean(patch.searchInMainWindow))
    }
    if (patch.openWithRules !== undefined) {
      values.openWithRules = JSON.stringify(normalizeOpenWithRules(patch.openWithRules))
    }

    if (Object.keys(values).length > 0) {
      // 两个全局快捷键撞车的话，后面注册的那个永远收不到，直接在写库前拒绝
      const nextToggle = patch.toggleShortcut ?? this.get().toggleShortcut
      const nextSearch = patch.searchShortcut ?? this.get().searchShortcut
      if (sameAccelerator(nextToggle, nextSearch)) {
        throw invalidArgument(t('svc.shortcutConflictSame'))
      }
      this.settings.setMany(values)
    }
    return this.get()
  }
}
