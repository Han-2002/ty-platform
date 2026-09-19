import type { ReactNode } from 'react'
import { MODULES, type ConsoleSession, type ModuleId } from './modules'
import { useConsole, type ConsoleActions, type ConsoleState } from './store'
import { t } from './locales'
import css from './views/console.module.css'
import { ActivityModule } from './views/ActivityModule'
import { ConversationModule } from './views/ConversationModule'
import { SeatModule } from './views/SeatModule'
import { MessageModule } from './views/MessageModule'
import { TaskGroupModule } from './views/TaskGroupModule'
import { WorkflowModule } from './views/WorkflowModule'
import { ApprovalModule } from './views/ApprovalModule'
import { PermissionModule } from './views/PermissionModule'
import { PlanModule } from './views/PlanModule'
import { KnowledgeModule } from './views/KnowledgeModule'
import { SkillModule } from './views/SkillModule'
import { McpModule } from './views/McpModule'
import { TrajectoryModule } from './views/TrajectoryModule'
import { AuditModule } from './views/AuditModule'
import { MetricsModule } from './views/MetricsModule'

export interface ConsoleShellProps {
  userName: string
  token: string
  seatId: string
  activityId: string
  onLogout: () => void
}

const BACKEND_LABEL: Record<ConsoleState['backend'], string> = {
  idle: '未连接后端',
  loading: '正在同步后端…',
  ready: '后端已连接',
  error: '后端连接失败',
}

export function ConsoleShell({
  userName, token, seatId, activityId, onLogout,
}: ConsoleShellProps) {
  const { state, actions } = useConsole()
  const session: ConsoleSession = { token, seatId, activityId }

  return (
    <div className={css.backdrop}>
      <div className={css.panel} role="dialog" aria-label={t('view.title')}>
        <header className={css.header}>
          <h2 className={css.title}>{t('view.title')}</h2>
          <div className={css.row}>
            <span className={css.badge} title={state.backendMessage} data-backend={state.backend}>
              {BACKEND_LABEL[state.backend]}
            </span>
            <span className={css.itemMeta}>{userName}</span>
            <button type="button" className={css.button} onClick={onLogout}>退出</button>
          </div>
        </header>
        <div className={css.body}>
          <nav className={css.nav}>
            {MODULES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={state.activeModule === m.id ? `${css.navItem} ${css.navItemActive}` : css.navItem}
                onClick={() => { actions.selectModule(m.id) }}
              >
                {t(m.label)}
              </button>
            ))}
          </nav>
          <div className={css.content}>
            {renderModule(state.activeModule, state, actions, session)}
          </div>
        </div>
      </div>
    </div>
  )
}

function renderModule(
  id: ModuleId,
  state: ConsoleState,
  actions: ConsoleActions,
  session: ConsoleSession,
): ReactNode {
  const props = { state, actions, t, session }
  switch (id) {
    case 'activity': return <ActivityModule {...props} />
    case 'conversations': return <ConversationModule {...props} />
    case 'seats': return <SeatModule {...props} />
    case 'messages': return <MessageModule {...props} />
    case 'taskGroups': return <TaskGroupModule {...props} />
    case 'workflows': return <WorkflowModule {...props} />
    case 'approvals': return <ApprovalModule {...props} />
    case 'permissions': return <PermissionModule {...props} />
    case 'plans': return <PlanModule {...props} />
    case 'knowledge': return <KnowledgeModule {...props} />
    case 'skills': return <SkillModule {...props} />
    case 'mcp': return <McpModule {...props} />
    case 'trajectory': return <TrajectoryModule {...props} />
    case 'audit': return <AuditModule {...props} />
    case 'metrics': return <MetricsModule {...props} />
  }
}
