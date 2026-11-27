<script setup lang="ts">
import { useNoteDocuments } from '../stores/noteDocuments'
import MemoNotes from './MemoNotes.vue'
import NoteDocumentsView from './NoteDocumentsView.vue'

const noteDocs = useNoteDocuments()
</script>

<template>
  <NoteDocumentsView v-if="noteDocs.state.tab === 'documents'" />
  <MemoNotes v-else />
</template>
