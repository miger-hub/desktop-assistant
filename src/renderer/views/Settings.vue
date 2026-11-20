<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AppInfo, AppSettings, OpenWithRule } from '@shared/types'
import { CLIPBOARD_HISTORY, HOME_LINK_LIMIT, SEARCH_DEBOUNCE, SEARCH_RESULT_LIMIT } from '@shared/types'
import {
  DEFAULT_SHORTCUTS,
  formatAccelerator
} from '@shared/accelerator'
import type { ThemeMode, UiScale } from '@shared/types'
import ShortcutRecorder from '../components/ShortcutRecorder.vue'
import { LOCALES, type Locale } from '@shared/i18n'
import { t } from '../i18n'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'

const ui = useUi()
const settings = useSettings()

const appInfo = ref<AppInfo | null>(null)
const backupBusy = ref(false)
const shortcutBusy = ref(false)
const openWithBusy = ref(false)
/** 「打开方式」的编辑草稿：改完点「保存」才写库，避免每个按键都写一次 */
const openWithDraft = ref<OpenWithRule[]>([])

const themes = computed<Array<{ value: ThemeMode; label: string }>>(() => [
  { value: 'system', label: t('settings.themeSystem') },
  { value: 'light', label: t('settings.themeLight') },
  { value: 'dark', label: t('settings.themeDark') },
  { value: 'dracula', label: t('settings.themeDracula') }
])

const uiScales = computed<Array<{ value: UiScale; label: string }>>(() => [
  { value: 'small', label: t('settings.uiScaleSmall') },
  { value: 'normal', label: t('settings.uiScaleNormal') },
  { value: 'large', label: t('settings.uiScaleLarge') },
  { value: 'x-large', label: t('settings.uiScaleXLarge') }
])

const languageOptions = computed(() => [
  { value: 'system', title: t('settings.languageSystem') },
  ...LOCALES.map((locale: Locale) => ({ value: locale, title: t(`localeName.${locale}`) }))
])

/**
 * 剪贴板历史条数：给几档够用的（上限 50 条，再多既没必要也占内存）。
 * 库里存了档位以外的值时也把它显示出来，避免下拉框空白。
 */
const clipboardLimits = computed(() => {
  const current = settings.state.settings?.clipboardHistoryLimit
  const values = [5, 10, 20, 30, CLIPBOARD_HISTORY.max, current].filter(
    (value): value is number =>
      typeof value === 'number' && value >= CLIPBOARD_HISTORY.min && value <= CLIPBOARD_HISTORY.max
  )
  return [...new Set(values)]
    .sort((left, right) => left - right)
    .map((value) => ({ value, label: t('settings.countValue', { count: value }) }))
})

/**
 * 搜索防抖延时：连续输入时等多久再搜索。
 * 库里存了档位以外的值时也把它显示出来，避免下拉框空白。
 */
const searchDebounces = computed(() => {
  const current = settings.state.settings?.searchDebounceMs
  const values = [0, 200, 300, 500, SEARCH_DEBOUNCE.max, current].filter(
    (value): value is number =>
      typeof value === 'number' && value >= SEARCH_DEBOUNCE.min && value <= SEARCH_DEBOUNCE.max
  )
  return [...new Set(values)]
    .sort((left, right) => left - right)
    .map((value) => ({
      value,
      label: value === 0 ? t('settings.debounceNone') : t('settings.milliseconds', { value })
    }))
})

/** 搜索结果条数：默认展示这些，更多的在搜索弹框里手动「展开」 */
const searchResultLimits = computed(() => {
  const current = settings.state.settings?.searchResultLimit
  const values = [10, 20, 30, 50, SEARCH_RESULT_LIMIT.max, current].filter(
    (value): value is number =>
      typeof value === 'number' && value >= SEARCH_RESULT_LIMIT.min && value <= SEARCH_RESULT_LIMIT.max
  )
  return [...new Set(values)]
    .sort((left, right) => left - right)
    .map((value) => ({ value, label: t('settings.countValue', { count: value }) }))
})

