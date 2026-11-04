import { promises as fsp } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { FileService, isSamePath } from '../src/main/services/FileService'
import { createTempDir, removeTempDir } from './helpers'

let root = ''
const files = new FileService()

beforeAll(async () => {
  root = await createTempDir()
  await mkdir(path.join(root, 'docs'))
  await mkdir(path.join(root, 'archive'))
  await writeFile(path.join(root, 'readme.md'), 'hello')
  await writeFile(path.join(root, 'notes.txt'), 'notes')
  await writeFile(path.join(root, '.hidden'), 'secret')
  await writeFile(path.join(root, 'docs', 'guide.md'), 'guide')
})

afterAll(async () => {
  await removeTempDir(root)
})

describe('FileService.list', () => {
  it('目录在前，默认过滤隐藏文件', async () => {
    const items = await files.list(root)
    expect(items.map((item) => item.name)).toEqual(['archive', 'docs', 'notes.txt', 'readme.md'])
    expect(items[0].type).toBe('directory')
  })

  it('可以显式包含隐藏文件', async () => {
    const items = await files.list(root, { showHidden: true })
    expect(items.map((item) => item.name)).toContain('.hidden')
    expect(items.find((item) => item.name === '.hidden')?.isHidden).toBe(true)
  })

  it('目录不存在时抛 NOT_FOUND', async () => {
    await expect(files.list(path.join(root, 'missing'))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('FileService.createDirectory', () => {
  it('在指定目录下创建子目录', async () => {
    const created = await files.createDirectory(root, 'workspace')
    expect(created.type).toBe('directory')
    expect(created.path).toBe(path.join(root, 'workspace'))
  })

  it('名称含路径分隔符时拒绝', async () => {
    await expect(files.createDirectory(root, 'a/b')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
  })

  it('同名目录已存在时抛 EXISTS', async () => {
    await expect(files.createDirectory(root, 'workspace')).rejects.toMatchObject({ code: 'EXISTS' })
  })
})

describe('FileService.move', () => {
  it('移动到目标目录', async () => {
    await writeFile(path.join(root, 'move-me.txt'), 'x')
    const moved = await files.move(path.join(root, 'move-me.txt'), path.join(root, 'archive', 'move-me.txt'))
    expect(moved.path).toBe(path.join(root, 'archive', 'move-me.txt'))
    expect(await files.exists(path.join(root, 'move-me.txt'))).toBe(false)
  })

  it('目标已存在且未指定覆盖时抛 EXISTS', async () => {
    await writeFile(path.join(root, 'conflict.txt'), 'a')
    await writeFile(path.join(root, 'archive', 'conflict.txt'), 'b')

    await expect(
      files.move(path.join(root, 'conflict.txt'), path.join(root, 'archive', 'conflict.txt'))
    ).rejects.toMatchObject({ code: 'EXISTS' })

    // 未覆盖时两边内容都保持原样
    expect(await readFile(path.join(root, 'archive', 'conflict.txt'), 'utf8')).toBe('b')
    expect(await files.exists(path.join(root, 'conflict.txt'))).toBe(true)
  })

  it('显式覆盖时替换目标', async () => {
    await files.move(path.join(root, 'conflict.txt'), path.join(root, 'archive', 'conflict.txt'), { overwrite: true })
    expect(await readFile(path.join(root, 'archive', 'conflict.txt'), 'utf8')).toBe('a')
    expect(await files.exists(path.join(root, 'conflict.txt'))).toBe(false)
  })

  it('源路径不存在时抛 NOT_FOUND', async () => {
    await expect(files.move(path.join(root, 'nope.txt'), path.join(root, 'archive', 'nope.txt'))).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
  })

  it('目标目录不存在时抛 NOT_FOUND', async () => {
    await writeFile(path.join(root, 'orphan.txt'), 'x')
    await expect(
      files.move(path.join(root, 'orphan.txt'), path.join(root, 'missing-dir', 'orphan.txt'))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('不能移动到自己的子目录', async () => {
    const nested = path.join(root, 'move-self')
    await mkdir(nested)
    await expect(files.move(nested, path.join(nested, 'inner'))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    })
  })

  it('跨磁盘移动（EXDEV）降级为复制 + 删除', async () => {
    const source = path.join(root, 'exdev-source.txt')
    const target = path.join(root, 'archive', 'exdev-source.txt')
    await writeFile(source, 'cross-device')

    const rename = vi.spyOn(fsp, 'rename')
    rename.mockRejectedValueOnce(
      Object.assign(new Error('EXDEV: cross-device link not permitted, rename'), { code: 'EXDEV' })
    )
    const copy = vi.spyOn(fsp, 'cp')

    try {
      const moved = await files.move(source, target)

      // rename 失败后才走复制降级，而不是直接 rename 成功
      expect(rename).toHaveBeenCalledTimes(1)
      expect(copy).toHaveBeenCalledTimes(1)
      expect(copy.mock.calls[0]?.[2]).toMatchObject({ recursive: true, force: true, errorOnExist: false })

      expect(moved.path).toBe(target)
      expect(await readFile(target, 'utf8')).toBe('cross-device')
      expect(await files.exists(source)).toBe(false)
    } finally {
      rename.mockRestore()
      copy.mockRestore()
    }
  })
})

describe('FileService.copy', () => {
  it('目标已存在且未指定覆盖时抛 EXISTS，原内容不变', async () => {
    await writeFile(path.join(root, 'copy-a.txt'), 'source')
    await writeFile(path.join(root, 'archive', 'copy-a.txt'), 'existing')

    await expect(
      files.copy(path.join(root, 'copy-a.txt'), path.join(root, 'archive', 'copy-a.txt'))
    ).rejects.toMatchObject({ code: 'EXISTS' })

    expect(await readFile(path.join(root, 'archive', 'copy-a.txt'), 'utf8')).toBe('existing')
    expect(await files.exists(path.join(root, 'copy-a.txt'))).toBe(true)
  })

  it('显式覆盖时复制成功，源文件保留', async () => {
    await files.copy(path.join(root, 'copy-a.txt'), path.join(root, 'archive', 'copy-a.txt'), {
      overwrite: true
    })

    expect(await readFile(path.join(root, 'archive', 'copy-a.txt'), 'utf8')).toBe('source')
    expect(await files.exists(path.join(root, 'copy-a.txt'))).toBe(true)
  })
})

describe('FileService.moveIntoMany', () => {
  it('逐个移动并汇报失败项', async () => {
    await writeFile(path.join(root, 'batch-a.txt'), 'a')
    await writeFile(path.join(root, 'batch-b.txt'), 'b')
    await writeFile(path.join(root, 'archive', 'batch-b.txt'), 'existing')

    const result = await files.moveIntoMany(
      [path.join(root, 'batch-a.txt'), path.join(root, 'batch-b.txt')],
      path.join(root, 'archive')
    )

    expect(result.succeeded).toEqual([path.join(root, 'archive', 'batch-a.txt')])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].path).toBe(path.join(root, 'batch-b.txt'))
  })

  it('目标就是文件所在目录时跳过，不算失败也不丢文件', async () => {
    await writeFile(path.join(root, 'stay.txt'), 'stay')
    const result = await files.moveIntoMany([path.join(root, 'stay.txt')], root)

    expect(result.skipped).toEqual([path.join(root, 'stay.txt')])
    expect(result.failed).toHaveLength(0)
    expect(await readFile(path.join(root, 'stay.txt'), 'utf8')).toBe('stay')
  })
})

describe('isSamePath', () => {
  it('大小写不敏感的平台把大小写差异当作同一个条目', () => {
    expect(isSamePath('/data/Readme.md', '/data/readme.md', true)).toBe(true)
    expect(isSamePath('/data/Readme.md', '/data/readme.md', false)).toBe(false)
  })

  it('不同路径永远不是同一个条目', () => {
    expect(isSamePath('/data/a.md', '/data/b.md', true)).toBe(false)
    expect(isSamePath('/data/a.md', '/other/a.md', false)).toBe(false)
  })
})

describe('FileService.rename', () => {
  it('重命名成功', async () => {
    await writeFile(path.join(root, 'notes.txt'), 'notes')
    const renamed = await files.rename(path.join(root, 'notes.txt'), 'notes-2026.txt')
    expect(renamed.name).toBe('notes-2026.txt')
  })

  it('非法名称被拒绝', async () => {
    await expect(files.rename(path.join(root, 'notes-2026.txt'), '..')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    })
    await expect(files.rename(path.join(root, 'notes-2026.txt'), '  ')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    })
  })

  it('同名文件已存在时抛 EXISTS', async () => {
    await writeFile(path.join(root, 'dup-a.txt'), 'a')
    await writeFile(path.join(root, 'dup-b.txt'), 'b')
    await expect(files.rename(path.join(root, 'dup-a.txt'), 'dup-b.txt')).rejects.toMatchObject({ code: 'EXISTS' })
  })

  it('显式覆盖时替换同名文件', async () => {
    await writeFile(path.join(root, 'dup-a.txt'), 'a')
    await writeFile(path.join(root, 'dup-b.txt'), 'b')

    const renamed = await files.rename(path.join(root, 'dup-a.txt'), 'dup-b.txt', { overwrite: true })
    expect(renamed.name).toBe('dup-b.txt')
    expect(await readFile(path.join(root, 'dup-b.txt'), 'utf8')).toBe('a')
    expect(await files.exists(path.join(root, 'dup-a.txt'))).toBe(false)
  })
})

describe('FileService.renameMany', () => {
  it('批量重命名保留原目录，成功项返回新路径', async () => {
    await writeFile(path.join(root, 'batch-1.txt'), '1')
    await writeFile(path.join(root, 'batch-2.txt'), '2')

    const result = await files.renameMany([
      { path: path.join(root, 'batch-1.txt'), name: 'note-01.txt' },
      { path: path.join(root, 'batch-2.txt'), name: 'note-02.txt' }
    ])

    expect(result.failed).toHaveLength(0)
    expect(result.succeeded).toEqual([path.join(root, 'note-01.txt'), path.join(root, 'note-02.txt')])
    expect(await readFile(path.join(root, 'note-02.txt'), 'utf8')).toBe('2')
  })

  it('单个冲突不影响其它条目，默认不覆盖', async () => {
    await writeFile(path.join(root, 'batch-3.txt'), '3')
    await writeFile(path.join(root, 'batch-4.txt'), '4')
    await writeFile(path.join(root, 'taken.txt'), 'existing')

    const result = await files.renameMany([
      { path: path.join(root, 'batch-3.txt'), name: 'free.txt' },
      { path: path.join(root, 'batch-4.txt'), name: 'taken.txt' }
    ])

    expect(result.succeeded).toEqual([path.join(root, 'free.txt')])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].path).toBe(path.join(root, 'batch-4.txt'))
    expect(await readFile(path.join(root, 'taken.txt'), 'utf8')).toBe('existing')
  })

  it('拒绝非法名称与空批次', async () => {
    await expect(files.renameMany([])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })

    await writeFile(path.join(root, 'batch-5.txt'), '5')
    const result = await files.renameMany([{ path: path.join(root, 'batch-5.txt'), name: 'a/b' }])

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].message).toContain('路径分隔符')
  })
})

