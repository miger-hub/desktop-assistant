/**
 * 快捷键（Electron accelerator）的默认值、校验与展示。
 *
 * 这里刻意不碰 Electron / DOM / process，主进程与渲染进程都能引用：
 * 主进程用它校验设置，渲染进程用它把按键拼成 accelerator 并显示。
 */

/** 默认快捷键：和以前的硬编码保持一致 */
export const DEFAULT_SHORTCUTS = {
  toggle: 'CommandOrControl+Alt+A',
  search: 'CommandOrControl+Alt+K'
} as const

const MODIFIERS = new Set(['CommandOrControl', 'Command', 'Control', 'Alt', 'Shift', 'Super'])

/** 允许的「键」部分：字母 / 数字 / 功能键 / 常用命名键 / 常见符号 */
const KEY_PATTERN =
  /^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|Space|Tab|Enter|Escape|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|Backspace|[`\-=[\]\\;',./])$/

/**
 * 校验 accelerator。
 * 要求：至少一个修饰键 + 一个键，且修饰键不重复——
 * 单个字母做全局快捷键会把正常打字全吃掉，所以直接不允许。
 */
export function isValidAccelerator(value: string): boolean {
  if (!value) return false

  const parts = value.split('+')
  if (parts.length < 2) return false

  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)

  if (!KEY_PATTERN.test(key)) return false
  if (modifiers.some((modifier) => !MODIFIERS.has(modifier))) return false
  return new Set(modifiers).size === modifiers.length
}

/** 比较两个 accelerator 是否等价（修饰键顺序、大小写不影响结果） */
export function sameAccelerator(left: string, right: string): boolean {
  return acceleratorKey(left) === acceleratorKey(right)
}

function acceleratorKey(value: string): string {
  const parts = value.trim().toLowerCase().split('+')
  const key = parts.pop() ?? ''
  return [...parts.sort(), key].join('+')
}

/** 给用户看的文案：`CommandOrControl+Alt+A` → `Ctrl/Cmd + Alt + A` */
export function formatAccelerator(value: string): string {
  if (!value) return ''

  const labels: Record<string, string> = {
    CommandOrControl: 'Ctrl/Cmd',
    Command: 'Cmd',
    Control: 'Ctrl',
    Alt: 'Alt',
    Shift: 'Shift',
    Super: 'Super'
  }

  const parts = value.split('+')
  const key = parts.pop() ?? ''
  return [...parts.map((part) => labels[part] ?? part), key].join(' + ')
}
