<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text: string
  query: string
}>()

interface Segment {
  text: string
  match: boolean
}

const segments = computed<Segment[]>(() => {
  const needle = props.query.trim().toLowerCase()
  if (!needle) return [{ text: props.text, match: false }]

  const lower = props.text.toLowerCase()
  const result: Segment[] = []
  let start = 0
  let index = lower.indexOf(needle)
  while (index >= 0) {
    if (index > start) result.push({ text: props.text.slice(start, index), match: false })
    result.push({ text: props.text.slice(index, index + needle.length), match: true })
    start = index + needle.length
    index = lower.indexOf(needle, start)
  }
  if (start < props.text.length) result.push({ text: props.text.slice(start), match: false })
  return result.length > 0 ? result : [{ text: props.text, match: false }]
})
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <mark v-if="segment.match" class="tool-highlight">{{ segment.text }}</mark>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>
