<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { useUi } from '../stores/ui'

const ui = useUi()
const input = ref('')
const inputElement = ref<{ focus: () => void; select?: () => void } | null>(null)

const open = computed(() => ui.state.dialog !== null)

// 用 computed 拆出各字段，避免模板里对联合类型做窄化判断
const title = computed(() => ui.state.dialog?.title ?? '')
const message = computed(() => (ui.state.dialog?.kind === 'confirm' ? ui.state.dialog.message : undefined))
const label = computed(() => (ui.state.dialog?.kind === 'prompt' ? ui.state.dialog.label : undefined))
const placeholder = computed(() => (ui.state.dialog?.kind === 'prompt' ? ui.state.dialog.placeholder : undefined))
const confirmText = computed(() => ui.state.dialog?.confirmText ?? t('common.ok'))
const cancelText = computed(() =>
  ui.state.dialog?.kind === 'confirm' ? ui.state.dialog.cancelText ?? t('common.cancel') : t('common.cancel')
)
const isPrompt = computed(() => ui.state.dialog?.kind === 'prompt')
const isDanger = computed(() => ui.state.dialog?.kind === 'confirm' && ui.state.dialog.danger === true)

watch(
  () => ui.state.dialog,
  async (dialog) => {
    if (dialog?.kind === 'prompt') {
      input.value = dialog.value ?? ''
      await nextTick()
      inputElement.value?.focus()
      inputElement.value?.select?.()
    }
  }
)

function submit(): void {
  if (ui.state.dialog?.kind === 'prompt') ui.closeDialog(input.value)
  else ui.closeDialog(true)
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (!ui.state.dialog) return
  if (event.key === 'Escape') {
    event.preventDefault()
    ui.closeDialog(null)
  } else if (event.key === 'Enter' && ui.state.dialog.kind === 'confirm') {
    event.preventDefault()
    submit()
  }
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<template>
  <v-dialog :model-value="open" persistent :max-width="480" scrollable>
    <v-card v-if="ui.state.dialog" class="dialog__card">
      <v-card-title class="dialog__title">{{ title }}</v-card-title>

      <v-card-text class="stack">
        <p v-if="message" class="dialog__message">{{ message }}</p>
        <v-text-field
          v-if="isPrompt"
          ref="inputElement"
          v-model="input"
          :label="label"
          :placeholder="placeholder"
          autofocus
          @keydown.enter="submit"
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="ui.closeDialog(null)">{{ cancelText }}</v-btn>
        <v-btn :color="isDanger ? 'error' : 'primary'" @click="submit">{{ confirmText }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
