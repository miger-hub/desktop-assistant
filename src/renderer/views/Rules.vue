<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { OperationBatch, Rule, RuleMatchType, RulePreview, RuleRunResult } from '@shared/types'
import { useOperations } from '../stores/operations'
import { useRules } from '../stores/rules'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'
import { t } from '../i18n'

const ui = useUi()
const rules = useRules()
const operations = useOperations()
const settings = useSettings()
const workspaces = useWorkspaces()

const FAILURE_PREVIEW = 3

const editor = reactive({
  open: false,
  id: null as number | null,
  name: '',
  matchType: 'extension' as RuleMatchType,
  pattern: '',
  sourcePath: '',
  targetPath: '',
  enabled: true
})
const editorError = ref('')

const previewState = reactive({
  open: false,
  /** undefined 表示"全部启用的规则" */
  ids: undefined as number[] | undefined,
  groups: [] as RulePreview[]
})

const enabledCount = computed(() => rules.state.items.filter((rule) => rule.enabled).length)
const undoableCount = computed(() => operations.state.batches.filter((batch) => batch.pending > 0).length)
const totalMatches = computed(() => previewState.groups.reduce((sum, group) => sum + group.matches.length, 0))
const conflictCount = computed(() =>
  previewState.groups.reduce((sum, group) => sum + group.matches.filter((match) => match.conflict).length, 0)
)
const previewErrors = computed(() => previewState.groups.flatMap((group) => group.errors))

/** 可选目录：桌面 + 所有映射目录，当前值不在列表里时补上（例如手工选过的目录） */
const pathOptions = computed(() => {
  const options = [
    { title: t('rules.desktopOption'), value: settings.state.paths?.desktop ?? '' },
    ...workspaces.allDirectories.value.map((entry) => ({
      title: `${entry.workspace.name} / ${entry.directory.name}`,
      value: entry.directory.path
    }))
  ].filter((option) => option.value)

  for (const value of [editor.sourcePath, editor.targetPath]) {
    if (value && !options.some((option) => option.value === value)) {
      options.push({ title: value, value })
    }
  }
  return options
})

