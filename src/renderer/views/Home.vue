<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type {
  HomeShortcut,
  InstalledAppSummary,
  Note,
  Todo,
  WorkLog,
  WorkLogDraft
} from '@shared/types'
import { HOME_LINK_LIMIT } from '@shared/types'
import { recentNoteLinks } from '@shared/noteLinks'
import {
  groupWorkLogs,
  hasWorkLogContent,
  type WorkLogCategory
} from '@shared/workLog'
import BrandMark from '../components/BrandMark.vue'
import { t, currentLocale } from '../i18n'
import { useNotes } from '../stores/notes'
import { useNoteDocuments } from '../stores/noteDocuments'
import { useSettings } from '../stores/settings'
import { useTodos } from '../stores/todos'
import { useUi } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'

const ui = useUi()
const notes = useNotes()
const noteDocs = useNoteDocuments()
const settings = useSettings()
const todos = useTodos()
const workspaces = useWorkspaces()

const apps = ref<InstalledAppSummary[]>([])
const shortcuts = ref<HomeShortcut[]>([])
const homeTodos = ref<Todo[]>([])
const reportDraft = reactive<WorkLogDraft>({
  completed: '',
  incomplete: '',
  issues: '',
  content: ''
})
const reportMode = ref<'daily' | 'weekly'>('daily')
const reportSaving = ref(false)
const reportSavedAt = ref('')
const loadedWeekKey = ref('')
const loading = ref(true)
const appDialog = ref(false)
const appFilter = ref('')
const workLogs = ref<Record<string, WorkLog>>({})
const brokenAppIcons = reactive(new Set<string>())

const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(currentLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
)
const monthFormatter = computed(
  () => new Intl.DateTimeFormat(currentLocale(), { year: 'numeric', month: 'long' })
)
const weekdayFormatter = computed(() => new Intl.DateTimeFormat(currentLocale(), { weekday: 'short' }))

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, count: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (result.getDay() + 6) % 7
  return addDays(result, -offset)
}

function loadReportDraft(log: WorkLog | undefined): void {
  reportDraft.completed = log?.completed ?? ''
  reportDraft.incomplete = log?.incomplete ?? ''
  reportDraft.issues = log?.issues ?? ''
  reportDraft.content = log?.content ?? ''
  reportSavedAt.value = log?.updatedAt ?? ''
}

const today = new Date()
const todayKey = dateKey(today)
const selectedDate = ref(todayKey)
const monthCursor = ref(new Date(today.getFullYear(), today.getMonth(), 1))

const selectedWeekStart = computed(() => startOfWeek(parseDateKey(selectedDate.value)))
const selectedWeekEnd = computed(() => addDays(selectedWeekStart.value, 6))
const weekDates = computed(() =>
  Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart.value, index))
)
const weekStartKey = computed(() => dateKey(selectedWeekStart.value))
const weekEndKey = computed(() => dateKey(selectedWeekEnd.value))
const weekRecordedCount = computed(
  () => weekDates.value.filter((date) => hasWorkLogContent(workLogs.value[dateKey(date)])).length
)
const weeklyGroups = computed(() =>
  groupWorkLogs(
    weekDates.value
      .map((date) => workLogs.value[dateKey(date)])
      .filter((log): log is WorkLog => Boolean(log))
  )
)
const weeklyItemCount = computed(
  () => Object.values(weeklyGroups.value).reduce((total, items) => total + items.length, 0)
)
const reportDirty = computed(() => {
  const saved = workLogs.value[selectedDate.value]
  return (
    reportDraft.completed !== (saved?.completed ?? '') ||
    reportDraft.incomplete !== (saved?.incomplete ?? '') ||
    reportDraft.issues !== (saved?.issues ?? '') ||
    reportDraft.content !== (saved?.content ?? '')
  )
})

const calendarDays = computed(() => {
  const first = new Date(monthCursor.value.getFullYear(), monthCursor.value.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = addDays(first, -offset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index)
    const key = dateKey(date)
    return {
      date,
      key,
      day: date.getDate(),
      currentMonth: date.getMonth() === monthCursor.value.getMonth(),
      isToday: key === todayKey,
      hasReport: hasWorkLogContent(workLogs.value[key])
    }
  })
})

const weekdayLabels = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const monday = new Date(2024, 0, 1 + index)
    return weekdayFormatter.value.format(monday)
  })
)

const reportFields = computed<
  Array<{ key: 'completed' | 'incomplete' | 'issues' | 'content'; label: string; placeholder: string }>
