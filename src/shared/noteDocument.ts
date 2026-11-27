import type { NoteHeading } from './types'

/** 提取 Markdown 标题，供笔记页右侧文章目录使用；忽略代码块里的 # */
export function extractNoteHeadings(markdown: string): NoteHeading[] {
  const headings: NoteHeading[] = []
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let fence: '`' | '~' | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~'
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence !== null) continue

    const atx = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (atx) {
      const text = atx[2].trim()
      if (text) headings.push({ level: atx[1].length, text, index: headings.length })
      continue
    }

    const next = lines[index + 1]
    const setext = next?.match(/^\s{0,3}(=+|-+)\s*$/)
    if (setext && line.trim()) {
      headings.push({ level: setext[1][0] === '=' ? 1 : 2, text: line.trim(), index: headings.length })
      index += 1
    }
  }

  return headings
}

/** 把 Markdown 粗略转成列表摘要，正文搜索和搜索弹框的副标题共用 */
export function markdownExcerpt(markdown: string, max = 160): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}
