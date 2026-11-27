<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import type { NoteDocument, NoteFolder } from '@shared/types'
import { extractNoteHeadings } from '@shared/noteDocument'
import NoteEditor from '../components/NoteEditor.vue'
import { t } from '../i18n'
import { useNoteDocuments } from '../stores/noteDocuments'
import { useUi } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'

interface FlatFolder {
  name: string
  path: string
  depth: number
}

const docs = useNoteDocuments()
const ui = useUi()
const workspaces = useWorkspaces()

const selectedFolder = ref('')
const keyword = ref('')
const editorTitle = ref('')
const editorContent = ref('')
const editorWorkspaceId = ref<number | null>(null)
const editorKey = ref(0)
const editorRef = ref<InstanceType<typeof NoteEditor> | null>(null)
let saveTimer: number | undefined

const current = computed(() => docs.state.current)
const headings = computed(() => extractNoteHeadings(editorContent.value))
const workspaceOptions = computed(() => [
  { title: t('noteDoc.workspaceNone'), value: null as number | null },
  ...workspaces.state.items.map((workspace) => ({ title: workspace.name, value: workspace.id }))
])

function flattenFolders(folders: NoteFolder[], depth = 0): FlatFolder[] {
  return folders.flatMap((folder) => [
    { name: folder.name, path: folder.path, depth },
    ...flattenFolders(folder.children, depth + 1)
  ])
}

const folders = computed(() => flattenFolders(docs.state.tree.folders))
const selectedFolderName = computed(
  () => folders.value.find((folder) => folder.path === selectedFolder.value)?.name ?? t('noteDoc.rootFolder')
)
const visibleNotes = computed(() => {
  const needle = keyword.value.trim().toLowerCase()
  return docs.state.tree.notes.filter((note) => {
    if (selectedFolder.value && note.folderPath !== selectedFolder.value) return false
    if (!needle) return true
    return note.title.toLowerCase().includes(needle) || note.excerpt.toLowerCase().includes(needle)
  })
})

function workspaceName(id: number | null): string {
  if (id === null) return ''
  return workspaces.state.items.find((workspace) => workspace.id === id)?.name ?? ''
}

function clearSaveTimer(): void {
  window.clearTimeout(saveTimer)
  saveTimer = undefined
}

function populate(document: NoteDocument): void {
  editorTitle.value = document.title
  editorContent.value = document.content
  editorWorkspaceId.value = document.workspaceId
  editorKey.value += 1
}

function markDirty(): void {
  docs.state.dirty = true
  clearSaveTimer()
  saveTimer = window.setTimeout(() => void saveNow(false), 700)
}

function onEditorContent(content: string): void {
  editorContent.value = content
  markDirty()
}

async function saveNow(notify = false): Promise<boolean> {
  clearSaveTimer()
  const before = docs.state.current
  if (!before) return true

  const title = editorTitle.value.trim()
  if (!title) {
    if (notify) ui.toast(t('notes.titleRequired'), 'error')
    return false
  }
  const snapshot = {
    title,
    content: editorContent.value,
    workspaceId: editorWorkspaceId.value
  }

  const saved = await docs.save(before.path, snapshot)
  if (!saved) return false

  const changedMeanwhile =
    editorTitle.value.trim() !== snapshot.title ||
    editorContent.value !== snapshot.content ||
    editorWorkspaceId.value !== snapshot.workspaceId
  if (changedMeanwhile) {
    docs.state.dirty = true
    markDirty()
  } else {
    editorTitle.value = saved.title
    docs.state.dirty = false
  }
  if (notify) ui.toast(t('noteDoc.saved'), 'success')
  return true
}

async function openDocument(path: string): Promise<void> {
  if (docs.state.current?.path === path && !docs.state.dirty) return
  if (docs.state.dirty && !(await saveNow(false))) return
  const document = await docs.open(path)
  if (document) {
    selectedFolder.value = document.folderPath
    populate(document)
  }
}