>(() => [
  {
    key: 'completed',
    label: t('home.reportCompleted'),
    placeholder: t('home.reportCompletedPlaceholder')
  },
  {
    key: 'incomplete',
    label: t('home.reportIncomplete'),
    placeholder: t('home.reportIncompletePlaceholder')
  },
  {
    key: 'issues',
    label: t('home.reportIssues'),
    placeholder: t('home.reportIssuesPlaceholder')
  },
  {
    key: 'content',
    label: t('home.reportDefault'),
    placeholder: t('home.reportPlaceholder')
  }
])

const weeklySections = computed<
  Array<{ key: WorkLogCategory; label: string; icon: string; color: string; items: string[] }>
>(() => [
  {
    key: 'completed',
    label: t('home.reportCompleted'),
    icon: 'mdi-check-circle-outline',
    color: 'success',
    items: weeklyGroups.value.completed
  },
  {
    key: 'incomplete',
    label: t('home.reportIncomplete'),
    icon: 'mdi-progress-clock',
    color: 'warning',
    items: weeklyGroups.value.incomplete
  },
  {
    key: 'issues',
    label: t('home.reportIssues'),
    icon: 'mdi-alert-circle-outline',
    color: 'error',
    items: weeklyGroups.value.issues
  },
  {
    key: 'default',
    label: t('home.reportDefault'),
    icon: 'mdi-text-box-outline',
    color: 'info',
    items: weeklyGroups.value.default
  }
])

const pendingTodos = computed(() =>
  homeTodos.value
    .filter((todo) => todo.status !== 'done')
    .sort((left, right) => {
      const priority = { high: 0, normal: 1, low: 2 }
      const due = (todo: Todo): string => todo.dueDate ?? '9999-12-31'
      return (
        due(left).localeCompare(due(right)) ||
        priority[left.priority] - priority[right.priority] ||
        left.id - right.id
      )
    })
)

const linkLimit = computed(() => settings.state.settings?.homeLinkLimit ?? HOME_LINK_LIMIT.default)
const recentLinks = computed(() => recentNoteLinks(notes.state.items, linkLimit.value))

const appMap = computed(() => new Map(apps.value.map((app) => [app.path, app])))
const pinnedPaths = computed(() => new Set(shortcuts.value.map((shortcut) => shortcut.path)))
const availableApps = computed(() => {
  const needle = appFilter.value.trim().toLowerCase()
  return apps.value
    .filter((app) => !pinnedPaths.value.has(app.path))
    .filter((app) => !needle || `${app.name} ${app.comment}`.toLowerCase().includes(needle))
    .sort((left, right) => left.name.localeCompare(right.name))
})

function appIcon(shortcut: HomeShortcut): string | null {
  return appMap.value.get(shortcut.path)?.iconUrl ?? null
}

async function loadHome(): Promise<void> {
  loading.value = true
  try {
    const [shortcutItems, appItems, todoItems] = await Promise.all([
      window.desktop.home.list(),
      window.desktop.apps.list(),
      window.desktop.todo.list()
    ])
    shortcuts.value = shortcutItems
    apps.value = appItems
    homeTodos.value = todoItems
    if (workspaces.state.items.length === 0) await workspaces.load()
    if (notes.state.items.length === 0) await notes.load()
    await Promise.all([loadWeekLogs(), loadMonthLogs()])
  } catch (error) {
    ui.handleError(error, t('error.readHome'))
  } finally {
    loading.value = false
  }
}

async function loadWeekLogs(): Promise<void> {
  try {
    const logs = await window.desktop.workLog.list(weekStartKey.value, weekEndKey.value)
    loadedWeekKey.value = weekStartKey.value
    workLogs.value = { ...workLogs.value, ...Object.fromEntries(logs.map((log) => [log.date, log])) }
    loadReportDraft(workLogs.value[selectedDate.value])
  } catch (error) {
    ui.handleError(error, t('error.readWorkLogs'))
  }
}

async function loadMonthLogs(): Promise<void> {
  try {
    const first = new Date(monthCursor.value.getFullYear(), monthCursor.value.getMonth(), 1)
    const last = new Date(monthCursor.value.getFullYear(), monthCursor.value.getMonth() + 1, 0)
    const logs = await window.desktop.workLog.list(dateKey(first), dateKey(last))
    workLogs.value = { ...workLogs.value, ...Object.fromEntries(logs.map((log) => [log.date, log])) }
  } catch (error) {
    ui.handleError(error, t('error.readWorkLogs'))
  }
}

