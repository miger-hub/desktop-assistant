import { describe, expect, it } from 'vitest'
import type { MappedDirectory, WorkspaceDetail } from '../src/shared/types'
import { isInsideDirectory, normalizePath, ownerOfPath } from '../src/renderer/composables/location'

function directory(workspaceId: number, id: number, path: string): MappedDirectory {
  return { id, workspaceId, name: path, path, exists: true, createdAt: '', updatedAt: '' }
}

function workspace(id: number, directories: MappedDirectory[]): WorkspaceDetail {
  return { id, name: `ws-${id}`, sortOrder: 0, createdAt: '', updatedAt: '', directories }
}

describe('normalizePath / isInsideDirectory', () => {
  it('统一分隔符并去掉结尾斜杠', () => {
    expect(normalizePath('C:\\Users\\me\\Docs\\')).toBe('C:/Users/me/Docs')
    expect(normalizePath('/home/me/docs/')).toBe('/home/me/docs')
  })

  it('同目录或子路径才算在内', () => {
    expect(isInsideDirectory('/a/b', '/a/b')).toBe(true)
    expect(isInsideDirectory('/a/b', '/a/b/c.txt')).toBe(true)
    expect(isInsideDirectory('/a/b', '/a/bc')).toBe(false)
    expect(isInsideDirectory('/a/b', '/a')).toBe(false)
  })
})

describe('ownerOfPath', () => {
  const workspaces: WorkspaceDetail[] = [
    workspace(1, [directory(1, 10, '/home/me/dev'), directory(1, 11, '/home/me/dev/secret')]),
    workspace(2, [directory(2, 20, '/home/me/work')])
  ]
  const context = { desktop: '/home/me/Desktop', workspaces }

  it('映射目录里的文件归对应工作区，嵌套时取最长匹配', () => {
    expect(ownerOfPath('/home/me/dev/app.ts', context)).toEqual({ workspaceId: 1, directoryId: 10 })
    expect(ownerOfPath('/home/me/dev/secret/token.txt', context)).toEqual({ workspaceId: 1, directoryId: 11 })
    expect(ownerOfPath('/home/me/work/report.md', context)).toEqual({ workspaceId: 2, directoryId: 20 })
  })

  it('桌面文件归桌面', () => {
    expect(ownerOfPath('/home/me/Desktop/note.md', context)).toBe('desktop')
    // 只是前缀相同但不是该目录里的文件
    expect(ownerOfPath('/home/me/Desktop-old/note.md', context)).toBeNull()
  })

  it('都不匹配时返回 null', () => {
    expect(ownerOfPath('/tmp/whatever.txt', context)).toBeNull()
  })
})
