import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  formatAccelerator,
  isValidAccelerator,
  sameAccelerator,
  zoomActionForKey
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

  it('CommandOrControl 按平台与 Ctrl / Cmd 等价', () => {
    expect(sameAccelerator('CommandOrControl+,', 'Control+,', 'linux')).toBe(true)
    expect(sameAccelerator('CommandOrControl+Alt+K', 'Alt+Control+K', 'win32')).toBe(true)
    expect(sameAccelerator('CommandOrControl+,', 'Command+,', 'darwin')).toBe(true)
    expect(sameAccelerator('CommandOrControl+,', 'Control+,', 'darwin')).toBe(false)
  })

  it('Ctrl/Cmd 缩放兼容主键盘 + 与数字小键盘', () => {
    expect(zoomActionForKey('+')).toBe('in')
    expect(zoomActionForKey('=', 'Equal')).toBe('in')
    expect(zoomActionForKey('', 'NumpadAdd')).toBe('in')
    expect(zoomActionForKey('-')).toBe('out')
    expect(zoomActionForKey('', 'NumpadSubtract')).toBe('out')
    expect(zoomActionForKey('0')).toBe('reset')
    expect(zoomActionForKey('a', 'KeyA')).toBeNull()
  })
})
