import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BusinessModuleProps } from '../modules.ts'
import { businessApi, errorText } from './businessApi.ts'
import css from './console.module.css'

type PermissionAction =
  | 'knowledge.read'
  | 'message.send'
  | 'message.cross_group'
  | 'task.dispatch'
  | 'workflow.propose_change'
  | 'workflow.approve_change'
  | 'plan.submit'
  | 'plan.approve'
  | 'simulation.run'
  | 'plan.dispatch'
  | 'seat.assign'

interface Grant {
  id: string
  userId: string
  seatId: string
  activityId: string
  action: PermissionAction
  resourceId?: string
  targetGroupId?: string
  issuedBySeatId: string
  issuedAt: number
  expiresAt: number
  revokedAt?: number
  reason: string
}

interface User {
  id: string
  name: string
}

interface Seat {
  id: string
  name: string
}

interface Group {
  id: string
  name: string
}

interface Assignment {
  id: string
  userId: string
  seatId: string
  activityId: string
  active: boolean
}

const ACTIONS: PermissionAction[] = [
  'knowledge.read',
  'message.send',
  'message.cross_group',
  'task.dispatch',
  'workflow.propose_change',
  'workflow.approve_change',
  'plan.submit',
  'plan.approve',
  'simulation.run',
  'plan.dispatch',
  'seat.assign',
]

