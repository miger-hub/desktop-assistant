import { describe, expect, it } from 'vitest'
import { dropTargetIndex, moveItem } from '../src/renderer/composables/reorder'

describe('dropTargetIndex', () => {
  it('插入点在拖动项之后时左移一位', () => {
    expect(dropTargetIndex(0, 3)).toBe(2)
    expect(dropTargetIndex(1, 2)).toBe(1)
  })

  it('插入点在拖动项之前时保持不变', () => {
    expect(dropTargetIndex(2, 0)).toBe(0)
    expect(dropTargetIndex(1, 1)).toBe(1)
  })
})

describe('moveItem', () => {
  const items = ['a', 'b', 'c']

  it('把第一项拖到列表末尾', () => {
    expect(moveItem(items, 0, 3)).toEqual(['b', 'c', 'a'])
  })

  it('把最后一项拖到列表开头', () => {
    expect(moveItem(items, 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('拖到相邻位置', () => {
    expect(moveItem(items, 0, 1)).toEqual(items)
    expect(moveItem(items, 1, 0)).toEqual(['b', 'a', 'c'])
  })

  it('原地拖动或落点无效时不改变顺序', () => {
    expect(moveItem(items, 2, 2)).toEqual(items)
    expect(moveItem(items, 2, 3)).toEqual(items)
    expect(moveItem(items, -1, 0)).toEqual(items)
    expect(moveItem(items, 5, 0)).toEqual(items)
  })

  it('不改动传入的数组', () => {
    const source = ['a', 'b', 'c']
    moveItem(source, 0, 3)
    expect(source).toEqual(['a', 'b', 'c'])
  })
})
