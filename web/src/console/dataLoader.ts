/**
 * Bridges the console engine to the platform's HTTP API.
 *
 * The ported engine keeps its original local interactions (dispatch / approve /
 * plan scoring), but every catalog it shows — activities, seats, conversations,
 * messages, plan versions, audit trail — is loaded from the backend here, so
 * the console reflects real platform state rather than mock data.
 */
import { api } from '../api'
import type { ConsoleActions } from './store'
import type { PlanScore, SeatStatus } from './types'

/** Session coordinates every business call carries (auth + business context). */
export interface BackendSession {
  token: string
  seatId: string
  activityId: string
}

/**
 * The configured simulation engines. Mirrors `config/simulators.yaml`; the
 * backend exposes no catalog endpoint for them yet, so the console carries the
 * same defaults the platform ships with.
 */
export const DEFAULT_SIMULATORS = [
  { id: 'sim-red', name: '红方仿真引擎', connected: true, weight: 0.7 },
  { id: 'sim-blue', name: '蓝方仿真引擎', connected: true, weight: 0.3 },
]

interface ActivityDto { id: string; name: string }
interface SeatDto { id: string; name: string }
interface ConversationDto { id: string; name: string; kind?: string }
interface MessageDto { id: string; senderSeatId?: string; content: string; createdAt?: number }
interface PlanVersionDto {
  id?: string
  plan_id?: string
  name?: string
  plan_name?: string
  status?: string
  weightedScore?: number
}
interface AuditDto { id?: string; action?: string; targetId?: string; createdAt?: number }

/**
 * Load every console catalog from the backend for one business context.
 * Individual optional surfaces (plans, audit) degrade to their previous value
 * when the seat lacks the required permission.
 * @param actions - console action set.
 * @param session - signed-in session + active business context.
 */
export async function loadConsoleData(actions: ConsoleActions, session: BackendSession): Promise<void> {
  const { token, seatId, activityId } = session
  const get = async <T>(path: string): Promise<T> =>
    await api<T>(path, {}, token, seatId, activityId)

  actions.setBackend('loading')
  try {
    const activities = await get<ActivityDto[]>('/api/activities')
    actions.loadActivities(activities.map((a) => ({ id: a.id, name: a.name })))

    const seats = await get<SeatDto[]>('/api/seats')
    actions.loadSeats(seats.map((s) => ({ id: s.id, name: s.name, status: 'idle' as SeatStatus })))

    actions.loadSimulators(DEFAULT_SIMULATORS.map((m) => ({ ...m })))

    const conversations = await get<ConversationDto[]>(
      `/api/conversations?activityId=${encodeURIComponent(activityId)}`,
    )
    actions.loadConversations(conversations.map((c) => ({
      id: c.id,
      type: c.kind === 'direct' ? 'direct' : 'group',
      name: c.name,
    })))

    const first = conversations[0]
    if (first !== undefined) {
      const messages = await get<MessageDto[]>(`/api/conversations/${first.id}/messages`)
      actions.loadMessages(messages.map((m) => ({
        id: m.id,
        type: 'report',
        from: m.senderSeatId ?? '席位',
        content: m.content,
        at: m.createdAt ?? Date.now(),
      })))
    }

    // Plans and audit are permission-gated (approval seats); a denial keeps the
    // console usable and the module falls back to its empty state.
    try {
      const plans = await get<PlanVersionDto[]>(
        `/api/plans?activityId=${encodeURIComponent(activityId)}`,
      )
      actions.loadPlans(plans.map((p, i) => mapPlan(p, i)))
    } catch { /* plans unavailable for this seat */ }

    try {
      const audit = await get<AuditDto[]>(
        `/api/audit?activityId=${encodeURIComponent(activityId)}`,
      )
      actions.loadTrajectory(audit.map((a, i) => ({
        step: i + 1,
        action: `${a.action ?? 'audit'}${a.targetId === undefined ? '' : ` · ${a.targetId}`}`,
        at: a.createdAt ?? Date.now(),
      })))
    } catch { /* audit unavailable for this seat */ }

    actions.setBackend('ready')
  } catch (error) {
    actions.setBackend('error', (error as Error).message)
  }
}

/** Map a backend plan version onto the console's plan-score row. */
function mapPlan(p: PlanVersionDto, index: number): PlanScore {
  const status = p.status ?? ''
  return {
    planId: p.id ?? p.plan_id ?? `p${String(index + 1)}`,
    planName: p.name ?? p.plan_name ?? `方案${String(index + 1)}`,
    scores: [],
    weighted: p.weightedScore ?? 0,
    selected: status === 'selected' || status === 'confirmed',
    dispatched: status === 'dispatched',
  }
}
