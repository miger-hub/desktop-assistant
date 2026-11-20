<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { Note } from '@shared/types'
import { t } from '../i18n'
import { useNotes } from '../stores/notes'
import { useUi } from '../stores/ui'

const ui = useUi()
const notes = useNotes()

const draft = reactive({ title: '', content: '', url: '' })
const draftError = ref('')
const draftTitleEl = ref<{ focus: () => void } | null>(null)

const editor = reactive({
  open: false,
  id: null as number | null,
  title: '',
  content: '',
  url: '',
  error: ''
})

/** 从搜索跳过来时高亮的那条备忘 */
const highlightedId = ref<number | null>(null)

const total = computed(() => notes.state.items.length)

const draftUrl = computed(() => draft.url.trim())

/** 标题栏的「新建备忘」：聚焦到添加区的标题输入框 */
function focusDraft(): void {
  void nextTick(() => draftTitleEl.value?.focus())
}

async function addNote(): Promise<void> {
  if (!draft.title.trim()) {
    draftError.value = t('notes.titleRequired')
    return
  }
  draftError.value = ''

  const ok = await notes.create({ title: draft.title, content: draft.content, url: draftUrl.value })
  if (!ok) return

  draft.title = ''
  draft.content = ''
  draft.url = ''
  ui.toast(t('notes.added'), 'success')
}

function openEdit(note: Note): void {
  editor.open = true
  editor.id = note.id
  editor.title = note.title
  editor.content = note.content
  editor.url = note.url
  editor.error = ''
}

async function saveEdit(): Promise<void> {
  if (!editor.id) return
  if (!editor.title.trim()) {
    editor.error = t('notes.titleRequired')
    return
  }
  editor.error = ''

  const ok = await notes.update(editor.id, { title: editor.title, content: editor.content, url: editor.url })
  if (ok) {
    editor.open = false
    ui.toast(t('notes.saved'), 'success')
  }
}

async function removeNote(note: Note): Promise<void> {
  const confirmed = await ui.confirm({
    title: t('notes.removeTitle', { name: note.title }),
    message: t('notes.removeMessage'),
    confirmText: t('common.delete'),
    danger: true
  })
  if (!confirmed) return
  if (await notes.remove(note.id)) ui.toast(t('notes.deleted'), 'success')
}

/** 复制到剪贴板；剪贴板不可用时把内容贴到 Toast 里，至少能手动复制 */
async function copy(text: string, label: string): Promise<void> {
  const value = text.trim()
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    ui.toast(t('toast.copied', { label }), 'success')
  } catch {
    ui.toast(value, 'info')
  }
}

async function openUrl(url: string, note?: Note): Promise<void> {
  try {
    await window.desktop.system.openUrl(url)
    if (note) {
      await window.desktop.note.markLinkUsed(note.id)
      note.lastLinkUsedAt = new Date().toISOString()
    }
  } catch (error) {
    ui.handleError(error, t('error.openLink'))
  }
}

// 从搜索结果跳转过来：滚动到对应备忘并短暂高亮
async function revealNote(id: number): Promise<void> {
  // 从搜索跳过来时本页可能才刚挂载、列表还没加载，先保证这条备忘在列表里再滚动
  if (!notes.state.items.some((note) => note.id === id)) await notes.load()
  highlightedId.value = id
  await nextTick()
  document.querySelector(`[data-note-id="${id}"]`)?.scrollIntoView({ block: 'center' })
  window.setTimeout(() => {
    if (highlightedId.value === id) highlightedId.value = null
  }, 2400)
}

// 本页已经挂载时，focusId 变化能直接触发
watch(
  () => notes.state.focusId,
  (id) => {
    if (id === null) return
    notes.state.focusId = null
    void revealNote(id)
  }
)

onMounted(async () => {
  if (notes.state.items.length === 0) await notes.load()
  // 搜索跳转会在本页挂载前就写好 focusId，此时 watch 还没建立、也不会再触发，这里补一次
  if (notes.state.focusId !== null) {
    const id = notes.state.focusId
    notes.state.focusId = null
    void revealNote(id)
  }
})
</script>

