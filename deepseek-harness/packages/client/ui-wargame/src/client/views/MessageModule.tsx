import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { BusinessModuleProps } from '../modules.ts'
import { businessApi, errorText } from './businessApi.ts'
import css from './console.module.css'

interface Conversation {
  id: string
  name: string
}

interface ChatMessage {
  id: string
  conversationId: string
  activityId: string
  senderUserId: string
  senderSeatId: string
  content: string
  createdAt: number
}

interface Seat {
  id: string
  name: string
}

export function MessageModule({
  state,
  actions,
  session,
}: BusinessModuleProps) {
  const [conversations, setConversations] =
    useState<Conversation[]>([])
  const [messages, setMessages] =
    useState<ChatMessage[]>([])
  const [seats, setSeats] = useState<Seat[]>([])
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const bottomRef = useRef<HTMLDivElement | null>(null)

  const reloadConversations = useCallback(async () => {
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
    } catch (e) {
      setError(errorText(e))
    }
  }, [session])

  const reloadMessages = useCallback(async () => {
    const id = state.activeConversationId

    if (!id) {
      setMessages([])
      return
    }

    try {
      const result = await businessApi<ChatMessage[]>(
        session,
        `/api/conversations/${encodeURIComponent(id)}/messages`,
      )

      setMessages(result)
      setError('')
    } catch (e) {
      setError(errorText(e))
    }
  }, [session, state.activeConversationId])

  useEffect(() => {
    void reloadConversations()
  }, [reloadConversations])

  useEffect(() => {
    void reloadMessages()

    const timer = window.setInterval(() => {
      void reloadMessages()
    }, 1500)

    return () => window.clearInterval(timer)
  }, [reloadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages.length])

  const seatNames = useMemo(
    () => new Map(seats.map((s) => [s.id, s.name])),
    [seats],
  )

  const activeConversation = conversations.find(
    (c) => c.id === state.activeConversationId,
  )

  async function send() {
    const conversationId = state.activeConversationId
    const text = content.trim()

    if (!conversationId || !text) return

    setSending(true)
    setError('')

    try {
      await businessApi(
        session,
        `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: text,
          }),
        },
      )

      setContent('')
      await reloadMessages()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className={css.row} style={{ marginBottom: 12 }}>
        <strong>协同消息流</strong>

        <select
          className={css.select}
          value={state.activeConversationId ?? ''}
          onChange={(e) =>
            actions.selectConversation(
              e.target.value || null,
            )
          }
        >
          <option value="">请选择会话</option>

          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <span className={css.spacer} />

        <span className={css.itemMeta}>
          当前登录：
          {seatNames.get(session.seatId) ?? session.seatId}
        </span>
      </div>

      {error && (
        <p style={{ color: '#ff6b6b' }}>
          {error}
        </p>
      )}

      {!state.activeConversationId ? (
        <p className={css.empty}>
          请先选择一个协同会话
        </p>
      ) : (
        <>
          <div
            style={{
              height: 360,
              overflowY: 'auto',
              border:
                '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div
              className={css.itemMeta}
              style={{ marginBottom: 10 }}
            >
              {activeConversation?.name ?? '协同会话'}
            </div>

            {messages.length === 0 ? (
              <p className={css.empty}>
                暂无消息
              </p>
            ) : (
              messages.map((m) => {
                const mine =
                  m.senderSeatId === session.seatId

                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent:
                        mine ? 'flex-end' : 'flex-start',
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '72%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: mine
                          ? 'rgba(64, 150, 255, .20)'
                          : 'rgba(255,255,255,.06)',
                      }}
                    >
                      <div className={css.itemMeta}>
                        {seatNames.get(m.senderSeatId) ??
                          m.senderSeatId}
                        {' · '}
                        {new Date(
                          m.createdAt,
                        ).toLocaleTimeString()}
                      </div>

                      <div
                        style={{
                          whiteSpace: 'pre-wrap',
                          marginTop: 4,
                        }}
                      >
                        {m.content}
                      </div>
                    </div>
                  </div>
                )
              })
            )}

            <div ref={bottomRef} />
          </div>

          <div className={css.row}>
            <input
              className={css.input}
              style={{ flex: 1 }}
              value={content}
              placeholder="输入协同消息…"
              onChange={(e) =>
                setContent(e.target.value)
              }
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey
                ) {
                  e.preventDefault()
                  void send()
                }
              }}
            />

            <button
              className={css.button}
              disabled={
                sending ||
                content.trim() === ''
              }
              onClick={() => { void send() }}
            >
              {sending ? '发送中…' : '发送'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
