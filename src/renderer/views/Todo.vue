<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { Todo, TodoPriority, TodoStatus } from '@shared/types'
import { formatDurationLabel, isOverdue, todoPriorityLabel } from '../composables/format'
import { t } from '../i18n'
import { useTodos } from '../stores/todos'
import { useUi } from '../stores/ui'
import { useWorkspaces } from '../stores/workspaces'

const ui = useUi()
const { state: todoState, pending, done, load, create, update, remove, cycleStatus } = useTodos()
const workspaces = useWorkspaces()
const filter = todoState.filter

const draft = reactive({
  title: '',
  workspaceId: 'inbox' as 'inbox' | number,
  priority: 'normal' as TodoPriority,
  dueDate: ''
})

const editing = ref<Todo | null>(null)
const editDraft = reactive({
  title: '',
  description: '',
  priority: 'normal' as TodoPriority,
  status: 'todo' as TodoStatus,
  dueDate: '',
  workspaceId: 'inbox' as 'inbox' | number
})

const statusFilterOptions = computed<Array<{ value: TodoStatus | 'all'; label: string }>>(() => [
  { value: 'all', label: t('todo.filterAll') },
  { value: 'todo', label: t('todo.filterTodo') },
  { value: 'doing', label: t('todo.filterDoing') },
  { value: 'done', label: t('todo.filterDone') }
])

const priorityOptions = computed(() => [
  { title: t('todo.priorityLow'), value: 'low' },
  { title: t('todo.priorityNormal'), value: 'normal' },
  { title: t('todo.priorityHigh'), value: 'high' }
])

const workspaceItems = computed(() => [
  { title: t('todo.inbox'), value: 'inbox' },
  ...workspaces.state.items.map((item) => ({ title: item.name, value: item.id }))
])

const filterWorkspaceItems = computed(() => [
  { title: t('todo.allWorkspaces'), value: 'all' },
  { title: t('todo.inbox'), value: null },
  ...workspaces.state.items.map((item) => ({ title: item.name, value: item.id }))
])

const editStatusOptions = computed(() => [
  { title: t('todo.statusTodo'), value: 'todo' },
  { title: t('todo.statusDoing'), value: 'doing' },
  { title: t('todo.statusDone'), value: 'done' }
])

const statusIcons: Record<TodoStatus, string> = {
  todo: 'mdi-checkbox-blank-circle-outline',
  doing: 'mdi-progress-clock',
  done: 'mdi-checkbox-marked-circle-outline'
}

function workspaceLabel(id: number | null): string {
  if (id === null) return t('todo.inbox')
  return workspaces.state.items.find((workspace) => workspace.id === id)?.name ?? t('todo.deletedWorkspace')
}

async function createTodo(): Promise<void> {
  const title = draft.title.trim()
  if (!title) {
    ui.toast(t('todo.inputRequired'), 'error')
    return
  }

  const ok = await create({
    title,
    workspaceId: draft.workspaceId === 'inbox' ? null : draft.workspaceId,
    priority: draft.priority,
    dueDate: draft.dueDate || null
  })

  // 失败时保留用户输入，避免白打字
  if (!ok) return

  draft.title = ''
  draft.dueDate = ''
}

function startEdit(todo: Todo): void {
  editing.value = todo
  editDraft.title = todo.title
  editDraft.description = todo.description
  editDraft.priority = todo.priority
  editDraft.status = todo.status
  editDraft.dueDate = todo.dueDate ?? ''
  editDraft.workspaceId = todo.workspaceId ?? 'inbox'
}

async function saveEdit(): Promise<void> {
  const todo = editing.value
  if (!todo) return

  const ok = await update(todo.id, {
    title: editDraft.title,
    description: editDraft.description,
    priority: editDraft.priority,
    status: editDraft.status,
    dueDate: editDraft.dueDate || null,
    workspaceId: editDraft.workspaceId === 'inbox' ? null : editDraft.workspaceId
  })

  // 保存失败时保持编辑态，不丢掉刚改的内容
  if (ok) editing.value = null
}

async function removeTodo(todo: Todo): Promise<void> {
  const confirmed = await ui.confirm({
    title: t('todo.deleteTitle'),
    message: todo.title,
    confirmText: t('common.delete'),
    danger: true
  })
  if (!confirmed) return
  await remove(todo.id)
}

/** 点击归属跳回对应工作区（收件箱没有工作区可跳） */
function openWorkspace(todo: Todo): void {
  if (todo.workspaceId === null) return
  workspaces.focusWorkspace(todo.workspaceId)
  ui.setView('workspace')
}

onMounted(async () => {
  if (workspaces.state.items.length === 0) await workspaces.load()
  await load()
})
</script>

