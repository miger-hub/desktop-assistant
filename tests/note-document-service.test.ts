import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../src/main/services/DatabaseService'
import { NoteDocumentService } from '../src/main/services/NoteDocumentService'
import { WorkspaceRepository } from '../src/main/repositories/WorkspaceRepository'

describe('文件型笔记', () => {
  let root: string
  let database: DatabaseService
  let notes: NoteDocumentService
  let workspaceId: number

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'workmeta-notes-'))
    database = new DatabaseService(':memory:')
    const workspaces = new WorkspaceRepository(database.connection)
    workspaceId = workspaces.insert({ name: 'Work', sortOrder: 10 }).id
    notes = new NoteDocumentService(root, workspaces)
  })

  afterEach(async () => {
    database.close()
    await rm(root, { recursive: true, force: true })
  })

  it('创建目录和笔记，并把工作区标记写入 Markdown frontmatter', async () => {
    await notes.createFolder('', '项目')
    const note = await notes.create({
      title: '会议记录',
      folderPath: '项目',
      workspaceId,
      content: '## 结论\n\n继续推进'
    })

    expect(note.path).toBe('项目/会议记录.md')
    expect(note.folderPath).toBe('项目')
    expect(note.workspaceId).toBe(workspaceId)
    expect(note.excerpt).toContain('结论')

    const raw = await readFile(path.join(root, '项目', '会议记录.md'), 'utf8')
    expect(raw).toContain(`workmetaWorkspaceId: ${workspaceId}`)
    expect(raw).toContain('## 结论')

    const tree = await notes.list()
    expect(tree.folders.map((folder) => folder.name)).toEqual(['项目'])
    expect(tree.notes.map((item) => item.title)).toEqual(['会议记录'])
  })

  it('同名笔记自动加序号，不会覆盖已有文件', async () => {
    const first = await notes.create({ title: '想法' })
    const second = await notes.create({ title: '想法' })

    expect(first.path).toBe('想法.md')
    expect(second.path).toBe('想法 (2).md')
  })

  it('图片保存到当前笔记目录的 attachments，并可通过相对路径解析', async () => {
    await notes.createFolder('', '资料')
    const note = await notes.create({ title: '截图', folderPath: '资料' })
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
    const uploaded = await notes.uploadAsset(note.path, '屏幕截图.png', png)

    expect(uploaded.src).toMatch(/^attachments\/屏幕截图-[a-f0-9]{8}\.png$/)
    const resolved = await notes.resolveAsset(note.path, uploaded.src)
    expect(resolved?.mime).toBe('image/png')
    expect(resolved?.path).toBe(path.join(root, '资料', uploaded.src.replace('/', path.sep)))
    expect((await notes.list()).folders[0]?.children).toEqual([])
  })

  it('拒绝越界路径、非法图片和保留的 attachments 目录', async () => {
    const note = await notes.create({ title: '安全' })
    await expect(notes.read('../escape.md')).rejects.toThrow(/路径不合法/)
    await expect(notes.createFolder('', 'attachments')).rejects.toThrow(/attachments/)
    await expect(notes.uploadAsset(note.path, 'bad.txt', new Uint8Array([1, 2, 3]))).rejects.toThrow(/PNG/)
    await expect(notes.resolveAsset(note.path, '../secret.png')).resolves.toBeNull()
    await expect(notes.resolveAsset(note.path, 'https://example.com/a.png')).resolves.toBeNull()
  })

  it('保存时更新正文、工作区和标题，重命名文件但保留用户 frontmatter', async () => {
    const created = await notes.create({ title: '旧标题', content: '正文' })
    const file = path.join(root, created.path)
    await writeFile(file, '---\ncustom: keep\nworkmetaWorkspaceId: 9\n---\n\n旧正文', 'utf8')

    const saved = await notes.save(created.path, {
      title: '新标题',
      content: '# 新正文',
      workspaceId
    })

    expect(saved.path).toBe('新标题.md')
    expect(saved.content).toBe('# 新正文')
    const raw = await readFile(path.join(root, saved.path), 'utf8')
    expect(raw).toContain('custom: keep')
    expect(raw).toContain(`workmetaWorkspaceId: ${workspaceId}`)
    expect(raw).not.toContain('workmetaWorkspaceId: 9')
  })

  it('重命名目录后，子笔记的相对路径随之更新', async () => {
    await notes.createFolder('', '旧目录')
    await notes.create({ title: '子笔记', folderPath: '旧目录' })
    const renamed = await notes.renameFolder('旧目录', '新目录')

    expect(renamed.path).toBe('新目录')
    expect((await notes.list()).notes[0]?.path).toBe('新目录/子笔记.md')
  })
})
