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

interface DemoSeatOption {
  assignmentId: string

  userId: string
  userName: string

  activityId: string
  activityName: string

  seatId: string
  seatName: string

  roleId: string
  roleName: string

  clearance: number
  canDispatch: boolean
  canApprove: boolean
}

interface DemoLoginResult {
  token: string
  sessionId?: string
  userId?: string
  userName?: string
  expiresAt?: number
  activityId: string
  seatId: string
}

const API_BASE =
  'http://127.0.0.1:8787'

const TOKEN_KEY =
  'ty.harness.business.token'

const SEAT_KEY =
  'ty.harness.business.LOGIN_SEAT_V2'

const ACTIVITY_KEY =
  'ty.harness.business.LOGIN_ACTIVITY_V1'

let pendingSession:
  Promise<ConsoleSession> | null = null

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  seatId?: string,
  activityId?: string,
): Promise<T> {
  const headers =
    new Headers(options.headers ?? {})

  headers.set(
    'content-type',
    'application/json',
  )

  if (token) {
    headers.set(
      'authorization',
      `Bearer ${token}`,
    )
  }

  if (seatId) {
    headers.set(
      'x-seat-id',
      seatId,
    )
  }

  if (activityId) {
    headers.set(
      'x-activity-id',
      activityId,
    )
  }

  const res =
    await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    })

  const text =
    await res.text()

  let parsed: any = null

  try {
    parsed =
      text
        ? JSON.parse(text)
        : null
  } catch {
    parsed = text
  }

  if (!res.ok) {
    throw new Error(
      parsed?.message ??
      parsed?.error ??
      `${res.status} ${res.statusText}`,
    )
  }

  return parsed as T
}

function selectFromList<T>(
  title: string,
  items: T[],
  getName: (x: T) => string,
): T {
  while (true) {
    const list =
      items
        .map(
          (x, i) =>
            `${i + 1}. ${getName(x)}`,
        )
        .join('\n')

    const input =
      window.prompt(
        `${title}\n\n${list}\n\n请输入编号：`,
        '1',
      )

    if (input === null) {
      throw new Error(
        '尚未选择登录席位',
      )
    }

    const index =
      Number(input) - 1

    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < items.length
    ) {
      return items[index]!
    }

    window.alert(
      '编号不正确，请重新选择',
    )
  }
}

/**
 * 获取所有真正存在“用户 -> 活动 -> 席位”编配关系的席位。
 *
 * 这里故意不用 /api/seats 作为登录入口，因为“系统存在这个席位”
 * 不等于“当前存在一个用户被授权使用这个席位”。
 */
async function loadDemoSeatOptions():
  Promise<DemoSeatOption[]> {
  try {
    return await request<DemoSeatOption[]>(
      '/api/demo-login/options',
    )
  } catch {
    return []
  }
}

async function demoLogin(
  option: DemoSeatOption,
): Promise<string> {
  const result =
    await request<DemoLoginResult>(
      '/api/demo-login',
      {
        method: 'POST',
        body: JSON.stringify({
          activityId:
            option.activityId,

          seatId:
            option.seatId,
        }),
      },
    )

  sessionStorage.setItem(
    TOKEN_KEY,
    result.token,
  )

  sessionStorage.setItem(
    SEAT_KEY,
    result.seatId,
  )

  sessionStorage.setItem(
    ACTIVITY_KEY,
    result.activityId,
  )

  return result.token
}

/**
 * 判断现有 token 是否真的属于当前选择的席位。
 *
 * 不能只验证 token 有效：
 * admin 的 token 虽然有效，但 admin 没被编配到参谋一席，
 * 这正是之前出现 403 的原因。
 */
async function reuseCurrentLogin(
  option: DemoSeatOption,
): Promise<{
  token: string
  me: Me
} | null> {
  const token =
    sessionStorage.getItem(
      TOKEN_KEY,
    )

  if (!token) return null

  try {
    const me =
      await request<Me>(
        '/api/me',
        {},
        token,
      )

    const authorized =
      me.assignments.some(
        (assignment) =>
          assignment.active &&
          assignment.userId ===
            me.userId &&
          assignment.seatId ===
            option.seatId &&
          assignment.activityId ===
            option.activityId,
      )

    if (!authorized) {
      return null
    }

    return {
      token,
      me,
    }
  } catch {
    return null
  }
}