async function createNote(): Promise<void> {
  const title = await ui.promptInput({
    title: t('noteDoc.new'),
    label: t('noteDoc.titleLabel'),
    confirmText: t('common.create')
  })
  if (!title?.trim()) return
  if (docs.state.dirty && !(await saveNow(false))) return

  const document = await docs.create({
    title,
    folderPath: selectedFolder.value,
    workspaceId: editorWorkspaceId.value
  })
  if (!document) return
  selectedFolder.value = document.folderPath
  populate(document)
}

async function createFolder(): Promise<void> {
  const name = await ui.promptInput({
    title: t('noteDoc.folderNameTitle'),
    label: t('noteDoc.folderNameLabel'),
    confirmText: t('common.create')
  })
  if (!name?.trim()) return
  try {
    await window.desktop.noteDocs.createFolder(selectedFolder.value, name)
    await docs.loadTree()
    ui.toast(t('noteDoc.folderCreated'), 'success')
  } catch (error) {
    ui.handleError(error, t('error.createNoteFolder'))
  }
}

async function renameFolder(): Promise<void> {
  if (!selectedFolder.value) return
  const folder = folders.value.find((item) => item.path === selectedFolder.value)
  if (!folder) return
  const name = await ui.promptInput({
    title: t('noteDoc.folderRenameTitle'),
    label: t('noteDoc.folderNameLabel'),
    value: folder.name,
    confirmText: t('common.rename')
  })
  if (!name?.trim() || name.trim() === folder.name) return
  if (docs.state.dirty && !(await saveNow(false))) return
  const activePath = current.value?.path
  try {
    const next = await window.desktop.noteDocs.renameFolder(folder.path, name)
    await docs.loadTree()
    if (activePath?.startsWith(`${folder.path}/`)) {
      const relative = activePath.slice(folder.path.length + 1)
      const updated = await docs.open(`${next}/${relative}`)
      if (updated) populate(updated)
    }
    selectedFolder.value = next
    ui.toast(t('noteDoc.folderRenamed'), 'success')
  } catch (error) {
    ui.handleError(error, t('error.renameNoteFolder'))
  }
}

async function removeFolder(): Promise<void> {
  if (!selectedFolder.value) return
  const folder = folders.value.find((item) => item.path === selectedFolder.value)
  if (!folder) return
  const confirmed = await ui.confirm({
    title: t('noteDoc.folderDeleteTitle', { name: folder.name }),
    message: t('noteDoc.folderDeleteMessage'),
    confirmText: t('common.delete'),
    danger: true
  })
  if (!confirmed) return
  try {
    clearSaveTimer()
    await window.desktop.noteDocs.removeFolder(folder.path)
    if (current.value?.path.startsWith(`${folder.path}/`)) {
      docs.state.current = null
      editorKey.value += 1
    }
    selectedFolder.value = ''
    await docs.loadTree()
    ui.toast(t('noteDoc.folderDeleted'), 'success')
  } catch (error) {
    ui.handleError(error, t('error.removeNoteFolder'))
  }
}

async function removeCurrent(): Promise<void> {
  const document = current.value
  if (!document) return
  clearSaveTimer()
  const confirmed = await ui.confirm({
    title: t('noteDoc.deleteTitle', { name: editorTitle.value || document.title }),
    message: t('noteDoc.deleteMessage'),
    confirmText: t('common.delete'),
    danger: true
  })
  if (!confirmed) return
  if (await docs.remove(document.path)) ui.toast(t('noteDoc.deleted'), 'success')
}

async function revealCurrent(): Promise<void> {
  if (!current.value) return
  try {
    await window.desktop.noteDocs.reveal(current.value.path)
  } catch (error) {
    ui.handleError(error, t('error.revealNote'))
  }
}

function scrollToHeading(index: number): void {
  editorRef.value?.scrollToHeading(index)
}

