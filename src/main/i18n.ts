import { DEFAULT_LOCALE, resolveLocale, translate, type Locale, type MessageParams } from '../shared/i18n'
import type { LanguageSetting } from '../shared/types'

/**
 * 主进程当前语言（托盘、窗口标题、错误信息等用）。
 * 渲染进程切换语言后由 SettingsService 通知这里更新。
 */
let locale: Locale = DEFAULT_LOCALE

export function setMainLocale(next: Locale): void {
  locale = next
}

export function mainLocale(): Locale {
  return locale
}

export function t(key: string, params?: MessageParams): string {
  return translate(locale, key, params)
}

/** 按设置里的语言（'system' 用系统语言）切换主进程语言 */
export function applyLanguageSetting(setting: LanguageSetting, systemLocale: string): void {
  setMainLocale(setting === 'system' ? resolveLocale(systemLocale) : setting)
}

export { resolveLocale }
