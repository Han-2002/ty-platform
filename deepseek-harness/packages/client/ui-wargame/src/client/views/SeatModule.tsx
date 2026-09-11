/** Seat cluster: real status from the engine; "idle tick" pushes a proactive message. */
import type { ConsoleModuleProps } from '../modules.ts'
import type { SeatStatus } from '../types.ts'
import css from './console.module.css'

const STATUS_LABEL: Record<SeatStatus, 'seat.idle' | 'seat.executing' | 'seat.awaiting'> = {
  idle: 'seat.idle',
  executing: 'seat.executing',
  waiting_approval: 'seat.awaiting',
}

export function SeatModule({ state, actions, t }: ConsoleModuleProps) {
  return (
    <div>
      <ul className={css.list}>
        {state.seats.map((seat) => (
          <li key={seat.id} className={css.listItem} data-status={seat.status}>
            <span>{seat.name}</span>
            <span className={css.itemMeta}>{t(STATUS_LABEL[seat.status])}</span>
          </li>
        ))}
      </ul>
      <div className={css.row} style={{ marginTop: 8 }}>
        <button
          type="button"
          className={css.button}
          disabled={state.seats.every((s) => s.status !== 'idle')}
          onClick={() => { actions.idleTick() }}
        >
          触发主动提示
        </button>
      </div>
    </div>
  )
}
