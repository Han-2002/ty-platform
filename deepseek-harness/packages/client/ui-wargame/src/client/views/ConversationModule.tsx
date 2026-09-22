import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BusinessModuleProps } from '../modules.ts'
import { businessApi, errorText } from './businessApi.ts'
import css from './console.module.css'

interface Conversation {
  id: string
  activityId: string
  name: string
  kind: 'activity' | 'group' | 'direct'
  memberSeatIds: string[]
  createdBySeatId: string
  createdAt: number
}

interface Seat {
  id: string
  name: string
}

export function ConversationModule({
  state,
  actions,
  session,
}: BusinessModuleProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [seats, setSeats] = useState<Seat[]>([])
  const [name, setName] = useState('协同讨论组')
  const [kind, setKind] = useState<'group' | 'direct'>('group')
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [cs, ss] = await Promise.all([
        businessApi<Conversation[]>(
          session,
          `/api/conversations?activityId=${encodeURIComponent(session.activityId)}`,
        ),
        businessApi<Seat[]>(session, '/api/seats'),
      ])

      setConversations(cs)
      setSeats(ss)
      setError('')

      if (
        state.activeConversationId &&
        !cs.some((c) => c.id === state.activeConversationId)
      ) {
        actions.selectConversation(null)
      }
    } catch (e) {
      setError(errorText(e))
    }
  }, [session, state.activeConversationId, actions])

  useEffect(() => {
    void reload()

    const timer = window.setInterval(() => {
      void reload()
    }, 2500)

    return () => window.clearInterval(timer)
  }, [reload])

  const seatNames = useMemo(
    () => new Map(seats.map((s) => [s.id, s.name])),
    [seats],
  )

  function toggleMember(id: string) {
    setMembers((old) =>
      old.includes(id)
        ? old.filter((x) => x !== id)
        : [...old, id],
    )
  }

  async function createConversation() {
    setBusy(true)
    setError('')

    try {
      if (members.length === 0) {
        throw new Error('至少选择一个协同席位')
      }

      const created = await businessApi<Conversation>(
        session,
        '/api/conversations',
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            kind,
            memberSeatIds: members,
          }),
        },
      )

      setMembers([])
      actions.selectConversation(created.id)
      await reload()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className={css.row} style={{ marginBottom: 12 }}>
        <strong>协同会话</strong>

        <span className={css.itemMeta}>
          当前席位：{seatNames.get(session.seatId) ?? session.seatId}
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
        style={{
          borderBottom: '1px solid var(--dsw-alias-border-l2)',
          paddingBottom: 12,
          marginBottom: 12,
        }}
      >
        <div className={css.row} style={{ flexWrap: 'wrap' }}>
          <input
            className={css.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="会话名称"
          />

          <select
            className={css.select}
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as 'group' | 'direct')
            }
          >
            <option value="group">群组会话</option>
            <option value="direct">直接会话</option>
          </select>

          <button
            className={css.button}
            disabled={busy}
            onClick={() => { void createConversation() }}
          >
            {busy ? '创建中…' : '创建会话'}
          </button>
        </div>

        <div className={css.itemMeta} style={{ marginTop: 10 }}>
          选择参与席位
        </div>

        <div
          className={css.row}
          style={{ marginTop: 6, flexWrap: 'wrap' }}
        >
          {seats.map((s) => (
            <label
              key={s.id}
              className={css.badge}
              style={{
                cursor: 'pointer',
                padding: '4px 8px',
                height: 'auto',
              }}
            >
              <input
                type="checkbox"
                checked={members.includes(s.id)}
                onChange={() => toggleMember(s.id)}
                style={{ marginRight: 5 }}
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p style={{ color: '#ff6b6b' }}>
          {error}
        </p>
      )}

      {conversations.length === 0 ? (
        <p className={css.empty}>暂无协同会话</p>
      ) : (
        <ul className={css.list}>
          {conversations.map((c) => {
            const active =
              state.activeConversationId === c.id

            return (
              <li key={c.id} className={css.listItem}>
                <button
                  type="button"
                  className={css.button}
                  onClick={() =>
                    actions.selectConversation(c.id)
                  }
                >
                  {active ? '✓ ' : ''}
                  {c.name}
                </button>

                <span className={css.badge}>
                  {c.kind === 'activity'
                    ? '活动群'
                    : c.kind === 'direct'
                      ? '直接会话'
                      : '群组会话'}
                </span>

                <span className={css.itemMeta}>
                  {c.memberSeatIds
                    .map((id) => seatNames.get(id) ?? id)
                    .join('、')}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