describe('FileService.remove', () => {
  it('永久删除文件', async () => {
    await writeFile(path.join(root, 'delete-permanently.txt'), 'x')
    const result = await files.remove([path.join(root, 'delete-permanently.txt')])
    expect(result.succeeded).toHaveLength(1)
    expect(await files.exists(path.join(root, 'delete-permanently.txt'))).toBe(false)
  })

  it('缺失的条目记录在 failed 里，不影响其它条目', async () => {
    await writeFile(path.join(root, 'delete-me.txt'), 'x')
    const result = await files.remove([path.join(root, 'delete-me.txt'), path.join(root, 'ghost.txt')])

    expect(result.succeeded).toEqual([path.join(root, 'delete-me.txt')])
    expect(result.failed.map((item) => item.path)).toEqual([path.join(root, 'ghost.txt')])
  })

  it('拒绝对文件系统根目录执行永久删除', async () => {
    const fsRoot = path.parse(path.resolve(root)).root
    const result = await files.remove([fsRoot])

    expect(result.succeeded).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].message).toContain('根目录')
  })
})

describe('FileService 路径工具', () => {
  it('splitPath 生成面包屑', () => {
    const crumbs = files.splitPath(root, path.join(root, 'docs'))
    expect(crumbs).toHaveLength(2)
    expect(crumbs[1]).toEqual({ label: 'docs', path: path.join(root, 'docs') })
  })

  it('parentOf 返回上级目录', () => {
    expect(files.parentOf(path.join(root, 'docs'))).toBe(root)
  })
})
