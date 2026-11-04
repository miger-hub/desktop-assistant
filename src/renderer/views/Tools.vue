<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ToolDescriptor } from '@shared/tools/types'
import ToolShell from '../components/ToolShell.vue'
import { t } from '../i18n'
import { useTools } from '../stores/tools'
import { useUi } from '../stores/ui'

const ui = useUi()
const {
  state,
  activeTool,
  load,
  installFolder,
  installZip,
  setEnabled,
  uninstall,
  open,
  close,
  subscribe
} = useTools()

const keyword = ref('')
let unsubscribe: (() => void) | null = null
let unsubscribeSettings: (() => void) | null = null

const filtered = computed(() => {
  const needle = keyword.value.trim().toLowerCase()
  if (!needle) return state.items
  return state.items.filter((tool) =>
    [tool.name, tool.description, tool.id, ...tool.keywords].some((value) =>
      value.toLowerCase().includes(needle)
    )
  )
})

const builtinTools = computed(() => filtered.value.filter((tool) => tool.source === 'builtin'))
const installedTools = computed(() => filtered.value.filter((tool) => tool.source === 'installed'))

async function remove(tool: ToolDescriptor): Promise<void> {
  const confirmed = await ui.confirm({
    title: t('tools.uninstallTitle', { name: tool.name }),
    message: t('tools.uninstallMessage'),
    confirmText: t('tools.uninstall'),
    danger: true
  })
  if (confirmed) await uninstall(tool.id)
}

onMounted(() => {
  void load()
  unsubscribe = subscribe(() => void load())
  // 语言变了：工具名称 / 描述由主进程按当前语言重建，重新拉一次
  unsubscribeSettings = window.desktop.system.onSettingsChanged(() => void load())
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
  unsubscribeSettings?.()
  unsubscribeSettings = null
})
</script>

<template>
  <section class="view">
    <div class="view__header">
      <div class="view__title">
        <span>{{ t('tools.title') }}</span>
        <span class="muted mono">{{ t('tools.count', { count: state.items.length }) }}</span>
      </div>
      <div class="row">
        <v-btn size="small" variant="text" prepend-icon="mdi-folder-open-outline" @click="installFolder">
          {{ t('tools.installFolder') }}
        </v-btn>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-zip-box-outline" @click="installZip">
          {{ t('tools.installZip') }}
        </v-btn>
      </div>
    </div>

    <div class="view__body stack">
      <ToolShell v-if="activeTool" :key="activeTool.id" :tool="activeTool" @back="close" />

      <template v-else>
        <div class="row">
          <v-text-field
            v-model="keyword"
            class="grow"
            prepend-inner-icon="mdi-magnify"
            :placeholder="t('tools.searchPlaceholder')"
            hide-details
            clearable
          />
        </div>

        <v-progress-linear v-if="state.loading" indeterminate color="primary" />

        <template v-if="installedTools.length > 0">
          <div class="row row--between">
            <span class="muted">{{ t('tools.installedSection') }}</span>
          </div>
          <div class="tools__grid">
            <v-card v-for="tool in installedTools" :key="tool.id" class="tools__card" @click="open(tool.id)">
              <v-card-text class="stack">
                <div class="row row--between">
                  <div class="row" style="min-width: 0">
                    <v-icon :icon="tool.icon" size="28" />
                    <div class="stack" style="gap: 2px; min-width: 0">
                      <strong class="truncate">{{ tool.name }}</strong>
                      <span class="muted truncate">{{ tool.description }}</span>
                    </div>
                  </div>
                  <v-chip size="small" variant="tonal">{{ t('tools.installedBadge') }}</v-chip>
                </div>
                <div class="row row--between">
                  <span class="muted mono">v{{ tool.version }}</span>
                  <span class="row" @click.stop>
                    <v-switch
                      :model-value="tool.enabled"
                      color="primary"
                      density="compact"
                      hide-details
                      :title="tool.enabled ? t('tools.disable') : t('tools.enable')"
                      @update:model-value="setEnabled(tool.id, Boolean($event))"
                    />
                    <v-btn size="small" variant="text" color="error" @click="remove(tool)">
                      {{ t('tools.uninstall') }}
                    </v-btn>
                  </span>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </template>

        <template v-if="builtinTools.length > 0">
          <div class="row row--between">
            <span class="muted">{{ t('tools.builtinSection') }}</span>
          </div>
          <div class="tools__grid">
            <v-card v-for="tool in builtinTools" :key="tool.id" class="tools__card" @click="open(tool.id)">
              <v-card-text class="stack">
                <div class="row row--between">
                  <div class="row" style="min-width: 0">
                    <v-icon :icon="tool.icon" size="28" />
                    <div class="stack" style="gap: 2px; min-width: 0">
                      <strong class="truncate">{{ tool.name }}</strong>
                      <span class="muted truncate">{{ tool.description }}</span>
                    </div>
                  </div>
                  <v-chip size="small" variant="tonal">{{ t('tools.builtin') }}</v-chip>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </template>

        <v-empty-state
          v-if="!state.loading && filtered.length === 0"
          icon="mdi-toolbox-outline"
          :title="t('tools.emptyFiltered')"
          :text="t('tools.emptyFilteredText')"
        />
      </template>
    </div>
  </section>
</template>
