<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../i18n'

/** 无系统边框窗口的自定义标题栏：拖动区域 + 窗口按钮 */
const maximized = ref(false)

async function refresh(): Promise<void> {
  try {
    maximized.value = await window.desktop.window.isMaximized()
  } catch {
    maximized.value = false
  }
}

async function minimize(): Promise<void> {
  try {
    await window.desktop.window.minimize()
  } catch {
    // 窗口控制失败不需要打扰用户
  }
}

async function toggleMaximize(): Promise<void> {
  try {
    maximized.value = await window.desktop.window.toggleMaximize()
  } catch {
    /* 忽略 */
  }
}

async function close(): Promise<void> {
  try {
    await window.desktop.window.close()
  } catch {
    /* 忽略 */
  }
}

onMounted(() => {
  void refresh()
  window.addEventListener('resize', refresh)
})

onBeforeUnmount(() => window.removeEventListener('resize', refresh))
</script>

<template>
  <header class="titlebar" @dblclick="toggleMaximize">
    <div class="titlebar__brand">
      <v-icon icon="mdi-view-grid-outline" size="15" />
      <span>Desktop Assistant</span>
    </div>

    <div class="titlebar__spacer" />

    <div class="titlebar__actions">
      <button class="titlebar__btn" type="button" :title="t('titlebar.minimize')" @click="minimize">
        <v-icon icon="mdi-window-minimize" size="14" />
      </button>
      <button
        class="titlebar__btn"
        type="button"
        :title="maximized ? t('titlebar.restore') : t('titlebar.maximize')"
        @click="toggleMaximize"
      >
        <v-icon :icon="maximized ? 'mdi-window-restore' : 'mdi-window-maximize'" size="14" />
      </button>
      <button class="titlebar__btn titlebar__btn--close" type="button" :title="t('titlebar.close')" @click="close">
        <v-icon icon="mdi-window-close" size="14" />
      </button>
    </div>
  </header>
</template>
