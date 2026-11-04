import type { FileItem, FileType, TodoPriority, TodoStatus } from '@shared/types'
import { t } from '../i18n'

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDurationLabel(dueDate: string | null): string {
  if (!dueDate) return ''
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (dueDate === todayKey) return t('format.today')
  const tomorrow = new Date(today.getTime() + 86_400_000)
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  if (dueDate === tomorrowKey) return t('format.tomorrow')
  return dueDate
}

export function isOverdue(todo: { dueDate: string | null; status: TodoStatus }): boolean {
  if (!todo.dueDate || todo.status === 'done') return false
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return todo.dueDate < todayKey
}

/** 文件列表图标：交给 Vuetify 的 v-icon 渲染，颜色取主题色，深浅主题都不用另配一套 */
export interface FileIcon {
  icon: string
  /** 主题色名（primary / success …），不传就是默认前景色 */
  color?: string
}

const ICON_BY_EXTENSION: Record<string, FileIcon> = {
  pdf: { icon: 'mdi-file-pdf-box', color: 'error' },
  doc: { icon: 'mdi-file-word-outline', color: 'info' },
  docx: { icon: 'mdi-file-word-outline', color: 'info' },
  xls: { icon: 'mdi-file-excel-outline', color: 'success' },
  xlsx: { icon: 'mdi-file-excel-outline', color: 'success' },
  csv: { icon: 'mdi-file-table-outline', color: 'success' },
  ppt: { icon: 'mdi-file-powerpoint-outline', color: 'warning' },
  pptx: { icon: 'mdi-file-powerpoint-outline', color: 'warning' },
  zip: { icon: 'mdi-zip-box-outline', color: 'warning' },
  '7z': { icon: 'mdi-zip-box-outline', color: 'warning' },
  gz: { icon: 'mdi-zip-box-outline', color: 'warning' },
  tar: { icon: 'mdi-zip-box-outline', color: 'warning' },
  rar: { icon: 'mdi-zip-box-outline', color: 'warning' },
  xz: { icon: 'mdi-zip-box-outline', color: 'warning' },
  exe: { icon: 'mdi-application-outline', color: 'secondary' },
  msi: { icon: 'mdi-application-outline', color: 'secondary' },
  appimage: { icon: 'mdi-application-outline', color: 'secondary' },
  deb: { icon: 'mdi-application-outline', color: 'secondary' }
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic']
const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv']
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac']
const CODE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'java', 'go', 'rs', 'c', 'h', 'cpp', 'cs', 'sh', 'json', 'yml', 'yaml', 'toml'
]
const TEXT_EXTENSIONS = ['txt', 'md', 'log', 'ini', 'conf', 'env']

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

function fileIcon(name: string, type: FileType): FileIcon {
  if (type === 'directory') return { icon: 'mdi-folder', color: 'warning' }
  if (type === 'symlink') return { icon: 'mdi-link-variant', color: 'info' }

  const extension = extensionOf(name)
  const known = ICON_BY_EXTENSION[extension]
  if (known) return known
  if (IMAGE_EXTENSIONS.includes(extension)) return { icon: 'mdi-file-image-outline', color: 'success' }
  if (VIDEO_EXTENSIONS.includes(extension)) return { icon: 'mdi-file-video-outline', color: 'secondary' }
  if (AUDIO_EXTENSIONS.includes(extension)) return { icon: 'mdi-file-music-outline', color: 'info' }
  if (CODE_EXTENSIONS.includes(extension)) return { icon: 'mdi-file-code-outline', color: 'primary' }
  if (TEXT_EXTENSIONS.includes(extension)) return { icon: 'mdi-file-document-outline' }
  return { icon: 'mdi-file-outline' }
}

export function iconForFile(item: FileItem): FileIcon {
  return fileIcon(item.name, item.type)
}

/** 待办状态的本地化文案（写成函数，语言切换后调用方会重新求值） */
export function todoStatusLabel(status: TodoStatus): string {
  if (status === 'doing') return t('todo.statusDoing')
  if (status === 'done') return t('todo.statusDone')
  return t('todo.statusTodo')
}

export function todoPriorityLabel(priority: TodoPriority): string {
  if (priority === 'low') return t('todo.priorityLow')
  if (priority === 'high') return t('todo.priorityHigh')
  return t('todo.priorityNormal')
}