/**
 * 兼容 demo-login 没开启时的旧开发模式。
 */
async function legacyAdminLogin():
  Promise<string> {
  const cached =
    sessionStorage.getItem(
      TOKEN_KEY,
    )

  if (cached) {
    try {
      await request(
        '/api/me',
        {},
        cached,
      )

      return cached
    } catch {
      sessionStorage.removeItem(
        TOKEN_KEY,
      )
    }
  }

  const result =
    await request<{
      token: string
    }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          userId: 'admin',
          password: '1234567890',
        }),
      },
    )

  sessionStorage.setItem(
    TOKEN_KEY,
    result.token,
  )

  return result.token
}

function optionLabel(
  option: DemoSeatOption,
): string {
  return [
    option.seatName,
    `[${option.seatId}]`,
    `角色：${option.roleName}`,
    `用户：${option.userName}`,
    `活动：${option.activityName}`,
  ].join('  ')
}

/**
 * 真正的换席位登录。
 *
 * 与旧实现不同：
 * 旧实现只是删除 SEAT_KEY -> reload；
 * 新实现会调用 /api/demo-login，
 * 因而 token、userId 和 seatId 会一起切换。
 */
function installSwitchButton(
  session: ConsoleSession,
  seats: Seat[],
  demoOptions: DemoSeatOption[],
): void {
  document
    .getElementById(
      'ty-switch-seat',
    )
    ?.remove()

  const seat =
    seats.find(
      (s) =>
        s.id === session.seatId,
    )

  const button =
    document.createElement(
      'button',
    )

  button.id =
    'ty-switch-seat'

  button.type =
    'button'

  button.textContent =
    `当前登录：${seat?.name ?? session.seatId} ｜ 切换席位`

  Object.assign(
    button.style,
    {
      position: 'fixed',
      top: '14px',
      right: '18px',
      zIndex: '2147483646',
      padding: '8px 13px',
      borderRadius: '9px',
      border:
        '1px solid #555',
      background:
        '#202124',
      color: '#fff',
      cursor: 'pointer',
      fontSize: '13px',
    },
  )

  button.onclick =
    async () => {
      try {
        if (
          demoOptions.length >
          0
        ) {
          const candidates =
            demoOptions.filter(
              (option) =>
                option.activityId ===
                  session.activityId,
            )

          const available =
            candidates.length > 0
              ? candidates
              : demoOptions

          const selected =
            selectFromList(
              '切换席位登录',
              available,
              optionLabel,
            )

          // 真正切换身份。
          await demoLogin(
            selected,
          )

          pendingSession = null

          // 页面重新初始化后：
          // businessApi -> AgentSeatBridge
          // 会拿到新 token + 新 seatId。
          location.reload()

          return
        }

        // demo-login 未启用时保留旧开发模式。
        sessionStorage.removeItem(
          TOKEN_KEY,
        )

        sessionStorage.removeItem(
          SEAT_KEY,
        )

        sessionStorage.removeItem(
          ACTIVITY_KEY,
        )

        pendingSession = null

        location.reload()
      } catch (error) {
        window.alert(
          `切换席位失败：${errorText(error)}`,
        )
      }
    }

  document.body.appendChild(
    button,
  )
}

async function createDemoBusinessSession(
  demoOptions: DemoSeatOption[],
): Promise<ConsoleSession> {
  let selectedSeatId =
    sessionStorage.getItem(
      SEAT_KEY,
    )

  let selectedActivityId =
    sessionStorage.getItem(
      ACTIVITY_KEY,
    )

  let selected =
    demoOptions.find(
      (option) =>
        option.seatId ===
          selectedSeatId &&
        option.activityId ===
          selectedActivityId,
    )

  if (!selected) {
    selected =
      selectFromList(
        '选择登录席位',
        demoOptions,
        optionLabel,
      )

    selectedSeatId =
      selected.seatId

    selectedActivityId =
      selected.activityId

    sessionStorage.setItem(
      SEAT_KEY,
      selected.seatId,
    )

    sessionStorage.setItem(
      ACTIVITY_KEY,
      selected.activityId,
    )
  }

  let reused =
    await reuseCurrentLogin(
      selected,
    )

  let token: string
  let me: Me

  if (reused) {
    token =
      reused.token

    me =
      reused.me
  } else {
    token =
      await demoLogin(
        selected,
      )

    me =
      await request<Me>(
        '/api/me',
        {},
        token,
      )
  }

  const seats =
    await request<Seat[]>(
      '/api/seats',
      {},
      token,
    )

  const session:
    ConsoleSession = {
      token,
      seatId:
        selected.seatId,

      activityId:
        selected.activityId,

      assignments:
        me.assignments,
    }

  installSwitchButton(
    session,
    seats,
    demoOptions,
  )

  return session
}

