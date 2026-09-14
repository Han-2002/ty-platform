/** Approval queue: real approve/reject changes engine state (seat status, trajectory, report message). */
import type { ConsoleModuleProps } from '../modules'
import css from './console.module.css'

export function ApprovalModule({ state, actions, t }: ConsoleModuleProps) {
  const pending = state.outputs.filter((o) => o.status === 'waiting_approval')
  if (pending.length === 0) {
    return <p className={css.empty}>{t('approval.empty')}</p>
  }
  return (
    <ul className={css.list}>
      {pending.map((o) => {
        const task = state.tasks.find((tk) => tk.id === o.taskId)
        const seat = state.seats.find((s) => s.id === o.seatId)
        return (
          <li key={o.id} className={css.listItem}>
            <div>
              <div>{task?.title ?? o.taskId}</div>
              <div className={css.itemMeta}>
                {seat?.name ?? o.seatId} · {o.content}
              </div>
            </div>
            <div className={css.row}>
              <button type="button" className={css.button} onClick={() => { actions.approveOutput(o.id) }}>
                {t('approval.approve')}
              </button>
              <button type="button" className={css.button} onClick={() => { actions.rejectOutput(o.id) }}>
                {t('approval.reject')}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