/** 首页常用链接数量：默认 5 个，最多 20 个 */
const homeLinkLimits = computed(() => {
  const current = settings.state.settings?.homeLinkLimit
  const values = [3, 5, 8, 10, 15, HOME_LINK_LIMIT.max, current].filter(
    (value): value is number =>
      typeof value === 'number' && value >= HOME_LINK_LIMIT.min && value <= HOME_LINK_LIMIT.max
  )
  return [...new Set(values)]
    .sort((left, right) => left - right)
    .map((value) => ({ value, label: t('settings.countValue', { count: value }) }))
})


/** 快捷键映射表：与 App.vue / FileBrowser.vue 的实际绑定保持一致 */
const shortcuts = computed<Array<{ keys: string[]; action: string }>>(() => [
  { keys: ['Ctrl/Cmd', '1~8'], action: t('settings.shortcutSwitch') },
  { keys: ['Ctrl/Cmd', ','], action: t('settings.shortcutSettings') },
  { keys: ['Ctrl/Cmd', 'K'], action: t('settings.shortcutSearch') },
  { keys: ['Ctrl/Cmd', '+ / - / 0'], action: t('settings.shortcutZoom') },
  { keys: ['Ctrl/Cmd', 'F'], action: t('settings.shortcutFilter') },
  { keys: ['Ctrl/Cmd', '←↑→↓'], action: t('settings.shortcutPanels') },
  { keys: ['Ctrl/Cmd', 'Z'], action: t('settings.shortcutUndo') },
  { keys: ['↑', '↓'], action: t('settings.shortcutSidebar') },
  { keys: ['Shift', '↑/↓'], action: t('settings.shortcutRangeSelect') },
  { keys: ['←', '→'], action: t('settings.shortcutLeftRight') },
  { keys: ['Home', 'End'], action: t('settings.shortcutHomeEnd') },
  { keys: ['Ctrl/Cmd', 'A'], action: t('settings.shortcutSelectAll') },
  { keys: ['Enter'], action: t('settings.shortcutEnter') },
  { keys: ['F2'], action: t('settings.shortcutRename') },
  { keys: ['Delete'], action: t('settings.shortcutTrash') },
  { keys: ['F5'], action: t('settings.shortcutRefresh') },
  { keys: ['Esc'], action: t('settings.shortcutEsc') }
])

/** 两个全局快捷键的当前绑定（可以在上面改，所以这里动态显示） */
const globalShortcutRows = computed(() =>
  [
    {
      keys: formatAccelerator(settings.state.settings?.toggleShortcut ?? DEFAULT_SHORTCUTS.toggle).split(' + '),
      action: t('settings.shortcutToggleGlobal')
    },
    {
      keys: formatAccelerator(settings.state.settings?.searchShortcut ?? DEFAULT_SHORTCUTS.search).split(' + '),
      action: t('settings.shortcutSearchGlobal')
    }
  ].filter((row) => row.keys.length > 0)
)

async function openPath(target: string): Promise<void> {
  try {
    await window.desktop.files.open(target)
  } catch (error) {
    ui.handleError(error, t('error.open'))
  }
}

async function openDataDir(): Promise<void> {
  try {
    await window.desktop.system.openDataDir()
  } catch (error) {
    ui.handleError(error, t('error.openDataDir'))
  }
}

/** 手动备份：数据库在运行中，用 VACUUM INTO 生成一致快照 */
async function backupDatabase(): Promise<void> {
  backupBusy.value = true
  try {
    const result = await window.desktop.system.backupDatabase()
    ui.toast(t('settings.backupDone', { path: result.path }), 'success')
  } catch (error) {
    ui.handleError(error, t('error.backup'))
  } finally {
    backupBusy.value = false
  }
}