async function selectDate(key: string): Promise<void> {
  if (key === selectedDate.value) return
  if (reportDirty.value) {
    await saveReport(true)
    if (reportDirty.value) return
  }
  selectedDate.value = key
  const date = parseDateKey(key)
  if (date.getMonth() !== monthCursor.value.getMonth()) {
    monthCursor.value = new Date(date.getFullYear(), date.getMonth(), 1)
    void loadMonthLogs()
  }
}

function changeMonth(delta: number): void {
  monthCursor.value = new Date(
    monthCursor.value.getFullYear(),
    monthCursor.value.getMonth() + delta,
    1
  )
  void loadMonthLogs()
}

async function saveReport(silent = false): Promise<void> {
  reportSaving.value = true
  try {
    const saved = await window.desktop.workLog.save(selectedDate.value, {
      completed: reportDraft.completed,
      incomplete: reportDraft.incomplete,
      issues: reportDraft.issues,
      content: reportDraft.content
    })
    workLogs.value = { ...workLogs.value, [saved.date]: saved }
    loadReportDraft(saved)
    if (!silent) ui.toast(t('home.reportSaved'), 'success')
  } catch (error) {
    ui.handleError(error, t('error.saveWorkLog'))
  } finally {
    reportSaving.value = false
  }
}

async function savePendingReport(): Promise<boolean> {
  if (!reportDirty.value) return true
  await saveReport(true)
  return !reportDirty.value
}

async function exportWeek(): Promise<void> {
  try {
    if (!(await savePendingReport())) return
    const result = await window.desktop.workLog.exportWeek(weekStartKey.value, weekEndKey.value)
    if (result) ui.toast(t('home.reportExported', { count: result.count, path: result.path }), 'success')
  } catch (error) {
    ui.handleError(error, t('error.exportWorkLog'))
  }
}

async function exportWeekText(): Promise<void> {
  try {
    if (!(await savePendingReport())) return
    const result = await window.desktop.workLog.exportWeekText(weekStartKey.value, weekEndKey.value)
    if (result) ui.toast(t('home.reportExported', { count: result.count, path: result.path }), 'success')
  } catch (error) {
    ui.handleError(error, t('error.exportWorkLog'))
  }
}

async function copyWeekText(): Promise<void> {
  try {
    if (!(await savePendingReport())) return
    const result = await window.desktop.workLog.copyWeekText(weekStartKey.value, weekEndKey.value)
    ui.toast(t('home.workLogTextCopied', { count: result.count }), 'success')
  } catch (error) {
    ui.handleError(error, t('error.exportWorkLog'))
  }
}

async function openApp(target: string): Promise<void> {
  try {
    await window.desktop.apps.open(target)
  } catch (error) {
    ui.handleError(error, t('error.openApp'))
  }
}

async function addApp(app: InstalledAppSummary): Promise<void> {
  try {
    await window.desktop.home.add({ path: app.path, label: app.name })
    shortcuts.value = await window.desktop.home.list()
    if (availableApps.value.length === 0) appDialog.value = false
    ui.toast(t('home.appAdded', { name: app.name }), 'success')
  } catch (error) {
    ui.handleError(error, t('error.addHomeApp'))
  }
}

async function removeApp(shortcut: HomeShortcut): Promise<void> {
  const confirmed = await ui.confirm({
    title: t('home.removeAppTitle', { name: shortcut.label }),
    message: t('home.removeAppMessage'),
    confirmText: t('common.remove'),
    danger: true
  })
  if (!confirmed) return
  try {
    await window.desktop.home.remove(shortcut.id)
    shortcuts.value = shortcuts.value.filter((item) => item.id !== shortcut.id)
  } catch (error) {
    ui.handleError(error, t('error.removeHomeApp'))
  }
}

async function cycleTodo(todo: Todo): Promise<void> {
  try {
    const willComplete = todo.status === 'doing'
    if (willComplete && !(await savePendingReport())) return
    await todos.cycleStatus(todo)
    homeTodos.value = await window.desktop.todo.list()
    if (willComplete) await Promise.all([loadWeekLogs(), loadMonthLogs()])
  } catch (error) {
    ui.handleError(error, t('error.updateTodo'))
  }
}

async function openTodos(): Promise<void> {
  todos.state.filter.workspaceId = 'all'
  todos.state.filter.status = 'all'
  todos.state.filter.keyword = ''
  await todos.load()
  ui.setView('todo')
}

async function openTodo(todo: Todo): Promise<void> {
  todos.state.filter.workspaceId = 'all'
  todos.state.filter.status = 'all'
  todos.state.filter.keyword = ''
  await todos.load()
  todos.focus(todo.id)
  ui.setView('todo')
}

