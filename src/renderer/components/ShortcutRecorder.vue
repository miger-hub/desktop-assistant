<script setup lang="ts">
import { ref } from 'vue'
import { formatAccelerator, isValidAccelerator } from '@shared/accelerator'
import { acceleratorFromEvent } from '../composables/accelerator'
import { t } from '../i18n'

const props = defineProps<{
  /** 当前的 accelerator，例如 `CommandOrControl+Alt+A` */
  modelValue: string
  label: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string] }>()

/** 正在录按键：此时输入框显示提示，按下的组合会被记录 */
const recording = ref(false)
const error = ref('')

function start(): void {
  recording.value = true
  error.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (!recording.value) return

  // 录制期间不要把按键交给应用自己的快捷键（否则会顺手把窗口切走）
  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    recording.value = false
    error.value = ''
    return
  }

  const accelerator = acceleratorFromEvent(event)
  if (!accelerator) {
    error.value = t('shortcutRecorder.needModifier')
    return
  }
  if (!isValidAccelerator(accelerator)) {
    error.value = t('shortcutRecorder.unsupported')
    return
  }

  recording.value = false
  error.value = ''
  emit('update:modelValue', accelerator)
}
</script>

<template>
  <div class="shortcut-recorder">
    <v-text-field
      class="shortcut-recorder__field"
      :model-value="recording ? '' : formatAccelerator(props.modelValue)"
      :label="props.label"
      :placeholder="recording ? t('shortcutRecorder.recordingPlaceholder') : t('shortcutRecorder.idlePlaceholder')"
      :active="recording"
      readonly
      density="comfortable"
      hide-details
      @click="start"
      @keydown="onKeydown"
    />
    <v-btn size="small" variant="tonal" :color="recording ? 'primary' : undefined" @click="start">
      {{ recording ? t('shortcutRecorder.recording') : t('common.change') }}
    </v-btn>
  </div>
  <p v-if="error" class="dialog__error">{{ error }}</p>
</template>
