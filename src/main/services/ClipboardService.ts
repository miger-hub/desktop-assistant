import type { ClipboardEntry, ClipboardKind } from '../../shared/types'
import { CLIPBOARD_HISTORY } from '../../shared/types'
import { notFound } from '../errors'
import { t } from '../i18n'

/** 一次从系统剪贴板读到的内容 */
export interface ClipboardSnapshot {
  kind: ClipboardKind
  text: string
  paths: string[]
  /** 内容指纹：判断「还是同一份内容」，只在主进程内部用 */
  signature: string
}

/**
 * 系统剪贴板读写。
 * 抽成接口是为了让 ClipboardService（历史逻辑）不依赖 Electron，可以单独测。
 */
export interface ClipboardSource {
  /** 读当前剪贴板；空内容 / 不支持的格式返回 null */
  read(): Promise<ClipboardSnapshot | null>
  /** 把历史条目写回系统剪贴板（再次复制） */
  write(entry: ClipboardEntry): Promise<void>
}

/** 库里存的是快照内容 + 指纹，指纹不出 IPC */
interface StoredEntry extends ClipboardEntry {
  signature: string
}

/** 超出范围的条数收敛到 [min, max] */
export function clampHistoryLimit(limit: number): number {
  if (!Number.isFinite(limit)) return CLIPBOARD_HISTORY.default
  return Math.min(CLIPBOARD_HISTORY.max, Math.max(CLIPBOARD_HISTORY.min, Math.floor(limit)))
}

function toEntry(stored: StoredEntry): ClipboardEntry {
  return {
    id: stored.id,
    kind: stored.kind,
    text: stored.text,
    paths: [...stored.paths],
    createdAt: stored.createdAt
  }
}

/**
 * 剪贴板历史。
 *
 * 只存在内存里（不写 SQLite）：剪贴板里经常是密码、令牌一类的敏感文本，
 * 落盘意味着它们会长期留在用户的数据库文件里，退出应用即清空更稳妥。
 */
export class ClipboardService {
  private entries: StoredEntry[] = []
  private nextId = 1
  private limit: number = CLIPBOARD_HISTORY.default
  /**
   * 用户删掉 / 清空的那份内容可能还在系统剪贴板里，
   * 记下指纹，免得下一轮轮询又把它加回来。
   */
  private suppressed: string | null = null

  /**
   * `onChange` 在历史变化时触发，主进程用它推送 IPC 事件；
   * 服务本身不碰 Electron，方便单测。
   */
  constructor(
    private readonly source: ClipboardSource,
    private readonly onChange: () => void = () => {}
  ) {}

  list(): ClipboardEntry[] {
    return this.entries.map(toEntry)
  }

  /** 读取当前系统剪贴板文本（工具页的「从剪贴板读取」用） */
  async readText(): Promise<string> {
    const snapshot = await this.source.read()
    return snapshot?.kind === 'text' ? snapshot.text : ''
  }

  /** 设置页改了条数后调用；返回历史是否被裁剪（被裁剪需要推送刷新） */
  setLimit(limit: number): boolean {
    const next = clampHistoryLimit(limit)
    if (next === this.limit) return false
    this.limit = next
    const trimmed = this.trim()
    if (trimmed) this.onChange()
    return trimmed
  }

  /**
   * 轮询一次系统剪贴板，把新内容记到历史顶部。
   * 返回历史是否有变化（提示推送走 onChange，返回值主要给调用方 / 单测判断）。
   */
  async capture(): Promise<boolean> {
    const snapshot = await this.source.read()
    if (!snapshot) return false

    // 刚被用户删掉 / 清空的内容还在剪贴板里，等剪贴板换成别的内容再记录
    if (snapshot.signature === this.suppressed) return false
    this.suppressed = null

    const index = this.entries.findIndex((entry) => entry.signature === snapshot.signature)
    if (index === 0) return false

    const now = new Date().toISOString()
    if (index > 0) {
      // 同一份内容再次复制：提到最前，不重复记录
      const [existing] = this.entries.splice(index, 1)
      existing.createdAt = now
      this.entries.unshift(existing)
      this.onChange()
      return true
    }

    this.entries.unshift({
      id: this.nextId++,
      kind: snapshot.kind,
      text: snapshot.text,
      paths: [...snapshot.paths],
      createdAt: now,
      signature: snapshot.signature
    })
    this.trim()
    this.onChange()
    return true
  }

  /** 再次复制：写回系统剪贴板，并把它当作最近使用提到最前 */
  async copy(id: number): Promise<ClipboardEntry> {
    const entry = this.entries.find((item) => item.id === id)
    if (!entry) throw notFound(t('svc.notExist', { what: t('svc.clipboardEntry'), value: id }))

    await this.source.write(toEntry(entry))

    const index = this.entries.indexOf(entry)
    if (index > 0) {
      this.entries.splice(index, 1)
      entry.createdAt = new Date().toISOString()
      this.entries.unshift(entry)
    }
    this.onChange()
    return toEntry(entry)
  }

  remove(id: number): void {
    const index = this.entries.findIndex((entry) => entry.id === id)
    if (index < 0) throw notFound(t('svc.notExist', { what: t('svc.clipboardEntry'), value: id }))

    const [removed] = this.entries.splice(index, 1)
    // 被删的是最近复制的那份（还在系统剪贴板里）时，别自动再加回来
    if (index === 0) this.suppressed = removed.signature
    this.onChange()
  }

  clear(): void {
    this.suppressed = this.entries[0]?.signature ?? null
    this.entries = []
    this.onChange()
  }

  /** 按上限裁掉旧条目；返回是否有条目被删掉 */
  private trim(): boolean {
    if (this.entries.length <= this.limit) return false
    this.entries = this.entries.slice(0, this.limit)
    return true
  }
}
