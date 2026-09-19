/** The console's module registry: order is the nav order. */
import type { WargameKey, WargameT } from './locales'
import type { ConsoleActions, ConsoleState } from './store'

export type ModuleId =
  | 'activity'
  | 'conversations'
  | 'seats'
  | 'messages'
  | 'taskGroups'
  | 'workflows'
  | 'approvals'
  | 'permissions'
  | 'plans'
  | 'knowledge'
  | 'skills'
  | 'mcp'
  | 'trajectory'
  | 'audit'
  | 'metrics'

export interface ModuleDef {
  id: ModuleId
  label: WargameKey
}

export const MODULES: readonly ModuleDef[] = [
  { id: 'activity', label: 'module.activity' },
  { id: 'conversations', label: 'module.conversations' },
  { id: 'seats', label: 'module.seats' },
  { id: 'messages', label: 'module.messages' },
  { id: 'taskGroups', label: 'module.taskGroups' },
  { id: 'workflows', label: 'module.workflows' },
  { id: 'approvals', label: 'module.approvals' },
  { id: 'permissions', label: 'module.permissions' },
  { id: 'plans', label: 'module.plans' },
  { id: 'knowledge', label: 'module.knowledge' },
  { id: 'skills', label: 'module.skills' },
  { id: 'mcp', label: 'module.mcp' },
  { id: 'trajectory', label: 'module.trajectory' },
  { id: 'audit', label: 'module.audit' },
  { id: 'metrics', label: 'module.metrics' },
]

export interface ConsoleSession {
  token: string
  seatId: string
  activityId: string
}

export interface ConsoleModuleProps {
  state: ConsoleState
  actions: ConsoleActions
  t: WargameT
  session: ConsoleSession
}
