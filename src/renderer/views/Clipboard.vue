<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ClipboardEntry } from '@shared/types'
import { t } from '../i18n'
import { useClipboard } from '../stores/clipboard'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'

const ui = useUi()
const clipboard = useClipboard()
const settings = useSettings()

/** 长文本默认只显示前几行，展开的那几条记 id */
const expanded = ref<number[]>([])
let unsubscribe: (() => void) | null = null

const total = computed(() => clipboard.state.items.length)
const limit = computed(() => settings.state.settings?.clipboardHistoryLimit ?? 10)

function isExpanded(id: number): boolean {
  return expanded.value.includes(id)
}

function toggleExpand(id: number): void {
  expanded.value = isExpanded(id) ? expanded.value.filter((item) => item !== id) : [...expanded.value, id]
}

/** 文本预览：单行显示长度，多行显示行数 */
function textMeta(entry: ClipboardEntry): string {
  const lines = entry.text.split('\n').length
  return lines > 1 ? t('clipboard.lines', { count: lines }) : t('clipboard.chars', { count: entry.text.length })
}

function fileName(target: string): string {
  const parts = target.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? target
}

function timeLabel(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString()
}

async function clearHistory(): Promise<void> {
  const confirmed = await ui.confirm({
    title: t('clipboard.clearTitle'),
    message: t('clipboard.clearMessage', { count: total.value }),
    confirmText: t('common.clear'),
    danger: true
  })
  if (confirmed) await clipboard.clear()
}

onMounted(() => {
  void clipboard.load()
  // 主进程轮询到新内容会推送过来，这里跟着刷新
  unsubscribe = clipboard.subscribe(() => void clipboard.load())
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <section class="view">
    <div class="view__header">
      <div class="view__title">
        <span>{{ t('clipboard.title') }}</span>
        <span class="muted mono">{{ t('clipboard.countLabel', { total, limit }) }}</span>
      </div>
      <div class="row">
        <v-btn size="small" variant="text" prepend-icon="mdi-refresh" @click="clipboard.load()">
          {{ t('common.refresh') }}
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          color="error"
          prepend-icon="mdi-delete-sweep-outline"
          :disabled="total === 0"
          @click="clearHistory"
        >
          {{ t('common.clear') }}
        </v-btn>
      </div>
    </div>

    <div class="view__body clipboard__body">
      <p class="muted">{{ t('clipboard.intro', { limit }) }}</p>

      <v-progress-linear v-if="clipboard.state.loading && total === 0" indeterminate color="primary" />

      <v-empty-state
        v-if="!clipboard.state.loading && total === 0"
        icon="mdi-content-paste"
        :title="t('clipboard.empty')"
        :text="t('clipboard.emptyText')"
      />

      <v-card v-for="entry in clipboard.state.items" v-else :key="entry.id">
        <v-card-text class="stack">
          <div class="row row--between">
            <div class="row">
              <v-chip size="x-small" variant="tonal" :prepend-icon="entry.kind === 'files' ? 'mdi-file-multiple-outline' : 'mdi-format-text'">
                {{
                  entry.kind === 'files'
                    ? t('clipboard.kindFiles', { count: entry.paths.length })
                    : t('clipboard.kindText', { meta: textMeta(entry) })
                }}
              </v-chip>
              <span class="muted mono">{{ timeLabel(entry.createdAt) }}</span>
            </div>
            <div class="row">
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-content-copy"
                @click="clipboard.copy(entry.id)"
              >
                复制
              </v-btn>
              <v-btn size="small" variant="text" @click="clipboard.remove(entry.id)">{{ t('common.delete') }}</v-btn>
            </div>
          </div>

          <template v-if="entry.kind === 'files'">
            <div v-for="target in entry.paths" :key="target" class="clipboard__file">
              <v-icon size="small" icon="mdi-file-outline" />
              <div class="clipboard__file-text">
                <div class="truncate">{{ fileName(target) }}</div>
                <div class="muted mono truncate" :title="target">{{ target }}</div>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="clipboard__text" :class="{ 'clipboard__text--clamped': !isExpanded(entry.id) }">
              {{ entry.text }}
            </div>
            <v-btn
              v-if="entry.text.length > 300 || entry.text.split('\n').length > 6"
              size="small"
              variant="text"
              class="clipboard__toggle"
              @click="toggleExpand(entry.id)"
            >
              {{ isExpanded(entry.id) ? t('common.collapse') : t('clipboard.expandAll') }}
            </v-btn>
          </template>
        </v-card-text>
      </v-card>
    </div>
  </section>
</template>
