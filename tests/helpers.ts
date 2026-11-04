import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MappingRepository } from '../src/main/repositories/MappingRepository'
import { NoteRepository } from '../src/main/repositories/NoteRepository'
import { OperationRepository } from '../src/main/repositories/OperationRepository'
import { RecentRepository } from '../src/main/repositories/RecentRepository'
import { RuleRepository } from '../src/main/repositories/RuleRepository'
import { SettingRepository } from '../src/main/repositories/SettingRepository'
import { ShortcutRepository } from '../src/main/repositories/ShortcutRepository'
import { TodoRepository } from '../src/main/repositories/TodoRepository'
import { WorkspaceRepository } from '../src/main/repositories/WorkspaceRepository'
import { DatabaseService } from '../src/main/services/DatabaseService'
import { FileService } from '../src/main/services/FileService'
import { NoteService } from '../src/main/services/NoteService'
import { OperationService } from '../src/main/services/OperationService'
import { RecentService } from '../src/main/services/RecentService'
import { RuleService } from '../src/main/services/RuleService'
import { SettingsService } from '../src/main/services/SettingsService'
import { ShortcutService } from '../src/main/services/ShortcutService'
import { TodoService } from '../src/main/services/TodoService'
import { WorkspaceService } from '../src/main/services/WorkspaceService'

/** 测试统一使用临时目录，不触碰真实用户文件 */
export async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'desktop-assistant-test-'))
}

export async function removeTempDir(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true })
}

export interface TestContext {
  database: DatabaseService
  files: FileService
  workspaces: WorkspaceService
  todos: TodoService
  rules: RuleService
  shortcuts: ShortcutService
  notes: NoteService
  recents: RecentService
  operations: OperationService
  settings: SettingsService
  close: () => void
}

export function createTestContext(): TestContext {
  const database = new DatabaseService(':memory:')
  const connection = database.connection

  const workspaceRepository = new WorkspaceRepository(connection)
  const mappingRepository = new MappingRepository(connection)
  const todoRepository = new TodoRepository(connection)
  const settingRepository = new SettingRepository(connection)
  const ruleRepository = new RuleRepository(connection)
  const operationRepository = new OperationRepository(connection)
  const shortcutRepository = new ShortcutRepository(connection)
  const noteRepository = new NoteRepository(connection)
  const recentRepository = new RecentRepository(connection)

  const files = new FileService()
  const operations = new OperationService(operationRepository, files)
  const workspaces = new WorkspaceService(workspaceRepository, mappingRepository, files)

  return {
    database,
    files,
    workspaces,
    todos: new TodoService(todoRepository, workspaceRepository),
    rules: new RuleService(ruleRepository, files, operations),
    shortcuts: new ShortcutService(shortcutRepository, workspaceRepository, files),
    notes: new NoteService(noteRepository),
    recents: new RecentService(recentRepository),
    operations,
    settings: new SettingsService(settingRepository),
    close: () => database.close()
  }
}
