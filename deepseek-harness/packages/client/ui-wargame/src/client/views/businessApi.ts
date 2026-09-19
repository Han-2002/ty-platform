import { useCallback, useEffect, useState } from 'react'

export interface Assignment {
  id: string
  userId: string
  seatId: string
  activityId: string
  active: boolean
}

export interface ConsoleSession {
  token: string
  seatId: string
  activityId: string
  assignments: Assignment[]
}

interface Me {
  userId: string
  userName: string
  sessionId: string
  expiresAt: number
  assignments: Assignment[]
}

interface Seat {
  id: string
  name: string
}

interface Activity {
  id: string
  name: string
}

const API_BASE = 'http://127.0.0.1:8787'
const TOKEN_KEY = 'ty.harness.business.token'
const SEAT_KEY = 'ty.harness.business.LOGIN_SEAT_V2'

let pendingSession: Promise<ConsoleSession> | null = null

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  seatId?: string,
  activityId?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {})
  headers.set('content-type', 'application/json')

  if (token) headers.set('authorization', `Bearer ${token}`)
  if (seatId) headers.set('x-seat-id', seatId)
  if (activityId) headers.set('x-activity-id', activityId)

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const text = await res.text()

  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }

  if (!res.ok) {
    throw new Error(
      parsed?.message ??
      parsed?.error ??
      `${res.status} ${res.statusText}`
    )
  }

  return parsed as T
}

async function login(): Promise<string> {
  const cached = sessionStorage.getItem(TOKEN_KEY)

  if (cached) {
    try {
      await request('/api/me', {}, cached)
      return cached
    } catch {
      sessionStorage.removeItem(TOKEN_KEY)
    }
  }

  const result = await request<{ token: string }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({
        userId: 'admin',
        password: '1234567890',
      }),
    },
  )

  sessionStorage.setItem(TOKEN_KEY, result.token)
  return result.token
}

function selectFromList<T>(
  title: string,
  items: T[],
  getName: (x: T) => string,
): T {
  while (true) {
    const list = items
      .map((x, i) => `${i + 1}. ${getName(x)}`)
      .join('\n')

    const input = window.prompt(
      `${title}\n\n${list}\n\n请输入编号：`,
      '1',
    )

    if (input === null) {
      throw new Error('尚未选择登录席位')
    }

    const index = Number(input) - 1

    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < items.length
    ) {
      return items[index]!
    }

    window.alert('编号不正确，请重新选择')
  }
}

function installSwitchButton(
  session: ConsoleSession,
  seats: Seat[],
): void {
  document.getElementById('ty-switch-seat')?.remove()

  const seat = seats.find((s) => s.id === session.seatId)

  const button = document.createElement('button')
  button.id = 'ty-switch-seat'
  button.type = 'button'

  button.textContent =
    `当前登录：${seat?.name ?? session.seatId} ｜ 切换席位`

  Object.assign(button.style, {
    position: 'fixed',
    top: '14px',
    right: '18px',
    zIndex: '2147483646',
    padding: '8px 13px',
    borderRadius: '9px',
    border: '1px solid #555',
    background: '#202124',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  })

  button.onclick = () => {
    sessionStorage.removeItem(SEAT_KEY)
    location.reload()
  }

  document.body.appendChild(button)
}

async function createBusinessSession(): Promise<ConsoleSession> {
  const token = await login()

  const [me, seats, activities] = await Promise.all([
    request<Me>('/api/me', {}, token),
    request<Seat[]>('/api/seats', {}, token),
    request<Activity[]>('/api/activities', {}, token),
  ])

  if (seats.length === 0) {
    throw new Error('系统没有可用席位')
  }

  if (activities.length === 0) {
    throw new Error('系统没有可用活动')
  }

  let activity: Activity

  if (activities.length === 1) {
    activity = activities[0]!
  } else {
    activity = selectFromList(
      '选择活动',
      activities,
      (x) => x.name,
    )
  }

  let seat = seats.find(
    (x) =>
      x.id === sessionStorage.getItem(SEAT_KEY),
  )

  if (!seat) {
    seat = selectFromList(
      '选择登录席位',
      seats,
      (x) => `${x.name}  [${x.id}]`,
    )

    sessionStorage.setItem(SEAT_KEY, seat.id)
  }

  const session: ConsoleSession = {
    token,
    seatId: seat.id,
    activityId: activity.id,
    assignments: me.assignments,
  }

  installSwitchButton(session, seats)

  return session
}

export function getBusinessSession(
  force = false,
): Promise<ConsoleSession> {
  if (force) {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(SEAT_KEY)
    pendingSession = null
  }

  pendingSession ??=
    createBusinessSession().finally(() => {
      pendingSession = null
    })

  return pendingSession
}

export function useBusinessSession() {
  const [session, setSession] =
    useState<ConsoleSession | null>(null)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    setLoading(true)

    getBusinessSession(nonce > 0)
      .then((s) => {
        if (!cancelled) {
          setSession(s)
          setError('')
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSession(null)
          setError(errorText(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [nonce])

  const retry =
    useCallback(() => setNonce((n) => n + 1), [])

  return {
    session,
    error,
    loading,
    retry,
  }
}

export async function businessApi<T = unknown>(
  session: ConsoleSession,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return await request<T>(
    path,
    options,
    session.token,
    session.seatId,
    session.activityId,
  )
}

export function errorText(error: unknown): string {
  if (
    error instanceof TypeError &&
    /fetch/i.test(error.message)
  ) {
    return '业务后端 8787 未连接。请先启动 ty-platform 后端。'
  }

  return error instanceof Error
    ? error.message
    : String(error)
}