async function applyFocus(): Promise<void> {
  const path = docs.state.focusPath
  if (!path) return
  docs.state.focusPath = null
  await docs.loadTree()
  const summary = docs.state.tree.notes.find((note) => note.path === path)
  if (!summary) return
  selectedFolder.value = summary.folderPath
  await openDocument(path)
  await nextTick()
}

watch(
  () => docs.state.focusPath,
  () => void applyFocus()
)

onMounted(async () => {
  if (workspaces.state.items.length === 0) await workspaces.load()
  await docs.loadTree()
  if (docs.state.focusPath) {
    await applyFocus()
  } else if (!docs.state.current) {
    const first = docs.state.tree.notes[0]
    if (first) await openDocument(first.path)
  } else {
    populate(docs.state.current)
  }
})

onBeforeUnmount(() => {
  clearSaveTimer()
  if (docs.state.dirty) void saveNow(false)
})
</script>

<template>
  <section class="view note-doc-view">
    <div class="view__header">
      <div class="view__title">
        <span>{{ t('noteDoc.title') }}</span>
        <span class="muted mono">{{ t('common.entries', { count: docs.state.tree.notes.length }) }}</span>
      </div>
      <div class="row">
        <v-btn size="small" variant="text" prepend-icon="mdi-note-text-outline" @click="docs.showMemo">
          {{ t('noteDoc.memoTab') }}
        </v-btn>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-folder-plus-outline" @click="createFolder">
          {{ t('noteDoc.newFolder') }}
        </v-btn>
        <v-btn size="small" color="primary" prepend-icon="mdi-plus" @click="createNote">
          {{ t('noteDoc.new') }}
        </v-btn>
      </div>
    </div>

    <div class="note-docs">
      <aside class="note-library">
        <div class="note-library__header">
          <strong class="truncate">{{ selectedFolderName }}</strong>
          <div class="row">
            <v-btn
              v-if="selectedFolder"
              size="x-small"
              variant="text"
              icon="mdi-pencil-outline"
              :title="t('noteDoc.renameFolder')"
              @click="renameFolder"
            />
            <v-btn
              v-if="selectedFolder"
              size="x-small"
              variant="text"
              color="error"
              icon="mdi-folder-remove-outline"
              :title="t('noteDoc.deleteFolder')"
              @click="removeFolder"
            />
          </div>
        </div>

        <v-list nav density="compact" class="note-library__folders">
          <v-list-item
            :active="selectedFolder === ''"
            color="primary"
            rounded="lg"
            prepend-icon="mdi-notebook-outline"
            @click="selectedFolder = ''"
          >
            <v-list-item-title>{{ t('noteDoc.rootFolder') }}</v-list-item-title>
          </v-list-item>
          <v-list-item
            v-for="folder in folders"
            :key="folder.path"
            :active="selectedFolder === folder.path"
            :style="{ paddingLeft: `${12 + folder.depth * 14}px` }"
            color="primary"
            rounded="lg"
            prepend-icon="mdi-folder-outline"
            @click="selectedFolder = folder.path"
          >
            <v-list-item-title class="truncate">{{ folder.name }}</v-list-item-title>
          </v-list-item>
        </v-list>

        <div class="note-library__search">
          <v-text-field
            v-model="keyword"
            density="compact"
            hide-details
            clearable
            prepend-inner-icon="mdi-magnify"
            :placeholder="t('noteDoc.filterPlaceholder')"
          />
        </div>

        <v-list nav density="compact" class="note-library__notes">
          <v-list-item
            v-for="note in visibleNotes"
            :key="note.path"
            :active="current?.path === note.path"
            color="primary"
            rounded="lg"
            @click="openDocument(note.path)"
          >
            <template #prepend>
              <v-icon icon="mdi-language-markdown-outline" size="18" />
            </template>
            <v-list-item-title class="truncate">{{ note.title }}</v-list-item-title>
            <v-list-item-subtitle class="truncate">
              {{ note.excerpt || workspaceName(note.workspaceId) || note.folderPath || t('noteDoc.rootFolder') }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <v-empty-state
          v-if="!docs.state.loading && visibleNotes.length === 0"
          icon="mdi-note-plus-outline"
          :title="selectedFolder ? t('noteDoc.emptyFolder') : t('noteDoc.empty')"
          :text="t('noteDoc.emptyText')"
        />
      </aside>

      <main class="note-workspace">
        <v-progress-linear v-if="docs.state.opening || docs.state.saving" indeterminate color="primary" height="2" />
        <template v-if="current">
          <div class="note-workspace__meta">
            <v-text-field
              v-model="editorTitle"
              class="note-workspace__title"
              density="compact"
              hide-details
              :label="t('noteDoc.titleLabel')"
              @update:model-value="markDirty"
              @keydown.enter.prevent="saveNow(true)"
            />
            <v-select
              v-model="editorWorkspaceId"
              class="note-workspace__workspace"
              density="compact"
              hide-details
              :items="workspaceOptions"
              :label="t('noteDoc.workspace')"
              @update:model-value="markDirty"
            />
            <span class="muted note-workspace__status">
              {{ docs.state.saving ? t('noteDoc.saving') : docs.state.dirty ? t('noteDoc.unsaved') : t('noteDoc.saved') }}
            </span>
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-content-save-outline"
              :disabled="!docs.state.dirty"
              @click="saveNow(true)"
            >
              {{ t('noteDoc.save') }}
            </v-btn>
            <v-btn size="small" variant="text" icon="mdi-folder-open-outline" :title="t('noteDoc.reveal')" @click="revealCurrent" />
            <v-btn
              size="small"
              variant="text"
              color="error"
              icon="mdi-trash-can-outline"
              :title="t('common.delete')"
              @click="removeCurrent"
            />
          </div>

          <div class="note-workspace__body">
            <div class="note-workspace__editor">
              <MilkdownProvider>
                <NoteEditor
                  ref="editorRef"
                  :key="editorKey"
                  :note-path="current.path"
                  :content="editorContent"
                  @update:content="onEditorContent"
                />
              </MilkdownProvider>
            </div>

            <aside class="note-toc">
              <div class="note-toc__title">
                <v-icon icon="mdi-format-list-bulleted" size="17" />
                <span>{{ t('noteDoc.toc') }}</span>
              </div>
              <v-list v-if="headings.length" density="compact" nav class="note-toc__list">
                <v-list-item
                  v-for="heading in headings"
                  :key="heading.index"
                  :style="{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }"
                  @click="scrollToHeading(heading.index)"
                >
                  <v-list-item-title class="truncate note-toc__item">{{ heading.text }}</v-list-item-title>
                </v-list-item>
              </v-list>
              <p v-else class="muted note-toc__empty">{{ t('noteDoc.tocEmpty') }}</p>
            </aside>
          </div>

          <div class="note-workspace__mobile-toc">
            <v-menu location="bottom end">
              <template #activator="{ props }">
                <v-btn v-bind="props" size="small" variant="tonal" prepend-icon="mdi-format-list-bulleted">
                  {{ t('noteDoc.toc') }}
                </v-btn>
              </template>
              <v-list v-if="headings.length" density="compact">
                <v-list-item v-for="heading in headings" :key="heading.index" @click="scrollToHeading(heading.index)">
                  <v-list-item-title>{{ heading.text }}</v-list-item-title>
                </v-list-item>
              </v-list>
              <div v-else class="note-toc__menu-empty muted">{{ t('noteDoc.tocEmpty') }}</div>
            </v-menu>
          </div>
        </template>

        <v-empty-state
          v-else
          icon="mdi-language-markdown-outline"
          :title="docs.state.tree.notes.length ? t('noteDoc.chooseNote') : t('noteDoc.empty')"
          :text="docs.state.tree.notes.length ? t('noteDoc.chooseNoteText') : t('noteDoc.emptyText')"
        />
      </main>
    </div>
  </section>
</template>
