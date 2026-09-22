import { useEffect, useMemo, useState } from 'react'
import type { BusinessModuleProps } from '../modules.ts'
import { businessApi, errorText } from './businessApi.ts'
import css from './console.module.css'

interface SeatMeta {
  id: string
  name: string
  roleId: string
  roleName: string
  canApprove: boolean
}

export function ApprovalModule({
  state,
  actions,
  t,
  session,
}: BusinessModuleProps) {
  const [seats, setSeats] = useState<SeatMeta[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    businessApi<SeatMeta[]>(session, '/api/seats')
      .then((items) => {
        setSeats(items)

        const current = items.find(
          (s) => s.id === session.seatId,
        )

        if (current) {
          // 关键：Harness 本地角色跟随当前真实登录席位
          actions.setRole(current.roleId)
        }

        setError('')
      })
      .catch((e) => {
        setError(errorText(e))
      })
  }, [session, actions])

  const currentSeat = useMemo(
    () => seats.find((s) => s.id === session.seatId),
    [seats, session.seatId],
  )

  const pending = state.outputs.filter(
    (o) => o.status === 'waiting_approval',
  )

  function approve(id: string) {
    setNotice('')

    if (!currentSeat?.canApprove) {
      setError(
        `当前登录席位“${currentSeat?.name ?? session.seatId}”没有审批权`,
      )
      return
    }

    actions.setRole(currentSeat.roleId)
    actions.approveOutput(id)

    setError('')
    setNotice('已通过')
  }

  function reject(id: string) {
    setNotice('')

    if (!currentSeat?.canApprove) {
      setError(
        `当前登录席位“${currentSeat?.name ?? session.seatId}”没有审批权`,
      )
      return
    }

    actions.setRole(currentSeat.roleId)
    actions.rejectOutput(id)

    setError('')
    setNotice('已打回')
  }

  return (
    <div>
      <div
        className={css.row}
        style={{ marginBottom: 12 }}
      >
        <strong>人工审核队列</strong>

        <span className={css.itemMeta}>
          当前审批席位：
          {currentSeat?.name ?? session.seatId}
        </span>

        <span className={css.spacer} />

        <span className={css.badge}>
          {currentSeat?.canApprove
            ? '有审批权'
            : '无审批权'}
        </span>
      </div>

      {error !== '' && (
        <p style={{ color: '#ff6b6b' }}>
          {error}
        </p>
      )}

      {notice !== '' && (
        <p style={{ color: '#8bd49c' }}>
          {notice}
        </p>
      )}

      {pending.length === 0 ? (
        <p className={css.empty}>
          {t('approval.empty')}
        </p>
      ) : (
        <ul className={css.list}>
          {pending.map((o) => {
            const task = state.tasks.find(
              (tk) => tk.id === o.taskId,
            )

            const seat = state.seats.find(
              (s) => s.id === o.seatId,
            )

            return (
              <li
                key={o.id}
                className={css.listItem}
              >
                <div>
                  <div>
                    {task?.title ?? o.taskId}
                  </div>

                  <div className={css.itemMeta}>
                    {seat?.name ?? o.seatId}
                    {' · '}
                    {o.content}
                  </div>
                </div>

                <div className={css.row}>
                  <button
                    type="button"
                    className={css.button}
                    disabled={!currentSeat?.canApprove}
                    onClick={() => approve(o.id)}
                  >
                    通过
                  </button>

                  <button
                    type="button"
                    className={css.button}
                    disabled={!currentSeat?.canApprove}
                    onClick={() => reject(o.id)}
                  >
                    打回
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