async function createLegacyBusinessSession():
  Promise<ConsoleSession> {
  const token =
    await legacyAdminLogin()

  const [
    me,
    seats,
    activities,
  ] =
    await Promise.all([
      request<Me>(
        '/api/me',
        {},
        token,
      ),

      request<Seat[]>(
        '/api/seats',
        {},
        token,
      ),

      request<Activity[]>(
        '/api/activities',
        {},
        token,
      ),
    ])

  if (seats.length === 0) {
    throw new Error(
      '系统没有可用席位',
    )
  }

  if (
    activities.length === 0
  ) {
    throw new Error(
      '系统没有可用活动',
    )
  }

  let activity:
    Activity

  if (
    activities.length === 1
  ) {
    activity =
      activities[0]!
  } else {
    activity =
      selectFromList(
        '选择活动',
        activities,
        (x) => x.name,
      )
  }

  let seat =
    seats.find(
      (x) =>
        x.id ===
        sessionStorage.getItem(
          SEAT_KEY,
        ),
    )

  if (!seat) {
    seat =
      selectFromList(
        '选择登录席位',
        seats,
        (x) =>
          `${x.name}  [${x.id}]`,
      )

    sessionStorage.setItem(
      SEAT_KEY,
      seat.id,
    )
  }

  sessionStorage.setItem(
    ACTIVITY_KEY,
    activity.id,
  )

  const session:
    ConsoleSession = {
      token,
      seatId:
        seat.id,

      activityId:
        activity.id,

      assignments:
        me.assignments,
    }

  installSwitchButton(
    session,
    seats,
    [],
  )

  return session
}

async function createBusinessSession():
  Promise<ConsoleSession> {
  const demoOptions =
    await loadDemoSeatOptions()

  if (
    demoOptions.length > 0
  ) {
    return await createDemoBusinessSession(
      demoOptions,
    )
  }

  return await createLegacyBusinessSession()
}

export function getBusinessSession(
  force = false,
): Promise<ConsoleSession> {
  if (force) {
    sessionStorage.removeItem(
      TOKEN_KEY,
    )

    sessionStorage.removeItem(
      SEAT_KEY,
    )

    sessionStorage.removeItem(
      ACTIVITY_KEY,
    )

    pendingSession = null
  }

  pendingSession ??=
    createBusinessSession()
      .finally(() => {
        pendingSession = null
      })

  return pendingSession
}

export function useBusinessSession() {
  const [
    session,
    setSession,
  ] =
    useState<ConsoleSession | null>(
      null,
    )

  const [
    error,
    setError,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    nonce,
    setNonce,
  ] =
    useState(0)

  useEffect(() => {
    let cancelled =
      false

    setLoading(true)

    getBusinessSession(
      nonce > 0,
    )
      .then((s) => {
        if (!cancelled) {
          setSession(s)
          setError('')
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSession(null)
          setError(
            errorText(e),
          )
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
  }, [nonce])

  const retry =
    useCallback(
      () =>
        setNonce(
          (n) => n + 1,
        ),
      [],
    )

  return {
    session,
    error,
    loading,
    retry,
  }
}

export async function businessApi<
  T = unknown,
>(
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

export function errorText(
  error: unknown,
): string {
  if (
    error instanceof TypeError &&
    /fetch/i.test(
      error.message,
    )
  ) {
    return (
      '业务后端 8787 未连接。' +
      '请先启动 ty-platform 后端。'
    )
  }

  return error instanceof Error
    ? error.message
    : String(error)
}
