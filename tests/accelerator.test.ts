import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  formatAccelerator,
  isValidAccelerator,
  sameAccelerator
} from '../src/shared/accelerator'

describe('accelerator 工具', () => {
  it('组合键必须带修饰键和键', () => {
    expect(isValidAccelerator(DEFAULT_SHORTCUTS.toggle)).toBe(true)
    expect(isValidAccelerator('Control+Shift+T')).toBe(true)
    expect(isValidAccelerator('F5')).toBe(false)
    expect(isValidAccelerator('A')).toBe(false)
    expect(isValidAccelerator('Control')).toBe(false)
    expect(isValidAccelerator('Control+Control+A')).toBe(false)
    expect(isValidAccelerator('Control+KeyA')).toBe(false)
  })

  it('展示文案与等价比较', () => {
    expect(formatAccelerator('CommandOrControl+Alt+A')).toBe('Ctrl/Cmd + Alt + A')
    expect(formatAccelerator('Control+Shift+T')).toBe('Ctrl + Shift + T')
    expect(sameAccelerator('Alt+Control+A', 'Control+Alt+A')).toBe(true)
    expect(sameAccelerator('Control+Alt+A', 'Control+Alt+B')).toBe(false)
  })
})