function workspaceLabel(id: number | null): string {
  if (id === null) return t('todo.inbox')
  return workspaces.state.items.find((workspace) => workspace.id === id)?.name ?? t('todo.deletedWorkspace')
}

function openWorkspace(todo: Todo): void {
  if (todo.workspaceId === null) return
  workspaces.focusWorkspace(todo.workspaceId)
  ui.setView('workspace')
}

async function openLink(note: Note): Promise<void> {
  try {
    await window.desktop.system.openUrl(note.url)
    await window.desktop.note.markLinkUsed(note.id)
    await notes.load()
  } catch (error) {
    ui.handleError(error, t('error.openLink'))
  }
}

function openNote(note: Note): void {
  noteDocs.showMemo()
  notes.focus(note.id)
  ui.setView('notes')
}

function openMemoView(): void {
  noteDocs.showMemo()
  ui.setView('notes')
}

function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function linkInitial(title: string): string {
  return Array.from(title.trim())[0]?.toUpperCase() ?? '?'
}

function todoDueClass(todo: Todo): string {
  if (!todo.dueDate) return ''
  if (todo.dueDate < todayKey) return 'home-todo__due--overdue'
  if (todo.dueDate === todayKey) return 'home-todo__due--today'
  return ''
}

watch(selectedDate, async () => {
  if (loadedWeekKey.value !== weekStartKey.value) {
    await loadWeekLogs()
    return
  }
  loadReportDraft(workLogs.value[selectedDate.value])
})

onMounted(() => void loadHome())
</script>

