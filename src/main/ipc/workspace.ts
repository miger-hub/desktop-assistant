import type { WorkspaceInput, WorkspacePatch } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { AppContext } from '../context'
import { registerHandler } from './handle'

export function registerWorkspaceIpc(context: AppContext): void {
  const { workspaces } = context

  registerHandler(IPC.workspaceList, () => workspaces.list())
  registerHandler(IPC.workspaceCreate, (input: WorkspaceInput) => workspaces.create(input))
  registerHandler(IPC.workspaceUpdate, (id: number, patch: WorkspacePatch) => workspaces.update(id, patch))
  registerHandler(IPC.workspaceRemove, (id: number) => workspaces.remove(id))
  registerHandler(IPC.workspaceReorder, (ids: number[]) => workspaces.reorder(ids))
  registerHandler(IPC.workspaceAddDirectory, (workspaceId: number, path: string, name?: string) =>
    workspaces.addDirectory(workspaceId, path, name)
  )
  registerHandler(IPC.workspaceRemoveDirectory, (mappingId: number) => workspaces.removeDirectory(mappingId))
}
