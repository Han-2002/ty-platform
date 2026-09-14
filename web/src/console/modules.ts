/** The console's module registry: order is the nav order. */
import type { WargameKey, WargameT } from './locales'
import type { ConsoleActions, ConsoleState } from './store'

export type ModuleId =
  | 'activity'
  | 'conversations'
  | 'seats'
  | 'messages'
  | 'approvals'
  | 'plans'
  | 'knowledge'
  | 'skills'
  | 'mcp'
  | 'trajectory'
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
  { id: 'approvals', label: 'module.approvals' },
  { id: 'plans', label: 'module.plans' },
  { id: 'knowledge', label: 'module.knowledge' },
  { id: 'skills', label: 'module.skills' },
  { id: 'mcp', label: 'module.mcp' },
  { id: 'trajectory', label: 'module.trajectory' },
  { id: 'metrics', label: 'module.metrics' },
]

/** Shared props every module view receives: full engine state + actions + translate. */
export interface ConsoleModuleProps {
  state: ConsoleState
  actions: ConsoleActions
  t: WargameT
}
