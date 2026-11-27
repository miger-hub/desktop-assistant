import type {
  AppSettings,
  GlobalShortcutStatus,
  SearchNavigation,
  WindowToggleResult
} from '../shared/types'
import type { AppService } from './services/AppService'
import type { ClipboardService } from './services/ClipboardService'
import type { DatabaseService } from './services/DatabaseService'
import type { FileService } from './services/FileService'
import type { HomeService } from './services/HomeService'
import type { NoteService } from './services/NoteService'
import type { NoteDocumentService } from './services/NoteDocumentService'
import type { OperationService } from './services/OperationService'
import type { PluginService } from './plugins/PluginService'
import type { RuleService } from './services/RuleService'
import type { SettingsService } from './services/SettingsService'
import type { ShortcutService } from './services/ShortcutService'
import type { SystemService } from './services/SystemService'
import type { TodoService } from './services/TodoService'
import type { WorkspaceService } from './services/WorkspaceService'
import type { WorkLogService } from './services/WorkLogService'

/**
 * 系统集成（托盘 / 全局快捷键）只依赖窗口动作，交给 index.ts 实现。
 * 设置页改完设置后通过它即时生效，不需要重启应用。
 */
export interface ShellController {
  apply(settings: AppSettings): void
  /** 系统托盘是否真的可用（创建失败时为 false，此时关闭窗口不应该只是隐藏） */
  trayActive(): boolean
  /**
   * 显示 / 隐藏主窗口（应用内快捷键与托盘共用同一套逻辑）。
   * 返回这次切换的结果：被拒绝隐藏时带原因，由渲染进程提示用户。
   */
  toggleWindow(): WindowToggleResult
  /** 全局快捷键注册情况 */
  shortcutStatus(): GlobalShortcutStatus
  /** 重新注册一遍全局快捷键（设置页「重新检测」，用户清掉冲突后不用重启） */
  recheckShortcuts(): GlobalShortcutStatus
  /** 呼出搜索（主界面里的快捷键兜底走这里，和托盘 / 全局快捷键同一套行为） */
  showSearch(): void
  /** 显示主界面并跳转到搜索结果对应的位置（独立搜索窗口用） */
  navigate(target: SearchNavigation): void
  /** 收起独立搜索窗口 */
  hideSearch(): void
  /** 独立搜索窗口按内容调整高度（CSS px） */
  resizeSearch(height: number): void
}

/** 主进程服务集合，在 index.ts 里组装一次 */
export interface AppContext {
  database: DatabaseService
  files: FileService
  workspaces: WorkspaceService
  todos: TodoService
  rules: RuleService
  shortcuts: ShortcutService
  /** 首页快捷访问的系统应用 */
  home: HomeService
  /** 每日工作记录与周报导出 */
  workLogs: WorkLogService
  /** 剪贴板历史（内存中，退出应用即清空） */
  clipboard: ClipboardService
  notes: NoteService
  /** 文件型 Markdown 笔记 */
  noteDocs: NoteDocumentService
  /** 工具插件（内置 + 已安装） */
  plugins: PluginService
  operations: OperationService
  settings: SettingsService
  system: SystemService
  /** 系统里已安装的应用（全局搜索里能搜到、回车打开） */
  apps: AppService
  shell: ShellController
}
