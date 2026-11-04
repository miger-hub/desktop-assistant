<script setup lang="ts">
import { computed } from 'vue'
import FileBrowser from '../components/FileBrowser.vue'
import { t } from '../i18n'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'

const ui = useUi()
const settings = useSettings()

const desktopPath = computed(() => settings.state.paths?.desktop ?? '')

async function openDesktop(): Promise<void> {
  if (!desktopPath.value) return
  try {
    await window.desktop.files.open(desktopPath.value)
  } catch (error) {
    ui.handleError(error, t('error.openDesktop'))
  }
}
</script>

<template>
  <section class="view">
    <div class="view__header">
      <div class="view__title">
        <span>{{ t('desktop.title') }}</span>
        <span class="muted mono truncate">{{ desktopPath || t('common.loading') }}</span>
      </div>
      <div class="row">
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-folder-open-outline"
          :disabled="!desktopPath"
          @click="openDesktop"
        >
          {{ t('desktop.openInManager') }}
        </v-btn>
      </div>
    </div>

    <div class="desktop__browser">
      <FileBrowser
        v-if="desktopPath"
        :root-path="desktopPath"
        panel-id="desktop-files"
        :empty-hint="t('desktop.emptyHint')"
      />
      <v-empty-state v-else icon="mdi-desktop-classic" :title="t('desktop.loadingPath')" />
    </div>
  </section>
</template>
