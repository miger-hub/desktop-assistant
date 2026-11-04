import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'

/**
 * 目录监听：只监听渲染进程当前打开的目录，非递归、带防抖。
 *
 * `fs.watch` 在部分平台 / 文件系统（网络盘、部分挂载点）上不可用，
 * 这时 `watchDirectory` 返回 false，UI 侧退化成手动刷新（F5 / 刷新按钮）。
 */
export class WatcherService {
  private watcher: FSWatcher | null = null
  private watchedPath: string | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly notify: (directory: string) => void,
    private readonly debounceMs = 300
  ) {}

  get directory(): string | null {
    return this.watchedPath
  }

  /** 开始监听目录（替换上一个），返回是否监听成功 */
  watchDirectory(directory: string): boolean {
    const target = path.resolve(directory)
    if (this.watchedPath === target && this.watcher) return true

    this.unwatch()
    try {
      // persistent: false：监听不应该阻止进程退出
      this.watcher = watch(target, { persistent: false }, () => this.schedule(target))
      // 目录被删除或被移走时会触发 error，直接停掉，等待下次打开目录时重新监听
      this.watcher.on('error', () => this.unwatch())
      this.watchedPath = target
      return true
    } catch {
      this.watcher = null
      this.watchedPath = null
      return false
    }
  }

  unwatch(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.watcher?.close()
    this.watcher = null
    this.watchedPath = null
  }

  /**
   * 只在该目录正被监听时停止。
   * 切换目录会先挂载新的 FileBrowser 再卸载旧的，用无条件 unwatch 会把新监听一起关掉。
   */
  unwatchIf(directory: string): void {
    if (this.watchedPath === path.resolve(directory)) this.unwatch()
  }

  /** 一次批量操作会触发大量事件，合并成一次通知 */
  private schedule(directory: string): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.notify(directory)
    }, this.debounceMs)
  }
}