<template>
  <section class="view home">
    <div class="view__body home__body">
      <section class="home__hero">
        <div class="home__hero-copy">
          <BrandMark :size="52" />
          <div>
            <p class="home__eyebrow">{{ t('home.eyebrow') }}</p>
            <h1>{{ t('app.name') }}</h1>
            <p class="home__subtitle">{{ t('home.subtitle', { pending: pendingTodos.length }) }}</p>
          </div>
        </div>
        <div class="home__today">
          <span>{{ t('home.today') }}</span>
          <strong>{{ dateFormatter.format(new Date()) }}</strong>
        </div>
      </section>

      <v-progress-linear v-if="loading" indeterminate color="primary" rounded />

      <div class="home__grid">
        <div class="home__column home__column--left">
          <v-card class="home-card home-card--calendar">
            <v-card-title class="home-card__title">
              <span class="home-card__heading">
                <v-icon icon="mdi-calendar-month-outline" color="info" />
                {{ t('home.calendarTitle') }}
              </span>
              <div class="row">
                <v-btn icon="mdi-chevron-left" size="small" variant="text" :title="t('home.previousMonth')" @click="changeMonth(-1)" />
                <span class="home-calendar__month">{{ monthFormatter.format(monthCursor) }}</span>
                <v-btn icon="mdi-chevron-right" size="small" variant="text" :title="t('home.nextMonth')" @click="changeMonth(1)" />
              </div>
            </v-card-title>
            <v-card-text class="home-calendar">
              <div class="home-calendar__weekdays">
                <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
              </div>
              <div class="home-calendar__days">
                <button
                  v-for="day in calendarDays"
                  :key="day.key"
                  class="home-calendar__day"
                  type="button"
                  :class="{
                    'is-other-month': !day.currentMonth,
                    'is-today': day.isToday,
                    'is-selected': day.key === selectedDate,
                    'has-report': day.hasReport
                  }"
                  @click="selectDate(day.key)"
                >
                  <span>{{ day.day }}</span>
                  <i v-if="day.hasReport" />
                </button>
              </div>

              <div class="home-report">
                <div class="home-report__header">
                  <div class="home-report__title">
                    <strong>
                      {{ reportMode === 'daily' ? t('home.reportTitle') : t('home.weeklyReportTitle') }}
                    </strong>
                    <v-btn-toggle
                      v-model="reportMode"
                      mandatory
                      density="compact"
                      variant="outlined"
                      divided
                    >
                      <v-btn value="daily" size="small">{{ t('home.reportDailyTab') }}</v-btn>
                      <v-btn value="weekly" size="small">{{ t('home.reportWeeklyTab') }}</v-btn>
                    </v-btn-toggle>
                  </div>
                  <span class="muted mono">{{ t('home.weekRecorded', { count: weekRecordedCount }) }}</span>
                </div>

                <template v-if="reportMode === 'daily'">
                  <div class="home-report__meta">
                    <p class="muted">{{ dateFormatter.format(parseDateKey(selectedDate)) }}</p>
                    <span class="muted">{{ t('home.reportCompletedHint') }}</span>
                  </div>
                  <div class="home-report__fields">
                    <label v-for="field in reportFields" :key="field.key" class="home-report__field">
                      <span>{{ field.label }}</span>
                      <v-textarea
                        v-model="reportDraft[field.key]"
                        rows="2"
                        auto-grow
                        hide-details
                        :placeholder="field.placeholder"
                        @keydown.ctrl.enter.prevent="saveReport()"
                        @keydown.meta.enter.prevent="saveReport()"
                        @blur="reportDirty && saveReport(true)"
                      />
                    </label>
                  </div>
                  <div class="row row--between">
                    <span class="muted">
                      {{ reportDirty ? t('home.reportUnsaved') : reportSavedAt ? t('home.reportSaved') : t('home.reportHint') }}
                    </span>
                    <v-btn color="primary" :loading="reportSaving" :disabled="!reportDirty" @click="saveReport()">
                      {{ t('common.save') }}
                    </v-btn>
                  </div>
                </template>

                <template v-else>
                  <div class="home-report__meta home-report__meta--weekly">
                    <p class="muted">
                      {{ t('home.weeklyReportRange', { start: weekStartKey, end: weekEndKey }) }}
                    </p>
                  </div>
                  <v-empty-state
                    v-if="weeklyItemCount === 0"
                    icon="mdi-clipboard-text-outline"
                    :title="t('home.weeklyReportEmpty')"
                    :text="t('home.weeklyReportEmptyText')"
                    class="home-card__empty"
                  />
                  <div v-else class="home-weekly">
                    <section
                      v-for="section in weeklySections"
                      :key="section.key"
                      class="home-weekly__section"
                    >
                      <div class="home-weekly__heading">
                        <v-icon :icon="section.icon" :color="section.color" size="18" />
                        <strong>{{ section.label }}</strong>
                        <v-chip size="x-small" variant="tonal">{{ section.items.length }}</v-chip>
                      </div>
                      <ol v-if="section.items.length > 0">
                        <li v-for="(item, index) in section.items" :key="`${section.key}-${index}`">
                          {{ item }}
                        </li>
                      </ol>
                      <p v-else class="muted">{{ t('common.empty') }}</p>
                    </section>
                  </div>
                  <div class="row row--between">
                    <span class="muted">{{ t('home.weeklyReportItems', { count: weeklyItemCount }) }}</span>
                    <div class="row">
                      <v-btn
                        icon="mdi-content-copy"
                        size="small"
                        variant="text"
                        :title="t('home.copyWeekText')"
                        :disabled="weekRecordedCount === 0"
                        @click="copyWeekText"
                      />
                      <v-menu location="bottom end" close-on-content-click>
                        <template #activator="{ props }">
                          <v-btn
                            v-bind="props"
                            icon="mdi-download-outline"
                            size="small"
                            variant="text"
                            :title="t('home.exportWeek')"
                            :disabled="weekRecordedCount === 0"
                          />
                        </template>
                        <v-list density="compact">
                          <v-list-item
                            prepend-icon="mdi-text-box-outline"
                            :title="t('home.exportWeekText')"
                            @click="exportWeekText"
                          />
                          <v-list-item
                            prepend-icon="mdi-language-markdown-outline"
                            :title="t('home.exportWeekMarkdown')"
                            @click="exportWeek"
                          />
                        </v-list>
                      </v-menu>
                    </div>
                  </div>
                </template>
              </div>
            </v-card-text>
          </v-card>

        </div>

        <div class="home__column home__column--right">
          <v-card class="home-card home-card--todos">
            <v-card-title class="home-card__title">
              <span class="home-card__heading">
                <v-icon icon="mdi-check-circle-outline" color="warning" />
                {{ t('home.todosTitle') }}
                <v-chip size="x-small" variant="tonal">{{ pendingTodos.length }}</v-chip>
              </span>
              <v-btn size="small" variant="text" append-icon="mdi-arrow-right" @click="openTodos">
                {{ t('home.viewAll') }}
              </v-btn>
            </v-card-title>
            <v-card-text class="home-todos">
              <div
                v-for="todo in pendingTodos.slice(0, 6)"
                :key="todo.id"
                class="home-todo"
              >
                <button
                  class="home-todo__toggle"
                  type="button"
                  :title="t('todo.toggleStatus')"
                  :class="{ 'is-doing': todo.status === 'doing' }"
                  @click="cycleTodo(todo)"
                >
                  <v-icon
                    :icon="
                      todo.status === 'doing'
                        ? 'mdi-progress-clock'
                        : todo.status === 'done'
                          ? 'mdi-checkbox-marked-circle-outline'
                          : 'mdi-checkbox-blank-circle-outline'
                    "
                    size="18"
                  />
                </button>
                <button
                  class="home-todo__text truncate"
                  type="button"
                  :title="t('home.openTodo')"
                  @click="openTodo(todo)"
                >
                  {{ todo.title }}
                </button>
                <span v-if="todo.dueDate" class="home-todo__due" :class="todoDueClass(todo)">
                  {{ todo.dueDate.slice(5) }}
                </span>
                <button
                  v-if="todo.workspaceId !== null"
                  class="home-todo__workspace"
                  type="button"
                  :title="t('todo.openWorkspace')"
                  @click="openWorkspace(todo)"
                >
                  {{ workspaceLabel(todo.workspaceId) }}
                </button>
                <span v-else class="home-todo__workspace is-inbox">{{ workspaceLabel(null) }}</span>
                <v-chip v-if="todo.priority === 'high'" size="x-small" color="error" variant="tonal">
                  {{ t('todo.priorityHigh') }}
                </v-chip>
              </div>
              <v-empty-state
                v-if="pendingTodos.length === 0"
                icon="mdi-party-popper"
                :title="t('home.todosEmpty')"
                :text="t('home.todosEmptyText')"
                class="home-card__empty"
              />
            </v-card-text>
          </v-card>

          <v-card class="home-card home-card--links">
            <v-card-title class="home-card__title">
              <span class="home-card__heading">
                <v-icon icon="mdi-link-variant" color="success" />
                {{ t('home.linksTitle') }}
              </span>
              <v-btn size="small" variant="text" append-icon="mdi-arrow-right" @click="openMemoView">
                {{ t('home.manageLinks') }}
              </v-btn>
            </v-card-title>
            <v-card-text class="home-links">
              <button
                v-for="note in recentLinks"
                :key="note.id"
                class="home-link"
                type="button"
                :title="note.url"
                @click="openLink(note)"
              >
                <span class="home-link__icon">{{ linkInitial(note.title) }}</span>
                <span class="home-link__text">
                  <strong class="truncate">{{ note.title }}</strong>
                  <span class="truncate">{{ linkHost(note.url) }}</span>
                </span>
                <v-icon icon="mdi-open-in-new" size="16" />
                <span class="home-link__note" @click.stop="openNote(note)">
                  <v-icon icon="mdi-note-text-outline" size="15" />
                </span>
              </button>
              <v-empty-state
                v-if="recentLinks.length === 0"
                icon="mdi-link-variant"
                :title="t('home.linksEmpty')"
                :text="t('home.linksEmptyText')"
                class="home-card__empty"
              />
            </v-card-text>
          </v-card>

          <v-card class="home-card home-card--apps">
            <v-card-title class="home-card__title">
              <span class="home-card__heading">
                <v-icon icon="mdi-apps" color="primary" />
                {{ t('home.appsTitle') }}
              </span>
              <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="appDialog = true">
                {{ t('home.addApp') }}
              </v-btn>
            </v-card-title>
            <v-card-text>
              <div class="home-apps">
                <div
                  v-for="shortcut in shortcuts"
                  :key="shortcut.id"
                  class="home-app"
                  role="button"
                  tabindex="0"
                  :title="shortcut.exists ? shortcut.label : t('home.appMissing', { name: shortcut.label })"
                  :class="{ 'is-missing': !shortcut.exists }"
                  @click="openApp(shortcut.path)"
                  @keydown.enter="openApp(shortcut.path)"
                  @keydown.space.prevent="openApp(shortcut.path)"
                >
                  <span class="home-app__icon">
                    <img
                      v-if="appIcon(shortcut) && !brokenAppIcons.has(shortcut.path)"
                      :src="appIcon(shortcut) ?? ''"
                      alt=""
                      @error="brokenAppIcons.add(shortcut.path)"
                    />
                    <v-icon v-else icon="mdi-application-outline" size="30" />
                  </span>
                  <span class="home-app__label truncate">{{ shortcut.label }}</span>
                  <button
                    class="home-app__remove"
                    type="button"
                    :title="t('common.remove')"
                    @click.stop="removeApp(shortcut)"
                  >
                    <v-icon icon="mdi-close" size="12" />
                  </button>
                </div>
                <button class="home-app home-app--add" type="button" @click="appDialog = true">
                  <span class="home-app__icon"><v-icon icon="mdi-plus" size="28" /></span>
                  <span class="home-app__label">{{ t('home.addApp') }}</span>
                </button>
              </div>
              <p v-if="shortcuts.length === 0" class="muted home-card__hint">{{ t('home.appsEmpty') }}</p>
            </v-card-text>
          </v-card>
        </div>
      </div>
    </div>

    <v-dialog v-model="appDialog" max-width="680" scrollable>
      <v-card class="dialog__card">
        <v-card-title class="dialog__title">{{ t('home.chooseApp') }}</v-card-title>
        <v-card-text class="stack home-app-picker">
          <v-text-field
            v-model="appFilter"
            autofocus
            prepend-inner-icon="mdi-magnify"
            :placeholder="t('home.searchApps')"
            hide-details
          />
          <div v-if="availableApps.length > 0" class="home-app-picker__list">
            <button
              v-for="app in availableApps"
              :key="app.path"
              type="button"
              class="home-app-picker__item"
              @click="addApp(app)"
            >
              <span class="home-app__icon">
                <img
                  v-if="app.iconUrl && !brokenAppIcons.has(app.path)"
                  :src="app.iconUrl"
                  alt=""
                  @error="brokenAppIcons.add(app.path)"
                />
                <v-icon v-else icon="mdi-application-outline" size="28" />
              </span>
              <span class="home-app-picker__text">
                <strong>{{ app.name }}</strong>
                <span class="muted truncate">{{ app.comment || app.path }}</span>
              </span>
              <v-icon icon="mdi-plus-circle-outline" />
            </button>
          </div>
          <v-empty-state
            v-else
            icon="mdi-application-search-outline"
            :title="t('home.noAppsFound')"
            :text="t('home.noAppsFoundText')"
            class="home-app-picker__empty"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="appDialog = false">{{ t('common.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.home__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.home__hero {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 150px;
  padding: 26px 30px;
  border-radius: 18px;
  color: #fff;
  background:
    radial-gradient(circle at 88% 18%, rgba(103, 232, 249, 0.34), transparent 28%),
    linear-gradient(125deg, #172554 0%, #1d4ed8 56%, #0891b2 100%);
  box-shadow: 0 18px 45px rgba(30, 64, 175, 0.2);
}

.home__hero::after {
  content: '';
  position: absolute;
  right: -70px;
  bottom: -150px;
  width: 340px;
  height: 340px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
}

.home__hero-copy {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 18px;
}

.home__hero h1 {
  margin: 2px 0 4px;
  font-size: clamp(25px, 3vw, 36px);
  line-height: 1;
  letter-spacing: -0.03em;
}

.home__eyebrow {
  margin: 0;
  color: #bfdbfe;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.home__subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
}

.home__today {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  min-width: 210px;
  padding: 14px 18px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(10px);
}

.home__today span {
  color: #bfdbfe;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.home__today strong {
  font-size: 14px;
}

.home__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 16px;
  align-items: start;
}

.home__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.home-card {
  overflow: hidden;
  border-radius: 15px;
}

.home-card__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 6px;
  font-size: 14px;
}

.home-card__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-weight: 700;
}

