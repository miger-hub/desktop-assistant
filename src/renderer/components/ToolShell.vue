<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ToolDescriptor, ToolErrorResult, ToolTreeNode as TreeNode } from '@shared/tools/types'
import { TOOL_TABLE_ROWS_MAX } from '@shared/tools/types'
import { t } from '../i18n'
import { useTools } from '../stores/tools'
import { useUi } from '../stores/ui'
import { runTool } from '../tools/runner'
import HighlightText from './HighlightText.vue'
import ToolTreeNode from './ToolTreeNode.vue'

const props = defineProps<{ tool: ToolDescriptor }>()
const emit = defineEmits<{ back: [] }>()

const ui = useUi()
const tools = useTools()
const session = tools.sessionFor(props.tool)
const result = computed(() => session.result)

const running = ref(false)
const viewMode = ref<'tree' | 'text'>('tree')
const searchQuery = ref('')
const activeMatchIndex = ref(0)
const sortColumn = ref<number | null>(null)
const sortDirection = ref<'asc' | 'desc'>('asc')
const revealedRow = ref<number | null>(null)
const textLineLimit = ref(1_000)

interface TableRow {
  cells: string[]
  /** 原始行号：排序后仍用它在页面搜索结果里定位 */
  index: number
}

type ResultMatch =
  | { kind: 'tree'; path: string }
  | { kind: 'table'; row: number; column: string; columnIndex: number }
  | { kind: 'text'; line: number }

const table = computed(() => (result.value?.kind === 'table' ? result.value : null))
const sortedRows = computed<TableRow[]>(() => {
  const value = table.value
  if (!value) return []
  const rows = value.rows.map((cells, index) => ({ cells, index }))
  const column = sortColumn.value
  if (column === null) return rows
  const direction = sortDirection.value === 'asc' ? 1 : -1
  return rows.sort((left, right) =>
    (left.cells[column] ?? '').localeCompare(right.cells[column] ?? '', undefined, {
      numeric: true,
      sensitivity: 'base'
    }) * direction
  )
})

const displayLimit = computed(() => {
  const raw = Number(session.options.maxRows)
  const configured = Number.isFinite(raw) && raw > 0 ? raw : sortedRows.value.length
  const revealed = revealedRow.value === null ? 0 : revealedRow.value + 1
  return Math.max(configured, revealed)
})

const visibleRows = computed(() => sortedRows.value.slice(0, displayLimit.value))

const textLines = computed(() => {
  const value = result.value
  if (value?.kind === 'text') return value.text.split('\n')
  if (value?.kind === 'tree' && viewMode.value === 'text' && value.text !== undefined) {
    return value.text.split('\n')
  }
  return []
})
const visibleTextLines = computed(() => textLines.value.slice(0, textLineLimit.value))
const hasMoreTextLines = computed(() => textLines.value.length > textLineLimit.value)

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase())
const matches = computed<ResultMatch[]>(() => {
  const needle = normalizedQuery.value
  const value = result.value
  if (!needle || !value || value.kind === 'error') return []

  if (value.kind === 'table') {
    const found: ResultMatch[] = []
    for (let row = 0; row < value.rows.length; row += 1) {
      for (let columnIndex = 0; columnIndex < value.columns.length; columnIndex += 1) {
        if ((value.rows[row]?.[columnIndex] ?? '').toLowerCase().includes(needle)) {
          found.push({ kind: 'table', row, column: value.columns[columnIndex], columnIndex })
        }
      }
    }
    return found
  }

  if (value.kind === 'text' || (value.kind === 'tree' && viewMode.value === 'text')) {
    return textLines.value.flatMap<ResultMatch>((line, lineIndex) =>
      line.toLowerCase().includes(needle) ? [{ kind: 'text', line: lineIndex }] : []
    )
  }

  const found: ResultMatch[] = []
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      const valueText = node.type === 'string' ? JSON.stringify(node.value ?? '') : node.value ?? ''
      if (node.key.toLowerCase().includes(needle) || valueText.toLowerCase().includes(needle)) {
        found.push({ kind: 'tree', path: node.path })
      }
      if (node.children) walk(node.children)
    }
  }
  walk(value.nodes)
  return found
})

