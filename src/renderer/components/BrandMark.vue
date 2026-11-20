<script setup lang="ts">
withDefaults(defineProps<{ size?: number; framed?: boolean }>(), {
  size: 24,
  framed: true
})
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true" class="brand-mark">
    <rect v-if="framed" width="64" height="64" rx="15" fill="#1D4ED8" />
    <path
      d="M13 17L22 49L32 29L42 49L51 17"
      fill="none"
      :stroke="framed ? '#FFFFFF' : '#1D4ED8'"
      stroke-width="6.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path d="M14 55H27" :stroke="framed ? '#BFDBFE' : '#60A5FA'" stroke-width="2.5" stroke-linecap="round" />
    <path d="M36 55H50" :stroke="framed ? '#67E8F9' : '#0891B2'" stroke-width="2.5" stroke-linecap="round" />
    <circle v-if="framed" cx="51" cy="12" r="4" fill="#FBBF24" />
  </svg>
</template>

<style scoped>
.brand-mark {
  display: block;
  flex: 0 0 auto;
}
</style>