.home-card__hint {
  margin: 10px 0 0;
  font-size: 12px;
}

.home-card__empty {
  min-height: 0 !important;
  padding: 4px;
}

.home-card__empty :deep(.v-empty-state__media) {
  margin-bottom: 2px;
}

.home-card__empty :deep(.v-empty-state__media .v-icon) {
  width: 32px !important;
  height: 32px !important;
  font-size: 32px !important;
}

.home-card__empty :deep(.v-empty-state__title) {
  font-size: 14px;
  line-height: 1.25;
}

.home-card__empty :deep(.v-empty-state__text) {
  max-width: 280px;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.35;
}

.home-apps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(82px, 1fr));
  gap: 10px;
}

.home-app {
  position: relative;
  min-width: 0;
  padding: 13px 8px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.home-app:hover {
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-primary), 0.06);
}

.home-app.is-missing {
  opacity: 0.48;
}

.home-app__icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin: 0 auto 8px;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.055);
}

.home-app__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.home-app__label {
  display: block;
  width: 100%;
  font-size: 12px;
  text-align: center;
}

.home-app__remove {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-surface), 0.96);
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.2);
  opacity: 0;
  cursor: pointer;
}

.home-app:hover .home-app__remove,
.home-app__remove:focus-visible {
  opacity: 1;
}

