import { reactive } from 'vue'
import {
  DEFAULT_LOCALE,
  resolveLocale,
  translate,
  type Locale,
  type MessageParams
} from '@shared/i18n'

/**
 * 渲染进程的当前语言。`t()` 读取的是这个响应式对象，
 * 所以语言一变、用到 t() 的组件会跟着重渲染。
 */
const state = reactive({ locale: DEFAULT_LOCALE as Locale })

export function setLocale(locale: Locale): void {
  state.locale = locale
  // 让 :lang 伪类、拼写检查、字体回退按当前语言走
  document.documentElement.setAttribute('lang', locale)
}

/** 从系统语言初始化（设置里选「跟随系统」时用） */
export function setLocaleFromSystem(): void {
  setLocale(resolveLocale(navigator.language))
}

export function currentLocale(): Locale {
  return state.locale
}

/** 组件 / store 里统一用这个取文案；读响应式 locale，语言切换会自动刷新 */
export function t(key: string, params?: MessageParams): string {
  return translate(state.locale, key, params)
}

export function useI18n() {
  return { t, locale: state, setLocale, setLocaleFromSystem }
}
