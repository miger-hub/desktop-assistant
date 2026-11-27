import { describe, expect, it } from 'vitest'
import { extractNoteHeadings, markdownExcerpt } from '../src/shared/noteDocument'

describe('笔记 Markdown 工具', () => {
  it('提取 ATX / Setext 标题并忽略代码块中的井号', () => {
    const headings = extractNoteHeadings([
      '# 一级',
      '',
      '```md',
      '# 不是标题',
      '```',
      '',
      '## 二级',
      '',
      '三级',
      '---'
    ].join('\n'))

    expect(headings).toEqual([
      { level: 1, text: '一级', index: 0 },
      { level: 2, text: '二级', index: 1 },
      { level: 2, text: '三级', index: 2 }
    ])
  })

  it('生成不含图片地址和 Markdown 标记的摘要', () => {
    expect(markdownExcerpt('# 标题\n\n![图片](attachments/a.png)\n**正文**')).toBe('标题 正文')
  })
})