function matchLabel(rule: Rule): string {
  return rule.matchType === 'extension'
    ? t('rules.matchExtension', { pattern: rule.pattern })
    : t('rules.matchName', { pattern: rule.pattern })
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function batchLabel(batch: OperationBatch): string {
  if (batch.origin === 'rule') return t('rules.originRule')
  return batch.kind === 'rename' ? t('rules.originRename') : t('rules.originMove')
}

/** 执行结果统一提示：成功 / 跳过 / 失败（失败最多列 3 条原因） */
function reportRun(result: RuleRunResult | null): void {
  if (!result) return

  const parts = [t('rules.summaryMoved', { count: result.succeeded.length })]
  if (result.skipped.length > 0) parts.push(t('rules.summarySkipped', { count: result.skipped.length }))
  if (result.failed.length > 0) parts.push(t('rules.summaryFailed', { count: result.failed.length }))
  const summary = parts.join(t('common.listSeparator'))

  if (result.failed.length === 0) {
    ui.toast(summary, result.succeeded.length > 0 ? 'success' : 'info')
    return
  }

  const lines = result.failed.slice(0, FAILURE_PREVIEW).map((item) => `· ${item.message}`)
  if (result.failed.length > FAILURE_PREVIEW) {
    lines.push(t('toast.moreNotListed', { count: result.failed.length - FAILURE_PREVIEW }))
  }
  ui.toast(`${summary}\n${lines.join('\n')}`, 'error')
}

function openCreate(): void {
  editor.open = true
  editor.id = null
  editor.name = ''
  editor.matchType = 'extension'
  editor.pattern = ''
  editor.sourcePath = settings.state.paths?.desktop ?? ''
  editor.targetPath = workspaces.allDirectories.value[0]?.directory.path ?? ''
  editor.enabled = true
  editorError.value = ''
}

function openEdit(rule: Rule): void {
  editor.open = true
  editor.id = rule.id
  editor.name = rule.name
  editor.matchType = rule.matchType
  editor.pattern = rule.pattern
  editor.sourcePath = rule.sourcePath
  editor.targetPath = rule.targetPath
  editor.enabled = rule.enabled
  editorError.value = ''
}

/** 目录选择：优先用系统对话框，选到的路径直接填进对应字段 */
async function pickInto(field: 'sourcePath' | 'targetPath'): Promise<void> {
  try {
    const picked = await window.desktop.files.pickDirectory({
      title: field === 'sourcePath' ? t('rules.pickSourceTitle') : t('rules.pickTargetTitle')
    })
    if (picked) editor[field] = picked
  } catch (error) {
    ui.handleError(error, t('error.chooseDirectory'))
  }
}

async function save(): Promise<void> {
  if (!editor.name.trim()) {
    editorError.value = t('rules.nameRequired')
    return
  }
  if (!editor.pattern.trim()) {
    editorError.value =
      editor.matchType === 'extension' ? t('rules.extensionRequired') : t('rules.nameKeywordRequired')
    return
  }
  if (!editor.sourcePath || !editor.targetPath) {
    editorError.value = t('rules.pathsRequired')
    return
  }
  if (editor.sourcePath === editor.targetPath) {
    editorError.value = t('rules.samePath')
    return
  }

  const input = {
    name: editor.name,
    matchType: editor.matchType,
    pattern: editor.pattern,
    sourcePath: editor.sourcePath,
    targetPath: editor.targetPath,
    enabled: editor.enabled
  }
  const ok = editor.id === null ? await rules.create(input) : await rules.update(editor.id, input)
  if (ok) {
    editor.open = false
    ui.toast(editor.id === null ? t('rules.created') : t('rules.saved'), 'success')
  }
}

async function toggleEnabled(rule: Rule, enabled: boolean): Promise<void> {
  await rules.update(rule.id, { enabled })
}

async function removeRule(rule: Rule): Promise<void> {
  const confirmed = await ui.confirm({
    title: t('rules.removeTitle', { name: rule.name }),
    message: t('rules.removeMessage'),
    confirmText: t('common.delete'),
    danger: true
  })
  if (!confirmed) return
  if (await rules.remove(rule.id)) ui.toast(t('rules.deleted'), 'success')
}

async function openPreview(ids?: number[]): Promise<void> {
  previewState.ids = ids
  previewState.groups = await rules.preview(ids)
  previewState.open = true
}

async function runRules(ids?: number[]): Promise<void> {
  const groups = await rules.preview(ids)
  const matches = groups.reduce((sum, group) => sum + group.matches.length, 0)
  const errors = groups.flatMap((group) => group.errors)

  if (matches === 0 && errors.length === 0) {
    ui.toast(t('rules.noMatchToast'), 'info')
    return
  }

  const confirmed = await ui.confirm({
    title: t('rules.applyTitle', { count: matches }),
    message:
      (errors.length > 0 ? `${errors.join('\n')}\n\n` : '') +
      t('rules.applyMessage'),
    confirmText: t('rules.applyConfirm')
  })
  if (!confirmed) return

  reportRun(await rules.apply(ids))
  await operations.load()
}

async function applyFromPreview(): Promise<void> {
  // IPC 只能传纯数据：previewState.ids 是 Vue 的响应式 Proxy，
  // 直接传过去会被结构化克隆拒绝（报 "An object could not be cloned."），这里先拷贝成普通数组
  const ids = previewState.ids === undefined ? undefined : [...previewState.ids]
  previewState.open = false
  reportRun(await rules.apply(ids))
  await operations.load()
}

async function undoBatch(batch: OperationBatch): Promise<void> {
  const result = await operations.undo(batch.batchId)
  if (result) operations.report(result)
}

async function undoLast(): Promise<void> {
  const result = await operations.undoLast()
  if (result) operations.report(result)
}

onMounted(async () => {
  if (settings.state.paths === null) await settings.load()
  if (workspaces.state.items.length === 0) await workspaces.load()
  await rules.load()
  await operations.load()
})
</script>

<template>
  <section class="view">
    <div class="view__header">
      <div class="view__title">
        <span>{{ t('rules.title') }}</span>
        <span class="muted mono">
          {{ t('rules.countLabel', { total: rules.state.items.length, enabled: enabledCount }) }}
        </span>
      </div>
      <div class="row">
        <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="openCreate">{{ t('rules.newRule') }}</v-btn>
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-eye-outline"
          :disabled="enabledCount === 0"
          @click="openPreview()"
        >
          {{ t('rules.previewAll') }}
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-play-circle-outline"
          :disabled="enabledCount === 0"
          @click="runRules()"
        >
          {{ t('rules.applyAll') }}
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-undo-variant"
          :disabled="undoableCount === 0"
          @click="undoLast"
        >
          {{ t('rules.undoLast') }}
        </v-btn>
      </div>
    </div>

    <!--
      最近操作固定在规则列表上方（不在滚动区里）：规则怎么滚它都留在屏幕上，
      条数多了在卡片内容区里滚。
    -->
    <div class="view__fixed">
      <v-card>
        <v-card-title class="settings__card-title">
          <span>{{ t('rules.recent') }}</span>
          <span class="muted">{{ t('rules.recentHint') }}</span>
        </v-card-title>
        <v-card-text class="rules__recent-list">
          <p v-if="operations.state.batches.length === 0" class="muted">{{ t('rules.noOperations') }}</p>
          <div v-else class="stack">
            <div v-for="batch in operations.state.batches" :key="batch.batchId" class="row row--between">
              <div class="stack" style="gap: 2px; min-width: 0">
                <span>
                  {{ batchLabel(batch) }}
                  <span class="muted">· {{ t('common.items', { count: batch.count }) }}</span>
                  <span v-if="batch.pending === 0" class="muted">{{ t('rules.undone') }}</span>
                </span>
                <span class="muted mono truncate" :title="batch.preview.join('\n')">
                  {{ formatTime(batch.createdAt) }} · {{ batch.preview[0] ?? '' }}
                </span>
              </div>
              <v-btn size="small" variant="text" :disabled="batch.pending === 0" @click="undoBatch(batch)">
                {{ t('common.undo') }}
              </v-btn>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <div class="view__body stack">
      <v-progress-linear v-if="rules.state.loading" indeterminate color="primary" />

      <v-empty-state
        v-if="!rules.state.loading && rules.state.items.length === 0"
        icon="mdi-auto-fix"
        :title="t('rules.empty')"
        :text="t('rules.emptyText')"
      />

      <v-card v-for="rule in rules.state.items" v-else :key="rule.id">
        <v-card-text class="stack">
          <div class="row row--between">
            <div class="row" style="min-width: 0">
              <strong class="truncate">{{ rule.name }}</strong>
              <v-chip size="small" variant="tonal">{{ matchLabel(rule) }}</v-chip>
              <v-chip v-if="!rules.state.availability[rule.id]?.source" size="small" color="error" variant="tonal">
                {{ t('rules.sourceMissing') }}
              </v-chip>
              <v-chip v-if="!rules.state.availability[rule.id]?.target" size="small" color="error" variant="tonal">
                {{ t('rules.targetMissing') }}
              </v-chip>
            </div>
            <v-switch
              :model-value="rule.enabled"
              color="primary"
              density="compact"
              hide-details
              :title="rule.enabled ? t('rules.disableRule') : t('rules.enableRule')"
              @update:model-value="toggleEnabled(rule, Boolean($event))"
            />
          </div>

          <div class="muted mono truncate" :title="`${rule.sourcePath} → ${rule.targetPath}`">
            {{ rule.sourcePath }} → {{ rule.targetPath }}
          </div>

          <div class="row">
            <v-btn size="small" variant="text" prepend-icon="mdi-eye-outline" @click="openPreview([rule.id])">
              {{ t('rules.preview') }}
            </v-btn>
            <v-btn
              size="small"
              variant="text"
              color="primary"
              prepend-icon="mdi-play-circle-outline"
              @click="runRules([rule.id])"
            >
              {{ t('rules.apply') }}
            </v-btn>
            <v-btn size="small" variant="text" @click="openEdit(rule)">{{ t('common.edit') }}</v-btn>
            <v-btn size="small" variant="text" color="error" @click="removeRule(rule)">{{ t('common.delete') }}</v-btn>
          </div>
        </v-card-text>
      </v-card>

    </div>

    <v-dialog v-model="previewState.open" :max-width="680">
      <v-card class="dialog__card">
        <v-card-title class="dialog__title">{{ t('rules.previewTitle') }}</v-card-title>
        <v-card-text class="stack" style="max-height: 420px; overflow: auto">
          <div v-for="group in previewState.groups" :key="group.ruleId" class="stack" style="gap: 4px">
            <div class="row">
              <strong>{{ group.ruleName }}</strong>
              <span class="muted mono">{{ t('common.items', { count: group.matches.length }) }}</span>
            </div>
            <p v-for="message in group.errors" :key="message" class="dialog__error">{{ message }}</p>
            <div v-if="group.matches.length > 0" class="preview">
              <div v-for="match in group.matches" :key="match.path" class="rule-preview__row">
                <span class="truncate">{{ match.name }}</span>
                <span class="muted">→</span>
                <span class="muted mono truncate" :title="match.targetPath">{{ match.targetPath }}</span>
                <v-chip v-if="match.conflict" size="small" color="error" variant="tonal">
                  {{ t('rules.conflict') }}
                </v-chip>
              </div>
            </div>
          </div>
          <p v-if="totalMatches === 0 && previewErrors.length === 0" class="muted">{{ t('rules.noMatches') }}</p>
        </v-card-text>
        <v-card-actions>
          <span v-if="conflictCount > 0" class="dialog__warning">
            {{ t('rules.conflictsWontOverwrite', { count: conflictCount }) }}
          </span>
          <v-spacer />
          <v-btn variant="text" @click="previewState.open = false">{{ t('common.close') }}</v-btn>
          <v-btn color="primary" :disabled="totalMatches === 0" @click="applyFromPreview">
            {{ t('rules.apply') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="editor.open" :max-width="560">
      <v-card class="dialog__card">
        <v-card-title class="dialog__title">
          {{ editor.id === null ? t('rules.editorNew') : t('rules.editorEdit') }}
        </v-card-title>
        <v-card-text class="stack">
          <v-text-field
            v-model="editor.name"
            :label="t('rules.ruleName')"
            :placeholder="t('rules.ruleNamePlaceholder')"
          />

          <div class="row" style="flex-wrap: wrap">
            <v-select
              v-model="editor.matchType"
              class="rule__field--type"
              :items="[
                { title: t('rules.matchByExtension'), value: 'extension' },
                { title: t('rules.matchByName'), value: 'name' }
              ]"
              :label="t('rules.matchType')"
            />
            <v-text-field
              v-model="editor.pattern"
              class="rule__field--pattern"
              :label="editor.matchType === 'extension' ? t('rules.extensionLabel') : t('rules.nameLabel')"
              :placeholder="
                editor.matchType === 'extension' ? t('rules.extensionPlaceholder') : t('rules.namePlaceholder')
              "
            />
          </div>

          <div class="row">
            <v-select
              v-model="editor.sourcePath"
              class="grow"
              :items="pathOptions"
              :label="t('rules.sourcePath')"
              hide-details
            />
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-folder-search-outline"
              @click="pickInto('sourcePath')"
            >
              {{ t('rules.select') }}
            </v-btn>
          </div>

          <div class="row">
            <v-select
              v-model="editor.targetPath"
              class="grow"
              :items="pathOptions"
              :label="t('rules.targetPath')"
              hide-details
            />
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-folder-search-outline"
              @click="pickInto('targetPath')"
            >
              {{ t('rules.select') }}
            </v-btn>
          </div>

          <v-switch v-model="editor.enabled" color="primary" :label="t('rules.enabled')" hide-details />
          <p v-if="editorError" class="dialog__error">{{ editorError }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editor.open = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" @click="save">{{ t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>