async function openBackupDir(): Promise<void> {
  try {
    await window.desktop.system.openBackupDir()
  } catch (error) {
    ui.handleError(error, t('error.openBackupDir'))
  }
}

/** 导出待办为 Markdown（不含文件内容，只有标题/状态/截止日期/描述） */
async function exportTodos(): Promise<void> {
  try {
    const result = await window.desktop.system.exportTodos()
    if (result) ui.toast(t('settings.exportDone', { count: result.count, path: result.path }), 'success')
  } catch (error) {
    ui.handleError(error, t('error.exportTodos'))
  }
}

/** 改设置后顺手刷新系统信息：全局快捷键开关会改变注册结果 */
async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  await settings.update(patch)
  await refreshInfo()
}

/** 切语言：设置里存的是 'system' 或具体语言 */
async function updateLanguage(value: unknown): Promise<void> {
  await updateSettings({ language: value as AppSettings['language'] })
}

async function refreshInfo(): Promise<void> {
  try {
    appInfo.value = await window.desktop.system.info()
  } catch (error) {
    ui.handleError(error, t('error.readDbInfo'))
  }
}

/** 重新注册一遍全局快捷键：用户清掉占用按键的程序后可以自己检测，不用重启 */
async function recheckShortcuts(): Promise<void> {
  shortcutBusy.value = true
  try {
    const status = await window.desktop.system.recheckShortcuts()
    if (appInfo.value) appInfo.value = { ...appInfo.value, globalShortcuts: status }

    const failed = status.entries.filter((entry) => !entry.registered)
    if (!status.enabled) ui.toast(t('settings.shortcutsEnabledOff'))
    else if (failed.length === 0) ui.toast(t('settings.shortcutsAllOk'), 'success')
    else ui.toast(t('settings.shortcutsStillFailing', { keys: failed.map((entry) => entry.keys).join(' / ') }), 'error')
  } catch (error) {
    ui.handleError(error, t('error.recheck'))
  } finally {
    shortcutBusy.value = false
  }
}

/** 把设置里的「打开方式」拷成可编辑草稿 */
function syncOpenWithDraft(): void {
  openWithDraft.value = (settings.state.settings?.openWithRules ?? []).map((rule) => ({ ...rule }))
}

function addOpenWith(): void {
  openWithDraft.value.push({ extension: '', program: '' })
}

function removeOpenWith(index: number): void {
  openWithDraft.value.splice(index, 1)
}

/** 选一个程序填进这一行（文本输入也可以，方便直接粘贴路径） */
async function pickOpenWithProgram(index: number): Promise<void> {
  try {
    const picked = await window.desktop.files.pickFiles({ title: t('settings.pickProgram') })
    if (picked[0]) openWithDraft.value[index].program = picked[0]
  } catch (error) {
    ui.handleError(error, t('error.chooseProgram'))
  }
}

async function saveOpenWith(): Promise<void> {
  openWithBusy.value = true
  try {
    // IPC 走结构化克隆：草稿是 Vue 的响应式代理，不能直接传，先拍平成普通对象
    const rules = openWithDraft.value.map((rule) => ({ extension: rule.extension, program: rule.program }))
    const ok = await settings.update({ openWithRules: rules })
    if (ok) {
      // 用主进程归一化（去点、小写、去重）后的结果回填草稿
      syncOpenWithDraft()
      ui.toast(t('settings.openWithSaved'), 'success')
    }
  } finally {
    openWithBusy.value = false
  }
}

onMounted(async () => {
  if (!settings.state.settings) await settings.load()
  syncOpenWithDraft()
  await refreshInfo()
})
</script>

