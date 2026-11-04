<script setup lang="ts">
import { useUi } from '../stores/ui'

const ui = useUi()
</script>

<template>
  <div class="toasts">
    <div
      v-for="item in ui.state.toasts"
      :key="item.id"
      class="toast"
      :class="{ 'toast--error': item.type === 'error', 'toast--success': item.type === 'success' }"
      @click="ui.dismissToast(item.id)"
    >
      {{ item.message }}
    </div>
  </div>
</template>