const activeMatch = computed(() => matches.value[activeMatchIndex.value] ?? null)
const activeTreePath = computed(() => (activeMatch.value?.kind === 'tree' ? activeMatch.value.path : null))
const activeTextLine = computed(() => (activeMatch.value?.kind === 'text' ? activeMatch.value.line : null))
const matchedTextLines = computed(
  () => new Set(matches.value.filter((match) => match.kind === 'text').map((match) => match.line))
)
const searchCount = computed(() => {
  if (!normalizedQuery.value) return ''
  if (matches.value.length === 0) return t('tool.searchNoMatch')
  return t('tool.searchCount', { current: activeMatchIndex.value + 1, total: matches.value.length })
})

watch(
  () => session.result,
  () => {
    sortColumn.value = null
    sortDirection.value = 'asc'
    revealedRow.value = null
    textLineLimit.value = 1_000
    viewMode.value = 'tree'
    searchQuery.value = ''
    activeMatchIndex.value = 0
  }
)

watch([normalizedQuery, viewMode], () => {
  activeMatchIndex.value = 0
  void nextTick(() => focusMatch(0))
})

function errorText(error: ToolErrorResult): string {
  if (error.message) return error.message
  if (error.code) return t(`toolError.${error.code}`, error.params)
  return t('toolError.unknown')
}

async function run(): Promise<void> {
  if (running.value || !session.input.trim()) return
  running.value = true
  try {
    const next = await runTool(props.tool, session.input, { ...session.options })
    tools.saveResult(props.tool, next)
  } finally {
    running.value = false
  }
}

async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await window.desktop.clipboard.readText()
    if (!text) {
      ui.toast(t('tool.clipboardEmpty'), 'info')
      return
    }
    session.input = text
    tools.saveResult(props.tool, null)
  } catch (error) {
    ui.handleError(error, t('tool.clipboardReadFailed'))
  }
}

function reset(): void {
  session.input = ''
  for (const key of Object.keys(session.options)) delete session.options[key]
  for (const option of props.tool.options) session.options[option.key] = option.default
  tools.saveResult(props.tool, null)
  sortColumn.value = null
  revealedRow.value = null
  textLineLimit.value = 1_000
}

function copy(text: string): void {
  void navigator.clipboard.writeText(text).then(
    () => ui.toast(t('tool.copied'), 'success'),
    () => ui.toast(text, 'info')
  )
}

function copyResult(): void {
  if (result.value?.kind === 'text') copy(result.value.text)
  else if (result.value?.kind === 'tree' && result.value.text) copy(result.value.text)
}

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function csvText(): string {
  const value = table.value
  if (!value) return ''
  const rows = [value.columns, ...sortedRows.value.map((row) => row.cells)]
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
}

function copyCsv(): void {
  copy(csvText())
}