<template>
  <section class="view">
    <div class="view__header">
      <div class="view__title"><span>{{ t('settings.title') }}</span></div>
    </div>

    <div class="view__body">
      <v-card class="settings__card">
        <v-card-title class="settings__card-title">{{ t('settings.general') }}</v-card-title>
        <v-card-text class="stack">
          <v-select
            :model-value="settings.state.settings?.language ?? 'system'"
            :items="languageOptions"
            item-title="title"
            item-value="value"
            :label="t('settings.language')"
            density="comfortable"
            @update:model-value="updateLanguage($event)"
          />
          <v-select
            :model-value="settings.state.settings?.theme ?? 'system'"
            :items="themes"
            item-title="label"
            item-value="value"
            :label="t('settings.theme')"
            density="comfortable"
            @update:model-value="settings.update({ theme: $event as ThemeMode })"
          />
          <v-select
            :model-value="settings.state.settings?.uiScale ?? 'normal'"
            :items="uiScales"
            item-title="label"
            item-value="value"
            :label="t('settings.uiScale')"
            density="comfortable"
            @update:model-value="settings.update({ uiScale: $event as UiScale })"
          />
          <v-switch
            :model-value="settings.showHidden()"
            color="primary"
            :label="t('settings.showHidden')"
            hide-details
            @update:model-value="settings.update({ showHiddenFiles: Boolean($event) })"
          />
          <v-switch
            :model-value="settings.confirmDelete()"
            color="primary"
            :label="t('settings.confirmDelete')"
            hide-details
            @update:model-value="settings.update({ confirmDelete: Boolean($event) })"
          />
          <v-switch
            :model-value="settings.state.settings?.trayEnabled ?? true"
            color="primary"
            :label="t('settings.tray')"
            hide-details
            @update:model-value="updateSettings({ trayEnabled: Boolean($event) })"
          />
          <v-switch
            :model-value="settings.state.settings?.globalShortcutsEnabled ?? true"
            color="primary"
            :label="t('settings.globalShortcuts')"
            hide-details
            @update:model-value="updateSettings({ globalShortcutsEnabled: Boolean($event) })"
          />
          <v-select
            :model-value="settings.state.settings?.clipboardHistoryLimit ?? CLIPBOARD_HISTORY.default"
            :items="clipboardLimits"
            item-title="label"
            item-value="value"
            :label="t('settings.clipboardLimit')"
            density="comfortable"
            :hint="t('settings.clipboardLimitHint')"
            persistent-hint
            @update:model-value="updateSettings({ clipboardHistoryLimit: Number($event) })"
          />
          <v-select
            :model-value="settings.state.settings?.searchDebounceMs ?? SEARCH_DEBOUNCE.default"
            :items="searchDebounces"
            item-title="label"
            item-value="value"
            :label="t('settings.searchDebounce')"
            density="comfortable"
            :hint="t('settings.searchDebounceHint')"
            persistent-hint
            @update:model-value="updateSettings({ searchDebounceMs: Number($event) })"
          />
          <v-select
            :model-value="settings.state.settings?.searchResultLimit ?? SEARCH_RESULT_LIMIT.default"
            :items="searchResultLimits"
            item-title="label"
            item-value="value"
            :label="t('settings.searchLimit')"
            density="comfortable"
            :hint="t('settings.searchLimitHint')"
            persistent-hint
            @update:model-value="updateSettings({ searchResultLimit: Number($event) })"
          />
          <v-select
            :model-value="settings.state.settings?.homeLinkLimit ?? HOME_LINK_LIMIT.default"
            :items="homeLinkLimits"
            item-title="label"
            item-value="value"
            :label="t('settings.homeLinkLimit')"
            density="comfortable"
            :hint="t('settings.homeLinkLimitHint')"
            persistent-hint
            @update:model-value="updateSettings({ homeLinkLimit: Number($event) })"
          />
          <v-switch
            :model-value="settings.state.settings?.closeSearchOnHide ?? true"
            color="primary"
            :label="t('settings.closeSearchOnHide')"
            hide-details
            @update:model-value="updateSettings({ closeSearchOnHide: Boolean($event) })"
          />
          <v-switch
            :model-value="settings.state.settings?.clearSearchOnClose ?? false"
            color="primary"
            :label="t('settings.clearSearchOnClose')"
            hide-details
            @update:model-value="updateSettings({ clearSearchOnClose: Boolean($event) })"
          />
          <v-switch
            :model-value="settings.state.settings?.searchInMainWindow ?? false"
            color="primary"
            :label="t('settings.searchInMainWindow')"
            :hint="t('settings.searchInMainWindowHint')"
            persistent-hint
            @update:model-value="updateSettings({ searchInMainWindow: Boolean($event) })"
          />
          <ShortcutRecorder
            :label="t('settings.toggleShortcut')"
            :model-value="settings.state.settings?.toggleShortcut ?? DEFAULT_SHORTCUTS.toggle"
            @update:model-value="updateSettings({ toggleShortcut: $event })"
          />
          <ShortcutRecorder
            :label="t('settings.searchShortcut')"
            :model-value="settings.state.settings?.searchShortcut ?? DEFAULT_SHORTCUTS.search"
            @update:model-value="updateSettings({ searchShortcut: $event })"
          />
          <template v-if="appInfo?.globalShortcuts.enabled && appInfo.globalShortcuts.entries.length > 0">
            <p class="muted">{{ t('settings.shortcutStatus') }}</p>
            <v-table density="compact">
              <tbody>
                <tr v-for="entry in appInfo.globalShortcuts.entries" :key="entry.accelerator">
                  <td style="width: 190px">
                    <span class="shortcut">
                      <template v-for="(key, index) in entry.keys.split(' + ')" :key="key">
                        <span v-if="index > 0" class="shortcut__plus">+</span>
                        <v-kbd>{{ key }}</v-kbd>
                      </template>
                    </span>
                  </td>
                  <td class="muted">{{ entry.action }}</td>
                  <td :class="entry.registered ? 'shortcut-state' : 'dialog__warning'">
                    {{
                      entry.registered
                        ? t('settings.available')
                        : t('settings.unavailable', { reason: entry.reason ?? '' })
                    }}
                  </td>
                </tr>
              </tbody>
            </v-table>
            <p v-if="appInfo.globalShortcuts.entries.some((entry) => !entry.registered)" class="dialog__warning">
              {{ t('settings.shortcutFix') }}
            </p>
            <div>
              <v-btn
                size="small"
                variant="tonal"
                prepend-icon="mdi-refresh"
                :loading="shortcutBusy"
                @click="recheckShortcuts"
              >
                {{ t('settings.recheck') }}
              </v-btn>
            </div>
          </template>
        </v-card-text>
      </v-card>

      <v-card class="settings__card">
        <v-card-title class="settings__card-title">{{ t('settings.openWith') }}</v-card-title>
        <v-card-text class="stack">
          <p class="muted">{{ t('settings.openWithIntro') }}</p>
          <div v-for="(rule, index) in openWithDraft" :key="index" class="row open-with__row">
            <v-text-field
              v-model="rule.extension"
              :label="t('settings.openWithExtension')"
              placeholder="md / txt / *"
              density="comfortable"
              hide-details
              class="open-with__ext"
            />
            <v-text-field
              v-model="rule.program"
              :label="t('settings.openWithProgram')"
              :placeholder="t('settings.openWithProgramPlaceholder')"
              density="comfortable"
              hide-details
              class="open-with__program"
            />
            <v-btn size="small" variant="text" @click="pickOpenWithProgram(index)">{{ t('settings.pickProgram') }}</v-btn>
            <v-btn size="small" variant="text" color="error" @click="removeOpenWith(index)">
              {{ t('common.delete') }}
            </v-btn>
          </div>
          <p v-if="openWithDraft.length === 0" class="muted">{{ t('settings.openWithEmpty') }}</p>
          <div class="row">
            <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addOpenWith">
              {{ t('settings.addRule') }}
            </v-btn>
            <v-btn size="small" color="primary" :loading="openWithBusy" @click="saveOpenWith">
              {{ t('common.save') }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card class="settings__card">
        <v-card-title class="settings__card-title">
          <span>{{ t('settings.dataBackup') }}</span>
          <span class="row">
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-database-export-outline"
              :loading="backupBusy"
              @click="backupDatabase"
            >
              {{ t('settings.backupNow') }}
            </v-btn>
            <v-btn size="small" variant="text" @click="openBackupDir">{{ t('settings.openBackupDir') }}</v-btn>
            <v-btn size="small" variant="text" prepend-icon="mdi-file-export-outline" @click="exportTodos">
              {{ t('settings.exportTodos') }}
            </v-btn>
          </span>
        </v-card-title>
        <v-card-text>
          <v-table v-if="appInfo" density="compact">
            <tbody>
              <tr>
                <td class="muted" style="width: 110px">{{ t('settings.schemaVersion') }}</td>
                <td class="mono">v{{ appInfo.schemaVersion }}</td>
                <td />
              </tr>
              <tr>
                <td class="muted">{{ t('settings.database') }}</td>
                <td class="mono truncate" :title="appInfo.database">{{ appInfo.database }}</td>
                <td style="width: 78px">
                  <v-btn size="small" variant="text" @click="openPath(appInfo.database)">{{ t('settings.locate') }}</v-btn>
                </td>
              </tr>
              <tr>
                <td class="muted">{{ t('settings.backupDir') }}</td>
                <td class="mono truncate" :title="appInfo.backupDir">{{ appInfo.backupDir }}</td>
                <td style="width: 78px">
                  <v-btn size="small" variant="text" @click="openBackupDir">{{ t('common.open') }}</v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
          <p v-else class="muted">{{ t('settings.readingDb') }}</p>
          <p class="muted" style="margin: 8px 0 0">{{ t('settings.backupNote') }}</p>
        </v-card-text>
      </v-card>

      <v-card class="settings__card">
        <v-card-title class="settings__card-title">
          <span>{{ t('settings.systemPaths') }}</span>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-folder-open-outline" @click="openDataDir">
            {{ t('settings.openDataDir') }}
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-table v-if="settings.state.paths" density="compact">
            <tbody>
              <tr v-for="entry in Object.entries(settings.state.paths)" :key="entry[0]">
                <td class="muted mono" style="width: 110px">{{ entry[0] }}</td>
                <td class="mono truncate" :title="entry[1]">{{ entry[1] }}</td>
                <td style="width: 78px">
                  <v-btn size="small" variant="text" @click="openPath(entry[1])">{{ t('common.open') }}</v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
          <p v-else class="muted">{{ t('settings.readingPaths') }}</p>
        </v-card-text>
      </v-card>

      <v-card class="settings__card">
        <v-card-title class="settings__card-title">{{ t('settings.hotkeys') }}</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <tbody>
              <tr v-for="shortcut in shortcuts" :key="shortcut.action + shortcut.keys.join()">
                <td style="width: 190px">
                  <span class="shortcut">
                    <template v-for="(key, index) in shortcut.keys" :key="key">
                      <span v-if="index > 0" class="shortcut__plus">+</span>
                      <v-kbd>{{ key }}</v-kbd>
                    </template>
                  </span>
                </td>
                <td class="muted">{{ shortcut.action }}</td>
              </tr>
              <!-- 两个全局快捷键可以在上面的卡片里改，这里显示当前配置 -->
              <tr v-for="shortcut in globalShortcutRows" :key="shortcut.action">
                <td style="width: 190px">
                  <span class="shortcut">
                    <template v-for="(key, index) in shortcut.keys" :key="key">
                      <span v-if="index > 0" class="shortcut__plus">+</span>
                      <v-kbd>{{ key }}</v-kbd>
                    </template>
                  </span>
                </td>
                <td class="muted">{{ shortcut.action }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <p class="muted" style="margin-top: 14px">{{ t('settings.footer') }}</p>
    </div>
  </section>
</template>
