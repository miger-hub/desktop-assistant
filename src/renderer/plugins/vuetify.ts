import { createVuetify } from 'vuetify'
import { en as vuetifyEn, zhHans, zhHant } from 'vuetify/locale'
import type { Locale } from '@shared/i18n'
import {
  VApp,
  VBtn,
  VBtnToggle,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VChip,
  VChipGroup,
  VDialog,
  VEmptyState,
  VIcon,
  VKbd,
  VList,
  VListItem,
  VListItemSubtitle,
  VListItemTitle,
  VProgressLinear,
  VSelect,
  VSpacer,
  VSwitch,
  VTable,
  VTextField,
  VTextarea
} from 'vuetify/components'

/**
 * 三套主题都定义在这里：
 * - light 用 Vuetify 官方浅色调色板，额外加一点底色区分面板
 * - dark 是"柔和深色"：背景 #23262f + 面板 #2b2f39，明确不用近黑色，
 *   两者差一档，切换主题后层次看得出来
 * - dracula 用官方色板（见下方注释），面板比背景亮一档、描边用 Current Line
 * defaultTheme 用 'system'，跟随系统深浅色；设置页切换时调用 theme.change()。
 */
const light = {
  dark: false,
  colors: {
    // 面板 / 卡片分层用，官方 light 是纯白，这里保留一点底色区分
    background: '#f5f6f8',
    surface: '#ffffff',
    // 开关关闭态的滑轨色（Vuetify 官方 light 值），太浅会和白色底糊在一起
    'surface-variant': '#424242',
    'surface-bright': '#ffffff',
    'surface-light': '#eeeeee',
    primary: '#1867c0',
    'primary-darken-1': '#1f5592',
    secondary: '#48a9a6',
    success: '#4caf50',
    warning: '#fb8c00',
    error: '#b00020',
    info: '#2196f3',
    'on-background': '#1d2129',
    'on-surface': '#1d2129',
    'on-surface-variant': '#5f6672'
  }
}

const dark = {
  dark: true,
  colors: {
    // 内容区不纯黑，和面板（surface）差一档，避免整块发黑
    background: '#23262f',
    surface: '#2b2f39',
    'surface-light': '#383d49',
    'surface-variant': '#454b58', // 开关滑轨
    'surface-bright': '#c6cbd6', // 开关滑块，要比滑轨亮才看得出来
    primary: '#2196f3',
    'primary-darken-1': '#277cc1',
    secondary: '#54b6b2',
    success: '#5cc98a',
    warning: '#e5a95c',
    error: '#ef6f75',
    info: '#2196f3',
    'on-background': '#dde1e8',
    'on-surface': '#dde1e8',
    'on-surface-variant': '#a7aebb'
  }
}

/**
 * Dracula 主题：配色取自 https://draculatheme.com 的官方色板。
 * 属于深色主题，需要在设置里显式选择（'system' 只会在 light / dark 之间切换）。
 */
const dracula = {
  dark: true,
  colors: {
    background: '#282a36', // Background：内容区就是 Dracula 背景
    surface: '#343746', // 面板比背景亮一档（Dracula 紫灰调），能看出分层
    'surface-variant': '#44475a', // Current Line
    'surface-bright': '#f8f8f2', // Foreground：开关滑块
    'surface-light': '#44475a',
    primary: '#bd93f9', // Purple
    'primary-darken-1': '#a679f0',
    secondary: '#ff79c6', // Pink
    success: '#50fa7b', // Green
    warning: '#ffb86c', // Orange
    error: '#ff5555', // Red
    info: '#8be9fd', // Cyan
    'on-background': '#f8f8f2',
    'on-surface': '#f8f8f2',
    'on-surface-variant': '#6272a4' // Comment：弱化文字用
  },
  variables: {
    // 描边用 Dracula 的 Current Line，分区更清楚（默认是低透明度白色）
    'border-color': '#44475a',
    'border-opacity': 1
  }
}

/**
 * Vuetify 4 不会自动注册组件，这里显式列出用到的部分，
 * 避免把整套组件打进产物。
 */
export const vuetify = createVuetify({
  locale: {
    locale: 'zhHans',
    fallback: 'en',
    messages: { zhHans, zhHant, en: vuetifyEn }
  },
  components: {
    VApp,
    VBtn,
    VBtnToggle,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VChipGroup,
    VDialog,
    VEmptyState,
    VIcon,
    VKbd,
    VList,
    VListItem,
    VListItemSubtitle,
    VListItemTitle,
    VProgressLinear,
    VSelect,
    VSpacer,
    VSwitch,
    VTable,
    VTextField,
    VTextarea
  },
  theme: {
    defaultTheme: 'system',
    themes: { light, dark, dracula }
  },
  defaults: {
    VBtn: { variant: 'flat' },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VTextarea: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VCard: { variant: 'outlined' }
  }
})

/** 把应用语言同步到 Vuetify 内置组件文案（下拉框空态、筛选提示等） */
export function applyVuetifyLocale(locale: Locale): void {
  vuetify.locale.current.value = locale === 'zh-TW' ? 'zhHant' : locale === 'en' ? 'en' : 'zhHans'
}
