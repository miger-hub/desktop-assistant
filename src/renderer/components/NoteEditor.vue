<script setup lang="ts">
import { ref } from 'vue'
import { Crepe } from '@milkdown/crepe'
import { Milkdown, useEditor } from '@milkdown/vue'
import { t } from '../i18n'
import { useUi } from '../stores/ui'

const props = defineProps<{
  notePath: string
  content: string
}>()

const emit = defineEmits<{
  'update:content': [content: string]
}>()

const ui = useUi()
const host = ref<HTMLElement | null>(null)

function assetUrl(notePath: string, source: string): string {
  if (/^(?:https?:|data:|blob:|workmeta-note:)/i.test(source)) return source
  const url = new URL('workmeta-note://asset/')
  url.searchParams.set('note', notePath)
  url.searchParams.set('src', source.replace(/^\.\//, ''))
  return url.toString()
}

async function upload(file: File): Promise<string> {
  try {
    const result = await window.desktop.noteDocs.uploadAsset(
      props.notePath,
      file.name,
      await file.arrayBuffer()
    )
    return result.src
  } catch (error) {
    ui.handleError(error, t('error.uploadNoteImage'))
    throw error
  }
}

const editor = reactiveEditor()

function reactiveEditor() {
  return useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: props.content,
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: upload,
          blockOnUpload: upload,
          inlineOnUpload: upload,
          proxyDomURL: (source) => assetUrl(props.notePath, source),
          blockUploadButton: t('noteDoc.editor.uploadImage'),
          inlineUploadButton: t('noteDoc.editor.uploadImage'),
          blockUploadPlaceholderText: t('noteDoc.editor.uploadImageHint'),
          inlineUploadPlaceholderText: t('noteDoc.editor.uploadImageHint'),
          blockCaptionPlaceholderText: t('noteDoc.editor.imageCaption'),
          blockConfirmButton: t('noteDoc.editor.confirm'),
          inlineConfirmButton: t('noteDoc.editor.confirm'),
          maxWidth: 900
        },
        [Crepe.Feature.Placeholder]: {
          text: t('noteDoc.editor.placeholder'),
          mode: 'doc'
        },
        [Crepe.Feature.Toolbar]: {
          boldLabel: t('noteDoc.editor.bold'),
          italicLabel: t('noteDoc.editor.italic'),
          strikethroughLabel: t('noteDoc.editor.strikethrough'),
          codeLabel: t('noteDoc.editor.inlineCode'),
          linkLabel: t('noteDoc.editor.link')
        },
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: t('noteDoc.editor.text'),
            text: { label: t('noteDoc.editor.text') },
            h1: { label: t('noteDoc.editor.heading1') },
            h2: { label: t('noteDoc.editor.heading2') },
            h3: { label: t('noteDoc.editor.heading3') },
            h4: { label: t('noteDoc.editor.heading4') },
            h5: { label: t('noteDoc.editor.heading5') },
            h6: { label: t('noteDoc.editor.heading6') },
            quote: { label: t('noteDoc.editor.quote') },
            divider: { label: t('noteDoc.editor.divider') }
          },
          listGroup: {
            label: t('noteDoc.editor.list'),
            bulletList: { label: t('noteDoc.editor.bulletList') },
            orderedList: { label: t('noteDoc.editor.orderedList') },
            taskList: { label: t('noteDoc.editor.taskList') }
          },
          advancedGroup: {
            label: t('noteDoc.editor.advanced'),
            image: { label: t('noteDoc.editor.image') },
            codeBlock: { label: t('noteDoc.editor.codeBlock') },
            table: { label: t('noteDoc.editor.table') },
            math: { label: t('noteDoc.editor.math') }
          }
        },
        [Crepe.Feature.LinkTooltip]: {
          inputPlaceholder: t('noteDoc.editor.pasteLink')
        },
        [Crepe.Feature.CodeMirror]: {
          searchPlaceholder: t('noteDoc.editor.searchLanguage'),
          noResultText: t('noteDoc.editor.noResult'),
          copyText: t('noteDoc.editor.copy'),
          previewToggleText: (previewOnly) =>
            previewOnly ? t('noteDoc.editor.edit') : t('noteDoc.editor.hide')
        }
      }
    })

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (markdown !== previous) emit('update:content', markdown)
      })
    })
    return crepe
  })
}

function scrollToHeading(index: number): void {
  const headings = host.value?.querySelectorAll<HTMLElement>('.milkdown h1, .milkdown h2, .milkdown h3, .milkdown h4, .milkdown h5, .milkdown h6')
  headings?.[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

defineExpose({ scrollToHeading, loading: editor.loading })
</script>

<template>
  <div ref="host" class="note-editor">
    <Milkdown />
  </div>
</template>
