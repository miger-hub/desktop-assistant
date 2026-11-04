import { describe, expect, it, vi } from 'vitest'
import type { ClipboardEntry } from '../src/shared/types'
import { CLIPBOARD_HISTORY } from '../src/shared/types'
import type { ClipboardSnapshot, ClipboardSource } from '../src/main/services/ClipboardService'
import { ClipboardService } from '../src/main/services/ClipboardService'

function text(value: string): ClipboardSnapshot {
  return { kind: 'text', text: value, paths: [], signature: `text:${value}` }
}

function files(paths: string[]): ClipboardSnapshot {
  return { kind: 'files', text: paths.join('\n'), paths, signature: `files:${paths.join('\u0000')}` }
}

/** 可控的系统剪贴板替身：测试直接改 current 就能模拟「用户复制了新东西」 */
function createSource() {
  const written: ClipboardEntry[] = []
  const source: ClipboardSource & { current: ClipboardSnapshot | null; written: ClipboardEntry[] } = {
    current: null,
    written,
    async read() {
      return source.current
    },
    async write(entry) {
      written.push(entry)
    }
  }
  return source
}

function createService(onChange: () => void = () => {}) {
  const source = createSource()
  return { source, service: new ClipboardService(source, onChange) }
}

describe('ClipboardService', () => {
  it('记录新内容，最近的排在最前', async () => {
    const { source, service } = createService()

    source.current = text('第一条')
    expect(await service.capture()).toBe(true)

    source.current = text('第二条')
    expect(await service.capture()).toBe(true)

    expect(service.list().map((entry) => entry.text)).toEqual(['第二条', '第一条'])
    expect(service.list()[0]).toMatchObject({ kind: 'text', paths: [] })
  })

  it('同一份内容连续轮询只记录一次', async () => {
    const { source, service } = createService()

    source.current = text('重复内容')
    expect(await service.capture()).toBe(true)
    expect(await service.capture()).toBe(false)
    expect(service.list()).toHaveLength(1)
  })

  it('剪贴板为空时什么都不做', async () => {
    const { source, service } = createService()

    source.current = null
    expect(await service.capture()).toBe(false)
    expect(service.list()).toEqual([])
  })

  it('再次复制旧内容时把它提到最前，不产生重复条目', async () => {
    const { source, service } = createService()

    source.current = text('A')
    await service.capture()
    source.current = text('B')
    await service.capture()

    const [oldest] = service.list().filter((entry) => entry.text === 'A')
    source.current = text('A')
    expect(await service.capture()).toBe(true)

    const items = service.list()
    expect(items.map((entry) => entry.text)).toEqual(['A', 'B'])
    expect(items[0].id).toBe(oldest.id)
  })

  it('记录文件列表（复制文件时是路径列表）', async () => {
    const { source, service } = createService()

    source.current = files(['/tmp/a.txt', '/tmp/目录 b'])
    await service.capture()

    expect(service.list()[0]).toMatchObject({ kind: 'files', paths: ['/tmp/a.txt', '/tmp/目录 b'] })
  })

  it('默认只保留最近 10 条', async () => {
    const { source, service } = createService()

    for (let index = 0; index < CLIPBOARD_HISTORY.default + 3; index += 1) {
      source.current = text(`第 ${index} 条`)
      await service.capture()
    }

    const items = service.list()
    expect(items).toHaveLength(CLIPBOARD_HISTORY.default)
    expect(items[0].text).toBe('第 12 条')
    expect(items.some((entry) => entry.text === '第 0 条')).toBe(false)
  })

  it('改小上限后立刻裁剪，改大不裁剪；超范围收敛到 1~50', async () => {
    const { source, service } = createService()

    for (let index = 0; index < 12; index += 1) {
      source.current = text(`第 ${index} 条`)
      await service.capture()
    }

    expect(service.setLimit(5)).toBe(true)
    expect(service.list()).toHaveLength(5)

    expect(service.setLimit(20)).toBe(false)
    expect(service.list()).toHaveLength(5)

    service.setLimit(999)
    expect(service.list().length).toBeLessThanOrEqual(CLIPBOARD_HISTORY.max)
    service.setLimit(0)
    expect(service.list().length).toBeLessThanOrEqual(CLIPBOARD_HISTORY.min)
  })

  it('删除最近复制的那条后，它不会被轮询重新加回来', async () => {
    const { source, service } = createService()

    source.current = text('临时内容')
    await service.capture()
    const [entry] = service.list()

    service.remove(entry.id)
    expect(service.list()).toEqual([])
    expect(await service.capture()).toBe(false)

    // 剪贴板换成别的内容后恢复记录
    source.current = text('新的内容')
    expect(await service.capture()).toBe(true)
    expect(service.list().map((item) => item.text)).toEqual(['新的内容'])
  })

  it('删除不存在的条目会报错', () => {
    const { service } = createService()
    expect(() => service.remove(999)).toThrow(/不存在/)
  })

  it('清空后不记录当前剪贴板内容', async () => {
    const { source, service } = createService()

    source.current = text('A')
    await service.capture()
    service.clear()

    expect(service.list()).toEqual([])
    expect(await service.capture()).toBe(false)
  })

  it('再次复制写回系统剪贴板并置顶', async () => {
    const { source, service } = createService()

    source.current = text('A')
    await service.capture()
    source.current = text('B')
    await service.capture()

    const target = service.list()[1]
    const copied = await service.copy(target.id)

    expect(source.written).toEqual([expect.objectContaining({ id: target.id, text: 'A' })])
    expect(copied.text).toBe('A')
    expect(service.list().map((entry) => entry.text)).toEqual(['A', 'B'])
    await expect(service.copy(999)).rejects.toThrow(/不存在/)
  })

  it('历史变化时通知调用方', async () => {
    const onChange = vi.fn()
    const { source, service } = createService(onChange)

    source.current = text('内容')
    await service.capture()
    expect(onChange).toHaveBeenCalledTimes(1)

    // 内容没变时不重复通知
    await service.capture()
    expect(onChange).toHaveBeenCalledTimes(1)

    service.clear()
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