<template>
  <section class="view">
    <div class="view__header">
      <div class="view__title">
        <span>{{ t('todo.title') }}</span>
        <span class="muted mono">{{ t('todo.pendingDone', { pending: pending.length, done: done.length }) }}</span>
      </div>
      <v-btn-toggle
        :model-value="filter.status"
        density="comfortable"
        variant="outlined"
        divided
        @update:model-value="
          (value) => {
            if (value !== undefined) {
              filter.status = value as TodoStatus | 'all'
              load()
            }
          }
        "
      >
        <v-btn v-for="option in statusFilterOptions" :key="option.value" :value="option.value" size="small">
          {{ option.label }}
        </v-btn>
      </v-btn-toggle>
    </div>

    <!-- 添加区与搜索区固定在页面最上方：列表怎么滚它们都不动 -->
    <div class="view__fixed">
      <v-card class="todo__add">
        <v-card-text>
          <div class="todo__fields">
            <v-text-field
              v-model="draft.title"
              class="todo__field--title"
              :label="t('todo.addLabel')"
              :placeholder="t('todo.addPlaceholder')"
              @keydown.enter="createTodo"
            />
            <v-select
              v-model="draft.workspaceId"
              class="todo__field--workspace"
              :items="workspaceItems"
              :label="t('todo.owner')"
            />
            <v-select
              v-model="draft.priority"
              class="todo__field--priority"
              :items="priorityOptions"
              :label="t('todo.priority')"
            />
            <v-text-field v-model="draft.dueDate" class="todo__field--date" type="date" :label="t('todo.due')" />
            <v-btn class="todo__submit" color="primary" @click="createTodo">{{ t('todo.add') }}</v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card class="todo__search">
        <v-card-text>
          <div class="todo__fields">
            <v-select
              v-model="filter.workspaceId"
              class="todo__field--filter"
              :items="filterWorkspaceItems"
              hide-details
              @update:model-value="load()"
            />
            <v-text-field
              v-model="filter.keyword"
              class="grow"
              :placeholder="t('todo.filterPlaceholder')"
              hide-details
              @keydown.enter="load()"
            />
            <v-btn class="todo__submit" variant="tonal" prepend-icon="mdi-magnify" @click="load()">
              {{ t('todo.search') }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <div class="view__body todo__body">
      <v-progress-linear v-if="todoState.loading" indeterminate color="primary" />

      <v-empty-state
        v-if="!todoState.loading && todoState.items.length === 0"
        icon="mdi-check-circle-outline"
        :title="t('todo.emptyFiltered')"
        :text="t('todo.emptyFilteredText')"
      />

      <div v-else class="stack">
        <v-card v-for="todo in todoState.items" :key="todo.id">
          <v-card-text class="todo__row">
            <div class="row" style="min-width: 0">
              <v-btn
                :icon="statusIcons[todo.status]"
                variant="text"
                size="small"
                :title="todo.status === 'done' ? t('todo.markTodo') : t('todo.toggleStatus')"
                @click="cycleStatus(todo)"
              />
              <span
                class="grow truncate"
                :style="
                  todo.status === 'done'
                    ? { textDecoration: 'line-through', color: 'rgb(var(--v-theme-on-surface-variant))' }
                    : undefined
                "
              >
                {{ todo.title }}
              </span>
              <v-chip v-if="todo.priority !== 'normal'" size="small" :color="todo.priority === 'high' ? 'error' : undefined" variant="tonal">
                {{ todoPriorityLabel(todo.priority) }}
              </v-chip>
              <v-chip
                size="small"
                variant="tonal"
                :class="{ 'is-clickable': todo.workspaceId !== null }"
                :title="todo.workspaceId === null ? undefined : t('todo.openWorkspace')"
                @click="openWorkspace(todo)"
              >
                {{ workspaceLabel(todo.workspaceId) }}
              </v-chip>
              <v-chip
                v-if="todo.dueDate"
                size="small"
                :color="isOverdue(todo) ? 'error' : undefined"
                variant="tonal"
              >
                {{ formatDurationLabel(todo.dueDate) }}
              </v-chip>
            </div>

            <div class="row">
              <v-btn size="small" variant="text" @click="startEdit(todo)">{{ t('common.edit') }}</v-btn>
              <v-btn size="small" variant="text" color="error" @click="removeTodo(todo)">
                {{ t('common.delete') }}
              </v-btn>
            </div>
          </v-card-text>

          <v-card-text v-if="todo.description" class="todo__description">{{ todo.description }}</v-card-text>

          <v-card-text v-if="editing?.id === todo.id" class="stack">
            <v-text-field v-model="editDraft.title" :label="t('todo.editTitle')" />
            <v-textarea v-model="editDraft.description" :label="t('todo.editDescription')" rows="2" />
            <div class="row" style="flex-wrap: wrap">
              <v-select
                v-model="editDraft.status"
                :items="editStatusOptions"
                :label="t('todo.editStatus')"
                style="width: 130px"
              />
              <v-select
                v-model="editDraft.priority"
                :items="priorityOptions"
                :label="t('todo.priority')"
                style="width: 120px"
              />
              <v-select
                v-model="editDraft.workspaceId"
                :items="workspaceItems"
                :label="t('todo.owner')"
                style="width: 160px"
              />
              <!-- 与添加区共用同一套尺寸：Vuetify 的 .v-input 默认会拉伸，这里显式定宽 -->
              <v-text-field v-model="editDraft.dueDate" class="todo__field--date" type="date" :label="t('todo.due')" />
              <v-btn color="primary" @click="saveEdit">{{ t('common.save') }}</v-btn>
              <v-btn variant="text" @click="editing = null">{{ t('common.cancel') }}</v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </div>
  </section>
</template>
