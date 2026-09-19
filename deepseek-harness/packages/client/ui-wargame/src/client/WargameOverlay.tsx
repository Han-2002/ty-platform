/** Console shell: passes the engine state + actions down to each module. */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createConsoleStore, ConsoleStateShape, ConsoleActions } from './engine.ts'
import { MODULES, type ModuleId } from './modules.ts'
import type { ConsoleSession } from './views/businessApi.ts'
import { useBusinessSession } from './views/businessApi.ts'

const actionsForChildren = (a: WargameOverlayProps['actions']): ConsoleActions => a as unknown as ConsoleActions
import type { WargameT } from './locales.ts'
import { ActivityModule } from './views/ActivityModule.tsx'
import { ConversationModule } from './views/ConversationModule.tsx'
import { SeatModule } from './views/SeatModule.tsx'
import { MessageModule } from './views/MessageModule.tsx'
import { TaskGroupModule } from './views/TaskGroupModule.tsx'
import { WorkflowModule } from './views/WorkflowModule.tsx'
import { ApprovalModule } from './views/ApprovalModule.tsx'
import { PermissionModule } from './views/PermissionModule.tsx'
import { PlanModule } from './views/PlanModule.tsx'
import { KnowledgeModule } from './views/KnowledgeModule.tsx'
import { SkillModule } from './views/SkillModule.tsx'
import { McpModule } from './views/McpModule.tsx'
import { TrajectoryModule } from './views/TrajectoryModule.tsx'
import { AuditModule } from './views/AuditModule.tsx'
import { MetricsModule } from './views/MetricsModule.tsx'
import css from './views/console.module.css'

export type WargameOverlayProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createConsoleStore>>
  & PropsLocale<'wargame'>

type DragState = { startX: number; startY: number; originX: number; originY: number }

export function WargameOverlay({ useStore, actions, t }: WargameOverlayProps) {
  const state = useStore((s) => s)
  const business = useBusinessSession()
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    const move = (event: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      setOffset({
        x: d.originX + event.clientX - d.startX,
        y: d.originY + event.clientY - d.startY,
      })
    }
    const stop = () => {
      if (!dragRef.current) return
      dragRef.current = null
      setDragging(false)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
    }
  }, [])

  const startDrag = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
    setDragging(true)
  }

  if (!state.open) return null
  return (
    <div className={css.backdrop}>
      <div
        className={dragging ? `${css.panel} ${css.panelDragging}` : css.panel}
        role="dialog"
        aria-label={t('view.title')}
        style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      >
        <header
          className={css.header}
          onMouseDown={startDrag}
          onDoubleClick={() => setOffset({ x: 0, y: 0 })}
          title="拖动窗口；双击回到中央"
        >
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
          <div className={css.content}>
            {renderModule(
              state.activeModule,
              state,
              actionsForChildren(actions),
              t,
              business.session,
              business.error,
              business.loading,
              business.retry,
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BusinessGate({ error, loading, retry }: { error: string; loading: boolean; retry: () => void }) {
  return (
    <div>
      <strong>业务模块连接</strong>
      <p className={css.empty}>
        {loading ? '正在连接 8787 业务后端…' : error || '业务会话尚未就绪'}
      </p>
      {!loading && (
        <button type="button" className={css.button} onClick={retry}>重新连接</button>
      )}
    </div>
  )
}

function renderModule(
  id: ModuleId,
  state: ConsoleStateShape,
  actions: ConsoleActions,
  t: WargameT,
  session: ConsoleSession | null,
  businessError: string,
  businessLoading: boolean,
  retryBusiness: () => void,
): ReactNode {
  const businessProps = session ? { state, actions, t, session } : null
  switch (id) {
    case 'activity': return <ActivityModule state={state} actions={actions} t={t} />
    case 'conversations': return <ConversationModule state={state} actions={actions} t={t} />
    case 'seats': return <SeatModule state={state} actions={actions} t={t} />
    case 'messages': return <MessageModule state={state} actions={actions} t={t} />
    case 'taskGroups': return businessProps ? <TaskGroupModule {...businessProps} /> : <BusinessGate error={businessError} loading={businessLoading} retry={retryBusiness} />
    case 'workflows': return businessProps ? <WorkflowModule {...businessProps} /> : <BusinessGate error={businessError} loading={businessLoading} retry={retryBusiness} />
    case 'approvals': return <ApprovalModule state={state} actions={actions} t={t} />
    case 'permissions': return businessProps ? <PermissionModule {...businessProps} /> : <BusinessGate error={businessError} loading={businessLoading} retry={retryBusiness} />
    case 'plans': return <PlanModule state={state} actions={actions} t={t} />
    case 'knowledge': return <KnowledgeModule state={state} actions={actions} t={t} />
    case 'skills': return <SkillModule state={state} actions={actions} t={t} />
    case 'mcp': return <McpModule state={state} actions={actions} t={t} />
    case 'trajectory': return <TrajectoryModule state={state} actions={actions} t={t} />
    case 'audit': return businessProps ? <AuditModule {...businessProps} /> : <BusinessGate error={businessError} loading={businessLoading} retry={retryBusiness} />
    case 'metrics': return <MetricsModule state={state} actions={actions} t={t} />
  }
}