<template>
  <section class="view">
    <div class="view__header">
      <div class="view__title">
        <span>{{ t('notes.title') }}</span>
        <span class="muted mono">{{ t('common.entries', { count: total }) }}</span>
      </div>
      <div class="row">
        <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="focusDraft">
          {{ t('notes.new') }}
        </v-btn>
      </div>
    </div>

    <!-- 添加区固定在页面最上方 -->
    <div class="view__fixed">
      <v-card class="todo__add">
        <v-card-text class="stack">
          <div class="todo__fields">
            <v-text-field
              ref="draftTitleEl"
              v-model="draft.title"
              class="todo__field--title"
              :label="t('notes.titleLabel')"
              :placeholder="t('notes.titlePlaceholder')"
              @keydown.enter="addNote"
            />
            <v-text-field
              v-model="draft.url"
              class="note__field--url"
              :label="t('notes.urlLabel')"
              placeholder="example.com"
              @keydown.enter="addNote"
            />
            <v-btn class="todo__submit" color="primary" @click="addNote">{{ t('notes.add') }}</v-btn>
          </div>
          <v-textarea
            v-model="draft.content"
            :label="t('notes.contentLabel')"
            rows="2"
            auto-grow
            hide-details
            :placeholder="t('notes.contentPlaceholder')"
          />
          <p v-if="draftError" class="dialog__error">{{ draftError }}</p>
        </v-card-text>
      </v-card>
    </div>

    <!-- 用 notes__body：和待办页一样，列表卡片不能被 v-empty-state 的 min-height 压扁 -->
    <div class="view__body notes__body">
      <v-progress-linear v-if="notes.state.loading" indeterminate color="primary" />

      <v-empty-state
        v-if="!notes.state.loading && total === 0"
        icon="mdi-note-text-outline"
        :title="t('notes.empty')"
        :text="t('notes.emptyText')"
      />

      <v-card
        v-for="note in notes.state.items"
        v-else
        :key="note.id"
        :data-note-id="note.id"
        :class="{ 'is-highlighted': highlightedId === note.id }"
      >
        <v-card-text class="stack">
          <div class="row row--between">
            <strong class="truncate">{{ note.title }}</strong>
            <div class="row">
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-content-copy"
                :disabled="!note.content.trim()"
                @click="copy(note.content, t('notes.content'))"
              >
                {{ t('notes.copyContent') }}
              </v-btn>
              <v-btn
                v-if="note.url"
                size="small"
                variant="text"
                prepend-icon="mdi-open-in-new"
                @click="openUrl(note.url, note)"
              >
                {{ t('notes.openLink') }}
              </v-btn>
              <v-btn size="small" variant="text" @click="openEdit(note)">{{ t('common.edit') }}</v-btn>
              <v-btn size="small" variant="text" color="error" @click="removeNote(note)">
                {{ t('common.delete') }}
              </v-btn>
            </div>
          </div>

          <div v-if="note.content" class="note__content">{{ note.content }}</div>

          <div v-if="note.url" class="row" style="min-width: 0">
            <a class="note__url truncate" :href="note.url" @click.prevent="openUrl(note.url, note)">{{ note.url }}</a>
            <v-btn size="small" variant="text" @click="copy(note.url, t('notes.link'))">{{ t('notes.copyLink') }}</v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="editor.open" :max-width="560">
      <v-card class="dialog__card">
        <v-card-title class="dialog__title">{{ t('notes.editTitle') }}</v-card-title>
        <v-card-text class="stack">
          <v-text-field v-model="editor.title" :label="t('notes.titleLabel')" />
          <v-textarea v-model="editor.content" :label="t('notes.content')" rows="4" auto-grow />
          <v-text-field v-model="editor.url" :label="t('notes.urlLabel')" placeholder="example.com" />
          <p v-if="editor.error" class="dialog__error">{{ editor.error }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editor.open = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" @click="saveEdit">{{ t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>
