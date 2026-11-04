import { sameAccelerator } from '@shared/accelerator'

/** KeyboardEvent.code → accelerator 里的键名（够用就行，其它键不记录） */
const CODE_MAP: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`'
}

function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return CODE_MAP[code] ?? null
}

/**
 * 把按键事件拼成 accelerator；只按下修饰键、或者没有修饰键时返回 null。
 *
 * 用 `event.code` 而不是 `event.key`：macOS 上 ⌥+A 的 key 是 'å'，code 才是稳定的 'KeyA'。
 */
export function acceleratorFromEvent(event: KeyboardEvent): string | null {
  if (event.repeat) return null

  const key = keyFromCode(event.code)
  if (!key) return null

  const modifiers: string[] = []
  if (event.metaKey) modifiers.push('Command')
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')

  // 不带修饰键的全局快捷键会把正常打字吃掉，所以必须有一个修饰键
  if (modifiers.length === 0) return null
  return [...modifiers, key].join('+')
}

/** 这个按键事件是不是命中了某个已配置的快捷键 */
export function matchesAccelerator(event: KeyboardEvent, accelerator: string): boolean {
  const pressed = acceleratorFromEvent(event)
  return pressed !== null && sameAccelerator(pressed, accelerator)
}
