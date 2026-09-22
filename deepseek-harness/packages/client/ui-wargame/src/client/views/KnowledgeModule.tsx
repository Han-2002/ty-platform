import { useEffect, useMemo, useState } from 'react'
import { knowledgeCatalog } from '../engine.ts'
import type { BusinessModuleProps } from '../modules.ts'
import { businessApi, errorText } from './businessApi.ts'
import css from './console.module.css'

interface SeatMeta {
  id: string
  name: string
  roleId: string
  roleName: string
  clearance: number
}

export function KnowledgeModule({
  state,
  actions,
  session,
}: BusinessModuleProps) {
  const [seat, setSeat] = useState<SeatMeta | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError('')

    businessApi<SeatMeta[]>(session, '/api/seats')
      .then(async (seats) => {
        const current = seats.find(
          (s) => s.id === session.seatId,
        )

        if (!current) {
          throw new Error(
            `当前登录席位不存在：${session.seatId}`,
          )
        }

        if (cancelled) return

        setSeat(current)

        // Harness 内部角色也同步为真实登录席位角色
        actions.setRole(current.roleId)

        // 按该角色重新从真实知识目录加载
        await knowledgeCatalog.reload(current.roleId)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(errorText(e))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session, actions])

  const visible = useMemo(
    () => state.knowledge,
    [state.knowledge],
  )

  return (
    <div>
      <div
        className={css.row}
        style={{ marginBottom: 12 }}
      >
        <strong>知识库权限</strong>

        <span className={css.itemMeta}>
          当前登录：
          {seat?.name ?? session.seatId}
        </span>

        {seat && (
          <>
            <span className={css.badge}>
              {seat.roleName}
            </span>

            <span className={css.itemMeta}>
              密级 C{seat.clearance}
            </span>
          </>
        )}
      </div>

      {error !== '' && (
        <p style={{ color: '#ff6b6b' }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className={css.empty}>
          正在按当前席位加载知识权限…
        </p>
      ) : visible.length === 0 ? (
        <p className={css.empty}>
          当前席位没有可访问的知识资源
        </p>
      ) : (
        <ul className={css.list}>
          {visible.map((d) => (
            <li
              key={d.id}
              className={css.listItem}
            >
              <span>{d.title}</span>

              <span className={css.itemMeta}>
                C{d.clearance}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