async function saveCsv(): Promise<void> {
  try {
    const filePath = await window.desktop.files.saveText({
      title: t('tool.saveCsvTitle'),
      defaultName: `${props.tool.id}.csv`,
      content: `\uFEFF${csvText()}`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (filePath) ui.toast(t('tool.savedTo', { path: filePath }), 'success')
  } catch (error) {
    ui.handleError(error, t('tool.saveFailed'))
  }
}

function copyMarkdown(): void {
  const value = table.value
  if (!value) return
  const row = (cells: string[]): string => `| ${cells.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`
  const header = row(value.columns)
  const divider = `| ${value.columns.map(() => '---').join(' | ')} |`
  copy([header, divider, ...sortedRows.value.map((item) => row(item.cells))].join('\n'))
}

function sortBy(column: number): void {
  if (sortColumn.value === column) sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

function sortMark(column: number): string {
  if (sortColumn.value !== column) return ''
  return sortDirection.value === 'asc' ? ' ▲' : ' ▼'
}

function cellClass(value: string): string {
  if (value === 'null') return 'tool-shell__null'
  if (value === '""') return 'tool-shell__empty'
  return ''
}

function isCellMatch(row: TableRow, columnIndex: number): boolean {
  return Boolean(normalizedQuery.value) && (row.cells[columnIndex] ?? '').toLowerCase().includes(normalizedQuery.value)
}

function isActiveCell(row: TableRow, columnIndex: number): boolean {
  const match = activeMatch.value
  return match?.kind === 'table' && match.row === row.index && match.columnIndex === columnIndex
}

function onInputKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void run()
  }
}

function showMoreText(): void {
  textLineLimit.value += 1_000
}

function openAncestors(element: Element): void {
  let parent = element.closest('details')
  while (parent) {
    parent.open = true
    parent = parent.parentElement?.closest('details') ?? null
  }
}

async function focusMatch(index: number): Promise<void> {
  const match = matches.value[index]
  if (!match) return

  if (match.kind === 'tree') {
    const element = document.querySelector(`[data-tree-path="${CSS.escape(match.path)}"]`)
    if (element) {
      openAncestors(element)
      element.scrollIntoView({ block: 'center' })
    }
  } else if (match.kind === 'table') {
    const position = sortedRows.value.findIndex((row) => row.index === match.row)
    if (position < 0) return
    revealedRow.value = Math.max(revealedRow.value ?? 0, position)
    await nextTick()
    const element = document.querySelector(
      `[data-table-row="${match.row}"][data-table-column="${match.columnIndex}"]`
    )
    element?.scrollIntoView({ block: 'center' })
  } else {
    textLineLimit.value = Math.max(textLineLimit.value, match.line + 1)
    await nextTick()
    const element = document.querySelector(`[data-text-line="${match.line}"]`)
    element?.scrollIntoView({ block: 'center' })
  }
}

function nextMatch(step: number): void {
  if (matches.value.length === 0) return
  activeMatchIndex.value = (activeMatchIndex.value + step + matches.value.length) % matches.value.length
  void nextTick(() => focusMatch(activeMatchIndex.value))
}
</script>

<template>
  <section class="tool-shell stack">
    <div class="row row--between">
      <div class="row" style="min-width: 0">
        <v-btn size="small" variant="text" prepend-icon="mdi-arrow-left" @click="emit('back')">
          {{ t('tool.back') }}
        </v-btn>
        <v-icon :icon="tool.icon" />
        <strong class="truncate">{{ tool.name }}</strong>
        <span class="muted truncate">{{ tool.description }}</span>
      </div>
      <v-chip size="small" variant="tonal">
        {{ tool.source === 'builtin' ? t('tools.builtin') : t('tools.installedBadge') }}
      </v-chip>
    </div>

    <v-card>
      <v-card-text class="stack">
        <v-textarea
          v-model="session.input"
          :label="t('tool.inputLabel')"
          :placeholder="t('tool.inputPlaceholder')"
          rows="8"
          auto-grow
          @keydown="onInputKeydown"
        />

        <div v-if="tool.options.length > 0" class="row tool-shell__options">
          <template v-for="option in tool.options" :key="option.key">
            <v-select
              v-if="option.type === 'select'"
              v-model="session.options[option.key]"
              class="tool-shell__option"
              :items="option.values ?? []"
              item-title="label"
              item-value="value"
              :label="option.label"
              density="comfortable"
              hide-details
              @update:model-value="revealedRow = null"
            />
            <v-switch
              v-else
              v-model="session.options[option.key]"
              color="primary"
              :label="option.label"
              hide-details
              density="compact"
            />
          </template>
        </div>

        <div class="row">
          <v-btn
            color="primary"
            prepend-icon="mdi-play"
            :loading="running"
            :disabled="!session.input.trim()"
            @click="run"
          >
            {{ t('tool.run') }}
          </v-btn>
          <v-btn variant="tonal" prepend-icon="mdi-content-paste" @click="pasteFromClipboard">
            {{ t('tool.paste') }}
          </v-btn>
          <v-btn variant="text" prepend-icon="mdi-eraser" @click="reset">{{ t('tool.clear') }}</v-btn>
          <span class="muted">{{ t('tool.runHint') }}</span>
        </div>
      </v-card-text>
    </v-card>

    <v-card v-if="result" class="tool-shell__result">
      <v-card-title class="row row--between">
        <span>{{ t('tool.result') }}</span>
        <span class="row">
          <v-btn
            v-if="result.kind === 'text' || (result.kind === 'tree' && result.text)"
            size="small"
            variant="text"
            prepend-icon="mdi-content-copy"
            @click="copyResult"
          >
            {{ t('tool.copy') }}
          </v-btn>
          <template v-if="result.kind === 'table'">
            <v-btn size="small" variant="text" prepend-icon="mdi-content-copy" @click="copyCsv">
              {{ t('tool.copyCsv') }}
            </v-btn>
            <v-btn size="small" variant="text" prepend-icon="mdi-content-save-outline" @click="saveCsv">
              {{ t('tool.saveCsv') }}
            </v-btn>
            <v-btn size="small" variant="text" prepend-icon="mdi-language-markdown" @click="copyMarkdown">
              {{ t('tool.copyMarkdown') }}
            </v-btn>
          </template>
        </span>
      </v-card-title>

      <div v-if="result.kind !== 'error'" class="row tool-shell__search">
        <v-text-field
          v-model="searchQuery"
          class="grow"
          density="compact"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          :placeholder="t('tool.searchResult')"
          @keydown.enter.prevent="nextMatch(1)"
          @keydown.esc="searchQuery = ''"
        />
        <span class="muted mono tool-shell__search-count">{{ searchCount }}</span>
        <v-btn
          size="small"
          variant="text"
          icon="mdi-chevron-up"
          :disabled="matches.length === 0"
          :title="t('tool.searchPrev')"
          @click="nextMatch(-1)"
        />
        <v-btn
          size="small"
          variant="text"
          icon="mdi-chevron-down"
          :disabled="matches.length === 0"
          :title="t('tool.searchNext')"
          @click="nextMatch(1)"
        />
        <v-btn-toggle
          v-if="result.kind === 'tree' && result.text"
          v-model="viewMode"
          density="compact"
          variant="outlined"
          divided
        >
          <v-btn value="tree" size="small">{{ t('tool.viewTree') }}</v-btn>
          <v-btn value="text" size="small">{{ t('tool.viewText') }}</v-btn>
        </v-btn-toggle>
      </div>

      <v-card-text>
        <p v-if="result.kind === 'error'" class="dialog__error">{{ errorText(result) }}</p>

        <template v-else-if="result.kind === 'tree' && viewMode === 'tree'">
          <div class="tool-tree">
            <ToolTreeNode
              v-for="node in result.nodes"
              :key="node.path"
              :node="node"
              :depth="0"
              :query="searchQuery"
              :active-path="activeTreePath"
            />
          </div>
        </template>

        <template v-else-if="result.kind === 'text' || result.kind === 'tree'">
          <div class="tool-shell__text-lines">
            <div
              v-for="(line, index) in visibleTextLines"
              :key="index"
              class="tool-shell__text-line"
              :class="{ 'is-match': matchedTextLines.has(index), 'is-active-match': activeTextLine === index }"
              :data-text-line="index"
            >
              <HighlightText :text="line || ' '" :query="searchQuery" />
            </div>
          </div>
          <v-btn v-if="hasMoreTextLines" size="small" variant="text" @click="showMoreText">
            {{ t('tool.showMore', { count: textLines.length - textLineLimit }) }}
          </v-btn>
        </template>

        <template v-else>
          <p v-if="result.truncated" class="muted">
            {{ t('tool.truncated', { max: TOOL_TABLE_ROWS_MAX }) }}
          </p>
          <div class="tool-shell__table">
            <v-table density="compact">
              <thead>
                <tr>
                  <th
                    v-for="(column, columnIndex) in result.columns"
                    :key="column"
                    class="tool-shell__th"
                    :title="t('tool.sortHint')"
                    @click="sortBy(columnIndex)"
                  >
                    {{ column }}{{ sortMark(columnIndex) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in visibleRows" :key="row.index">
                  <td
                    v-for="(cell, columnIndex) in row.cells"
                    :key="columnIndex"
                    :data-table-row="row.index"
                    :data-table-column="columnIndex"
                    :class="[
                      cellClass(cell),
                      { 'is-match': isCellMatch(row, columnIndex), 'is-active-match': isActiveCell(row, columnIndex) }
                    ]"
                  >
                    <HighlightText :text="cell" :query="searchQuery" />
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </section>
</template>
