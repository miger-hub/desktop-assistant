<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolTreeNode } from '@shared/tools/types'
import HighlightText from './HighlightText.vue'

defineOptions({ name: 'ToolTreeNode' })

const props = defineProps<{
  node: ToolTreeNode
  depth: number
  query: string
  activePath: string | null
}>()

const open = ref(props.depth === 0)
const branch = computed(() => props.node.type === 'object' || props.node.type === 'array')
const childCount = computed(() => props.node.children?.length ?? 0)
const matched = computed(() => {
  const needle = props.query.trim().toLowerCase()
  if (!needle) return false
  return props.node.key.toLowerCase().includes(needle) || valueText().toLowerCase().includes(needle)
})

function onToggle(event: Event): void {
  open.value = (event.target as HTMLDetailsElement).open
}

function valueText(): string {
  if (props.node.type === 'string') return JSON.stringify(props.node.value ?? '')
  return props.node.value ?? ''
}
</script>

<template>
  <details
    v-if="branch"
    class="tool-tree__branch"
    :class="{ 'is-match': matched, 'is-active-match': activePath === node.path }"
    :open="open"
    :data-tree-path="node.path"
    @toggle="onToggle"
  >
    <summary class="tool-tree__summary">
      <span class="tool-tree__key"><HighlightText :text="node.key" :query="query" /></span>
      <span class="tool-tree__type">{{ node.type }}</span>
      <span class="muted">{{ childCount }}</span>
    </summary>
    <div class="tool-tree__children">
      <ToolTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :query="query"
        :active-path="activePath"
      />
    </div>
  </details>

  <div
    v-else
    class="tool-tree__leaf"
    :class="{ 'is-match': matched, 'is-active-match': activePath === node.path }"
    :data-tree-path="node.path"
  >
    <span class="tool-tree__key"><HighlightText :text="node.key" :query="query" /></span>
    <span class="tool-tree__colon">:</span>
    <span class="tool-tree__value" :class="`tool-tree__value--${node.type}`">
      <HighlightText :text="valueText()" :query="query" />
    </span>
  </div>
</template>