.home-app--add {
  border-style: dashed;
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

.home-todos {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.home-todo {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
  padding: 9px 7px;
  border: none;
  border-radius: 9px;
  color: inherit;
  background: transparent;
}

.home-todo:hover {
  background: rgba(var(--v-theme-on-surface), 0.045);
}

.home-todo__toggle {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 2px;
  border: none;
  border-radius: 6px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  background: transparent;
  cursor: pointer;
}

.home-todo__toggle:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.home-todo__toggle.is-doing {
  color: rgb(var(--v-theme-primary));
}

.home-todo__text {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  border: none;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.home-todo__text:hover {
  color: rgb(var(--v-theme-primary));
}

.home-todo__workspace {
  flex: 0 0 auto;
  max-width: 110px;
  padding: 2px 7px;
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 999px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  background: rgba(var(--v-theme-on-surface), 0.04);
  font: inherit;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.home-todo__workspace:hover {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.45);
}

.home-todo__workspace.is-inbox {
  cursor: default;
}

.home-todo__due {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.home-todo__due--today {
  color: rgb(var(--v-theme-primary));
}

.home-todo__due--overdue {
  color: rgb(var(--v-theme-error));
}

.home-calendar__month {
  min-width: 104px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.home-calendar__weekdays,
.home-calendar__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.home-calendar__weekdays {
  margin-bottom: 4px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11px;
  text-align: center;
}

.home-calendar__day {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.home-calendar__day:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.home-calendar__day.is-other-month {
  opacity: 0.35;
}

.home-calendar__day.is-today {
  border-color: rgb(var(--v-theme-primary));
}

.home-calendar__day.is-selected {
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
}

.home-calendar__day i {
  position: absolute;
  bottom: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #fbbf24;
}

.home-calendar__day.is-selected i {
  background: #fff;
}

.home-report {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.home-report__header,
.home-report__title,
.home-report__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-report__header,
.home-report__meta {
  justify-content: space-between;
}

.home-report__header {
  flex-wrap: wrap;
}

.home-report__title {
  flex-wrap: wrap;
}

.home-report__meta {
  align-items: flex-start;
}

.home-report__meta p {
  margin: 3px 0 0;
  font-size: 12px;
}

.home-report__meta span {
  max-width: 62%;
  font-size: 11px;
  line-height: 1.4;
  text-align: right;
}

.home-report__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.home-report__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.home-report__field > span {
  padding-left: 2px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 12px;
  font-weight: 650;
}

.home-report__field :deep(.v-field__input) {
  min-height: 54px;
  padding-top: 8px;
  padding-bottom: 8px;
}

.home-weekly {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.home-weekly__section {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.home-weekly__heading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.home-weekly__section ol {
  margin: 7px 0 0;
  padding-left: 22px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.5;
}

.home-weekly__section li + li {
  margin-top: 3px;
}

.home-weekly__section p {
  margin: 7px 0 0;
  font-size: 11px;
}

.home-links {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.home-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 9px 6px;
  border: none;
  border-radius: 10px;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.home-link:hover {
  background: rgba(var(--v-theme-on-surface), 0.045);
}

.home-link__icon {
  display: grid;
  flex: 0 0 32px;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: rgb(var(--v-theme-on-success));
  background: rgb(var(--v-theme-success));
  font-size: 13px;
  font-weight: 800;
}

.home-link__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  font-size: 12px;
}

.home-link__text span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.home-link__note {
  display: grid;
  place-items: center;
  padding: 5px;
  border-radius: 7px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.home-link__note:hover {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.home-app-picker {
  /* 结果少时让对话框按内容收高；列表多时只让列表区滚动 */
  min-height: 0;
}

.home-app-picker__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 460px;
  overflow-y: auto;
}

.home-app-picker__empty {
  min-height: 104px !important;
  padding: 4px !important;
}

.home-app-picker__empty :deep(.v-empty-state__media) {
  margin-bottom: 0;
}

.home-app-picker__empty :deep(.v-empty-state__media .v-icon) {
  width: 36px !important;
  height: 36px !important;
  font-size: 36px !important;
}

.home-app-picker__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 10px;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.home-app-picker__item:hover {
  background: rgba(var(--v-theme-primary), 0.07);
}

.home-app-picker__item .home-app__icon {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  margin: 0;
}

.home-app-picker__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

@media (max-width: 980px) {
  .home__grid {
    grid-template-columns: 1fr;
  }

  .home__column {
    display: contents;
  }

  .home-card--calendar {
    order: 1;
  }

  .home-card--todos {
    order: 2;
  }

  .home-card--links {
    order: 3;
  }

  .home-card--apps {
    order: 4;
  }

  .home__hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .home__today {
    align-items: flex-start;
    min-width: 0;
  }
}

@media (max-width: 680px) {
  .home-report__fields,
  .home-weekly {
    grid-template-columns: 1fr;
  }

  .home-report__meta {
    flex-direction: column;
  }

  .home-report__meta span {
    max-width: none;
    text-align: left;
  }
}
</style>
