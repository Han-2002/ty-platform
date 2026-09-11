/** Console shell: passes the engine state + actions down to each module. */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createConsoleStore, ConsoleStateShape, ConsoleActions } from './engine.ts'
import { MODULES, type ModuleId } from './modules.ts'
// The framework's BakedActions derivation (ActionsDecl uses any[]) marks every
// action parameter as optional. The runtime is correct; the cast aligns the
// prop type with the hand-written ConsoleActions so module views see required
// parameters and don't need non-null assertions.
const actionsForChildren = (a: WargameOverlayProps['actions']): ConsoleActions => a as unknown as ConsoleActions
import type { WargameT } from './locales.ts'
import { ActivityModule } from './views/ActivityModule.tsx'
import { ConversationModule } from './views/ConversationModule.tsx'
import { SeatModule } from './views/SeatModule.tsx'
import { MessageModule } from './views/MessageModule.tsx'
import { ApprovalModule } from './views/ApprovalModule.tsx'
import { PlanModule } from './views/PlanModule.tsx'
import { KnowledgeModule } from './views/KnowledgeModule.tsx'
import { SkillModule } from './views/SkillModule.tsx'
import { McpModule } from './views/McpModule.tsx'
import { TrajectoryModule } from './views/TrajectoryModule.tsx'
import { MetricsModule } from './views/MetricsModule.tsx'
import css from './views/console.module.css'

export type WargameOverlayProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createConsoleStore>>
  & PropsLocale<'wargame'>

export function WargameOverlay({ useStore, actions, t }: WargameOverlayProps) {
  const state = useStore((s) => s)
  if (!state.open) return null
  return (
    <div className={css.backdrop}>
      <div className={css.panel} role="dialog" aria-label={t('view.title')}>
        <header className={css.header}>
          <h2 className={css.title}>{t('view.title')}</h2>
          <button type="button" className={css.close} onClick={actions.close} aria-label={t('view.close')}>
            ×
          </button>
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
          <div className={css.content}>{renderModule(state.activeModule, state, actionsForChildren(actions), t)}</div>
        </div>
      </div>
    </div>
  )
}

function renderModule(
  id: ModuleId,
  state: ConsoleStateShape,
  actions: ConsoleActions,
  t: WargameT,
): ReactNode {
  switch (id) {
    case 'activity': return <ActivityModule state={state} actions={actions} t={t} />
    case 'conversations': return <ConversationModule state={state} actions={actions} t={t} />
    case 'seats': return <SeatModule state={state} actions={actions} t={t} />
    case 'messages': return <MessageModule state={state} actions={actions} t={t} />
    case 'approvals': return <ApprovalModule state={state} actions={actions} t={t} />
    case 'plans': return <PlanModule state={state} actions={actions} t={t} />
    case 'knowledge': return <KnowledgeModule state={state} actions={actions} t={t} />
    case 'skills': return <SkillModule state={state} actions={actions} t={t} />
    case 'mcp': return <McpModule state={state} actions={actions} t={t} />
    case 'trajectory': return <TrajectoryModule state={state} actions={actions} t={t} />
    case 'metrics': return <MetricsModule state={state} actions={actions} t={t} />
  }
}