export function PermissionModule({
  session,
}: BusinessModuleProps) {
  const [grants, setGrants] = useState<Grant[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [seats, setSeats] = useState<Seat[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [assignments, setAssignments] =
    useState<Assignment[]>([])

  const [userId, setUserId] = useState('')
  const [seatId, setSeatId] = useState('')

  const [action, setAction] =
    useState<PermissionAction>('message.cross_group')

  const [targetGroupId, setTargetGroupId] =
    useState('')

  const [hours, setHours] = useState(2)
  const [reason, setReason] =
    useState('临时业务需要')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [g, u, s, tg, a] = await Promise.all([
        businessApi<Grant[]>(
          session,
          `/api/permissions/grants?activityId=${encodeURIComponent(session.activityId)}`,
        ),
        businessApi<User[]>(session, '/api/users'),
        businessApi<Seat[]>(session, '/api/seats'),
        businessApi<Group[]>(
          session,
          `/api/task-groups?activityId=${encodeURIComponent(session.activityId)}`,
        ),
        businessApi<Assignment[]>(
          session,
          `/api/seat-assignments?activityId=${encodeURIComponent(session.activityId)}`,
        ),
      ])

      const active = a.filter(
        (x) =>
          x.active &&
          x.activityId === session.activityId,
      )

      setGrants(g)
      setUsers(u)
      setSeats(s)
      setGroups(tg)
      setAssignments(active)

      setUserId((current) => {
        if (
          current !== '' &&
          u.some((x) => x.id === current)
        ) {
          return current
        }

        return active[0]?.userId ?? u[0]?.id ?? ''
      })

      setError('')
    } catch (e) {
      setError(errorText(e))
    }
  }, [session])

  useEffect(() => {
    void reload()
  }, [reload])

  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  )

  const seatMap = useMemo(
    () => new Map(seats.map((s) => [s.id, s.name])),
    [seats],
  )

  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  )

  const assignedSeats = useMemo(() => {
    const ids = new Set(
      assignments
        .filter((a) => a.userId === userId)
        .map((a) => a.seatId),
    )

    return seats.filter((s) => ids.has(s.id))
  }, [assignments, seats, userId])

  useEffect(() => {
    setSeatId((current) => {
      if (
        assignedSeats.some((s) => s.id === current)
      ) {
        return current
      }

      return assignedSeats[0]?.id ?? ''
    })
  }, [assignedSeats])

  async function issue() {
    setBusy(true)
    setError('')

    try {
      if (seatId === '') {
        throw new Error(
          '该用户在当前活动没有有效席位编配',
        )
      }

      const payload: Record<string, unknown> = {
        userId,
        seatId,
        activityId: session.activityId,
        action,
        expiresAt:
          Date.now() +
          Math.max(1, hours) * 60 * 60 * 1000,
        reason,
      }

      if (targetGroupId !== '') {
        payload.targetGroupId = targetGroupId
      }

      await businessApi(
        session,
        '/api/permissions/grants',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      )

      await reload()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setBusy(true)
    setError('')

    try {
      await businessApi(
        session,
        `/api/permissions/grants/${id}/revoke`,
        {
          method: 'POST',
          body: '{}',
        },
      )

      await reload()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div
        className={css.row}
        style={{ marginBottom: 12 }}
      >
        <strong>动态权限与临时授权</strong>

        <span className={css.itemMeta}>
          人 + 已编配席位 + 活动 + 动作 / 资源 / 目标组
        </span>

        <span className={css.spacer} />

        <button
          className={css.button}
          onClick={() => { void reload() }}
        >
          刷新
        </button>
      </div>

      <div
        className={css.row}
        style={{
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <label
          className={css.field}
          style={{ marginBottom: 0, minWidth: 190 }}
        >
          <span className={css.itemMeta}>
            用户
          </span>

          <select
            className={css.select}
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
            }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.id}
              </option>
            ))}
          </select>
        </label>

        <label
          className={css.field}
          style={{ marginBottom: 0, minWidth: 160 }}
        >
          <span className={css.itemMeta}>
            已编配席位
          </span>

          <select
            className={css.select}
            value={seatId}
            disabled={assignedSeats.length === 0}
            onChange={(e) => {
              setSeatId(e.target.value)
            }}
          >
            {assignedSeats.length === 0 ? (
              <option value="">
                当前活动暂无有效席位
              </option>
            ) : (
              assignedSeats.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label
          className={css.field}
          style={{ marginBottom: 0, minWidth: 190 }}
        >
          <span className={css.itemMeta}>
            动作
          </span>

          <select
            className={css.select}
            value={action}
            onChange={(e) =>
              setAction(
                e.target.value as PermissionAction,
              )
            }
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label
          className={css.field}
          style={{ marginBottom: 0, minWidth: 170 }}
        >
          <span className={css.itemMeta}>
            目标任务组（可选）
          </span>

          <select
            className={css.select}
            value={targetGroupId}
            onChange={(e) =>
              setTargetGroupId(e.target.value)
            }
          >
            <option value="">不限</option>

            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label
          className={css.field}
          style={{ marginBottom: 0, width: 100 }}
        >
          <span className={css.itemMeta}>
            有效小时
          </span>

          <input
            className={css.input}
            type="number"
            min={1}
            value={hours}
            onChange={(e) =>
              setHours(Number(e.target.value))
            }
          />
        </label>

        <label
          className={css.field}
          style={{ marginBottom: 0, minWidth: 180 }}
        >
          <span className={css.itemMeta}>
            理由
          </span>

          <input
            className={css.input}
            value={reason}
            onChange={(e) =>
              setReason(e.target.value)
            }
          />
        </label>

        <button
          className={css.button}
          disabled={
            busy ||
            userId === '' ||
            seatId === ''
          }
          onClick={() => { void issue() }}
        >
          签发授权
        </button>
      </div>

      {userId !== '' &&
        assignedSeats.length === 0 && (
          <p
            className={css.itemMeta}
            style={{ marginBottom: 10 }}
          >
            该用户在当前活动没有有效席位编配，
            因此不能签发席位权限。
          </p>
        )}

      {error !== '' && (
        <p
          style={{
            color:
              'var(--dsw-alias-label-error, #ff6b6b)',
          }}
        >
          {error}
        </p>
      )}

      {grants.length === 0 ? (
        <p className={css.empty}>
          暂无临时授权记录
        </p>
      ) : (
        <table className={css.table}>
          <thead>
            <tr>
              <th>用户 / 席位</th>
              <th>动作</th>
              <th>范围</th>
              <th>有效期</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>

          <tbody>
            {grants.map((g) => {
              const active =
                !g.revokedAt &&
                g.expiresAt > Date.now()

              return (
                <tr key={g.id}>
                  <td>
                    {userMap.get(g.userId) ??
                      g.userId}

                    <div className={css.itemMeta}>
                      {seatMap.get(g.seatId) ??
                        g.seatId}
                    </div>
                  </td>

                  <td>{g.action}</td>

                  <td>
                    {g.targetGroupId
                      ? `组：${
                          groupMap.get(
                            g.targetGroupId,
                          ) ?? g.targetGroupId
                        }`
                      : g.resourceId
                        ? `资源：${g.resourceId}`
                        : '当前活动'}
                  </td>

                  <td>
                    {new Date(
                      g.expiresAt,
                    ).toLocaleString()}
                  </td>

                  <td>
                    <span className={css.badge}>
                      {g.revokedAt
                        ? '已撤销'
                        : active
                          ? '有效'
                          : '已过期'}
                    </span>
                  </td>

                  <td>
                    {active && (
                      <button
                        className={css.button}
                        disabled={busy}
                        onClick={() => {
                          void revoke(g.id)
                        }}
                      >
                        撤销
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
