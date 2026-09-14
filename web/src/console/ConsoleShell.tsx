/**
 * Console shell, ported from the deepseek-harness `ui-wargame` overlay.
 * The original rendered as a frame-level overlay; here it fills the app and
 * gains a header strip carrying the backend link status + the signed-in user.
 */
import type { ReactNode } from 'react'
import { MODULES, type ModuleId } from './modules'
import { useConsole, type ConsoleActions, type ConsoleState } from './store'
import { t } from './locales'
import css from './views/console.module.css'
import { ActivityModule } from './views/ActivityModule'
import { ConversationModule } from './views/ConversationModule'
import { SeatModule } from './views/SeatModule'
import { MessageModule } from './views/MessageModule'
import { ApprovalModule } from './views/ApprovalModule'
import { PlanModule } from './views/PlanModule'
import { KnowledgeModule } from './views/KnowledgeModule'
import { SkillModule } from './views/SkillModule'
import { McpModule } from './views/McpModule'
import { TrajectoryModule } from './views/TrajectoryModule'
import { MetricsModule } from './views/MetricsModule'

export interface ConsoleShellProps {
  /** Signed-in user's display name. */
  userName: string
  /** Sign out of the platform session. */
  onLogout: () => void
}

const BACKEND_LABEL: Record<ConsoleState['backend'], string> = {
  idle: '未连接后端',
  loading: '正在同步后端…',
  ready: '后端已连接',
  error: '后端连接失败',
}

export function ConsoleShell({ userName, onLogout }: ConsoleShellProps) {
  const { state, actions } = useConsole()
  return (
    <div className={css.backdrop}>
      <div className={css.panel} role="dialog" aria-label={t('view.title')}>
        <header className={css.header}>
          <h2 className={css.title}>{t('view.title')}</h2>
          <div className={css.row}>
            <span
              className={css.badge}
              title={state.backendMessage}
              data-backend={state.backend}
            >
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
          <div className={css.content}>{renderModule(state.activeModule, state, actions)}</div>
        </div>
      </div>
    </div>
  )
}

function renderModule(id: ModuleId, state: ConsoleState, actions: ConsoleActions): ReactNode {
  const props = { state, actions, t }
  switch (id) {
    case 'activity': return <ActivityModule {...props} />
    case 'conversations': return <ConversationModule {...props} />
    case 'seats': return <SeatModule {...props} />
    case 'messages': return <MessageModule {...props} />
    case 'approvals': return <ApprovalModule {...props} />
    case 'plans': return <PlanModule {...props} />
    case 'knowledge': return <KnowledgeModule {...props} />
    case 'skills': return <SkillModule {...props} />
    case 'mcp': return <McpModule {...props} />
    case 'trajectory': return <TrajectoryModule {...props} />
    case 'metrics': return <MetricsModule {...props} />
  }
}
