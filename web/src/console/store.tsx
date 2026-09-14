/**
 * Console engine, ported from the deepseek-harness `ui-wargame` plugin.
 *
 * The original drove a framework store (`defineStore`) shared across slot
 * scopes. In this standalone app there is one React tree, so the engine is a
 * React context: one state object plus a stable action set. The data-loading
 * actions are filled by `dataLoader.ts` from the platform's HTTP API.
 */
import {
  createContext, useContext, useMemo, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react'
import type { ModuleId } from './modules'
import type {
  ActivityItem, ConversationItem, KnowledgeItem, McpServiceItem, MessageItem, OutputItem,
  PlanScore, RoleItem, RuntimeMetrics, SeatItem, SkillItem, TaskItem, TrajectoryStep,
} from './types'

// ---------- permission / role table ----------

const ROLES: Record<string, RoleItem> = {
  director: { id: 'director', clearance: 5, canApprove: true, canDispatch: true },
  staff: { id: 'staff', clearance: 4, canApprove: false, canDispatch: true },
  support: { id: 'support', clearance: 2, canApprove: false, canDispatch: false },
}

function canView(roleId: string, doc: KnowledgeItem): boolean {
  const role = ROLES[roleId]
  if (role === undefined) return false
  if (role.clearance < doc.clearance) return false
  if (doc.deny.includes(role.id)) return false
  if (doc.allow.length > 0 && !doc.allow.includes(role.id)) return false
  return true
}

/** Exposed helpers the module views read (permission table + role list). */
export const engineHelpers = {
  canView,
  roles: ROLES,
  allRoles: (): string[] => Object.keys(ROLES),
}

// ---------- state + actions ----------

const SEED_METRICS: RuntimeMetrics = { turns: 0, steps: 0, ttft: 0, tokens: 0, contextUsage: 0 }

/** A real skill from the platform skill directory. */
export interface RealSkill {
  name: string
  description: string
  modelInvocable: boolean
}

export interface ConsoleState {
  // shell
  open: boolean
  activeModule: ModuleId
  // session
  currentActivityId: string | null
  activeConversationId: string | null
  currentRoleId: string
  /** Composer draft shared by the activity composer and skill cards. */
  draft: string
  // data
  activities: ActivityItem[]
  seats: SeatItem[]
  conversations: ConversationItem[]
  messages: MessageItem[]
  tasks: TaskItem[]
  outputs: OutputItem[]
  plans: PlanScore[]
  knowledge: KnowledgeItem[]
  skills: SkillItem[]
  realSkills: RealSkill[]
  mcpServices: McpServiceItem[]
  trajectory: TrajectoryStep[]
  metrics: RuntimeMetrics
  /** Monotonic counter for trajectory step ids. */
  trajectorySeq: number
  /** Backend link status shown in the header chip. */
  backend: 'idle' | 'loading' | 'ready' | 'error'
  backendMessage: string
}

export interface ConsoleActions {
  open: () => void
  close: () => void
  selectModule: (id: ModuleId) => void
  selectActivity: (id: string | null) => void
  selectConversation: (id: string | null) => void
  setRole: (id: string) => void
  setDraft: (text: string) => void
  appendDraft: (text: string) => void
  loadActivities: (items: ActivityItem[]) => void
  loadSeats: (items: SeatItem[]) => void
  loadConversations: (items: ConversationItem[]) => void
  loadMessages: (items: MessageItem[]) => void
  loadKnowledge: (items: KnowledgeItem[]) => void
  loadSimulators: (items: McpServiceItem[]) => void
  loadPlans: (items: PlanScore[]) => void
  loadTrajectory: (items: TrajectoryStep[]) => void
  setRealSkills: (skills: RealSkill[]) => void
  setBackend: (status: ConsoleState['backend'], message?: string) => void
  sendInstruction: (text: string) => void
  approveOutput: (id: string) => void
  rejectOutput: (id: string) => void
  generatePlans: () => void
  confirmSelectedPlan: () => void
  toggleSkill: (id: string) => void
  uploadSkill: (name: string) => void
  assignSkill: (id: string) => void
  setMcpConnected: (id: string, connected: boolean) => void
  idleTick: () => void
}

export const initialState: ConsoleState = {
  open: true,
  activeModule: 'seats',
  currentActivityId: null,
  activeConversationId: null,
  currentRoleId: 'staff',
  draft: '',
  activities: [],
  seats: [],
  conversations: [],
  messages: [],
  tasks: [],
  outputs: [],
  plans: [],
  knowledge: [],
  skills: [],
  realSkills: [],
  mcpServices: [],
  trajectory: [],
  metrics: { ...SEED_METRICS },
  trajectorySeq: 0,
  backend: 'idle',
  backendMessage: '',
}

let msgSeq = 0
const nextMessageId = (): string => `m${String(++msgSeq)}-${Date.now().toString(36)}`

function deterministicScore(seed: string, lo: number, hi: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return lo + (h % (hi - lo + 1))
}

/**
 * Build the stable action set over a React state writer. Every action mutates
 * a private clone and writes it back, so the ported engine logic (written
 * against a mutable draft) survives verbatim.
 */
export function createActions(setState: Dispatch<SetStateAction<ConsoleState>>): ConsoleActions {
  const update = (fn: (d: ConsoleState) => void): void => {
    setState((prev) => {
      const d = structuredClone(prev)
      fn(d)
      return d
    })
  }
  return {
    open: () => { update((d) => { d.open = true }) },
    close: () => { update((d) => { d.open = false }) },
    selectModule: (id) => { update((d) => { d.activeModule = id }) },
    selectActivity: (id) => { update((d) => { d.currentActivityId = id }) },
    selectConversation: (id) => { update((d) => { d.activeConversationId = id }) },
    setRole: (id) => { update((d) => { d.currentRoleId = id }) },
    setDraft: (text) => { update((d) => { d.draft = text }) },
    appendDraft: (text) => { update((d) => { d.draft = d.draft === '' ? text : `${d.draft} ${text}` }) },

    loadActivities: (items) => { update((d) => { d.activities = items }) },
    loadSeats: (items) => { update((d) => { d.seats = items }) },
    loadConversations: (items) => { update((d) => { d.conversations = items }) },
    loadMessages: (items) => { update((d) => { d.messages = items }) },
    loadKnowledge: (items) => { update((d) => { d.knowledge = items }) },
    loadSimulators: (items) => { update((d) => { d.mcpServices = items }) },
    loadPlans: (items) => { update((d) => { d.plans = items }) },
    loadTrajectory: (items) => {
      update((d) => { d.trajectory = items; d.trajectorySeq = items.length })
    },
    setRealSkills: (skills) => { update((d) => { d.realSkills = skills }) },
    setBackend: (status, message = '') => {
      update((d) => { d.backend = status; d.backendMessage = message })
    },

    // Operator dispatches an instruction: local cross-module effect
    // (requires a selected activity and a role with canDispatch).
    sendInstruction: (text) => {
      update((d) => {
        if (d.currentActivityId === null) return
        const role = ROLES[d.currentRoleId]
        if (role === undefined || !role.canDispatch) return
        const at = Date.now()
        d.messages.push({ id: nextMessageId(), type: 'instruction', from: '操作员', content: text, at })
        const target = d.seats.find((s) => s.status === 'idle')
        if (target === undefined) return
        target.status = 'executing'
        const task: TaskItem = {
          id: `t${String(d.tasks.length + 1)}`,
          activityId: d.currentActivityId,
          title: text.slice(0, 24),
          assignedSeatId: target.id,
          status: 'executing',
        }
        d.tasks.push(task)
        const output: OutputItem = {
          id: `o${String(d.outputs.length + 1)}`,
          taskId: task.id,
          seatId: target.id,
          content: `【${target.name}】方案：${text}`,
          status: 'waiting_approval',
          createdAt: at,
        }
        d.outputs.push(output)
        d.metrics.turns += 1
        d.metrics.tokens += Math.ceil(text.length / 4)
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `派发指令→${target.name}（${task.title}）`, at })
        d.draft = ''
      })
    },

    approveOutput: (outputId) => {
      update((d) => {
        const role = ROLES[d.currentRoleId]
        if (role === undefined || !role.canApprove) {
          d.trajectorySeq += 1
          d.trajectory.push({ step: d.trajectorySeq, action: `审批被拒：无审批权（${d.currentRoleId}）`, at: Date.now() })
          return
        }
        const output = d.outputs.find((o) => o.id === outputId)
        if (output === undefined || output.status !== 'waiting_approval') return
        output.status = 'completed'
        const task = d.tasks.find((t) => t.id === output.taskId)
        if (task !== undefined) task.status = 'done'
        const seat = d.seats.find((s) => s.id === output.seatId)
        if (seat !== undefined) seat.status = 'idle'
        const at = Date.now()
        d.messages.push({ id: nextMessageId(), type: 'report', from: seat?.name ?? '未知席位', content: `任务已完成：${output.content}`, at })
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `审批通过：${output.content}`, at })
        d.metrics.steps += 1
      })
    },

    rejectOutput: (outputId) => {
      update((d) => {
        const role = ROLES[d.currentRoleId]
        if (role === undefined || !role.canApprove) return
        const output = d.outputs.find((o) => o.id === outputId)
        if (output === undefined || output.status !== 'waiting_approval') return
        output.status = 'executing'
        const seat = d.seats.find((s) => s.id === output.seatId)
        if (seat !== undefined) seat.status = 'executing'
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `打回重做：${output.content}`, at: Date.now() })
        d.metrics.steps += 1
      })
    },

    // Plan generation: uses only CONNECTED mcp services, weighted score.
    generatePlans: () => {
      update((d) => {
        const activeMcp = d.mcpServices.filter((m) => m.connected)
        if (activeMcp.length === 0) {
          d.trajectorySeq += 1
          d.trajectory.push({ step: d.trajectorySeq, action: '生成方案失败：无可用仿真引擎', at: Date.now() })
          return
        }
        const names = ['方案甲', '方案乙']
        d.plans = names.map((name, i) => {
          const planId = `p${String(i + 1)}`
          const scores = activeMcp.map((m) => ({
            simulator: m.name,
            score: deterministicScore(`${planId}:${m.id}`, 40, 95),
          }))
          let num = 0
          let den = 0
          for (const s of scores) {
            const m = activeMcp.find((x) => x.name === s.simulator)
            if (m === undefined) continue
            num += s.score * m.weight
            den += m.weight
          }
          const weighted = den === 0 ? 0 : Math.round((num / den) * 10) / 10
          return { planId, planName: name, scores, weighted, selected: i === 0, dispatched: false }
        })
        const at = Date.now()
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `生成 ${String(d.plans.length)} 套候选方案（${String(activeMcp.length)} 个引擎）`, at })
        d.metrics.turns += 1
      })
    },

    confirmSelectedPlan: () => {
      update((d) => {
        const plan = d.plans.find((p) => p.selected)
        if (plan === undefined || plan.dispatched) return
        plan.dispatched = true
        const at = Date.now()
        d.messages.push({ id: nextMessageId(), type: 'report', from: '系统', content: `已下发执行：${plan.planName}`, at })
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `择优下发：${plan.planName}（加权 ${String(plan.weighted)}）`, at })
        d.metrics.steps += 1
      })
    },

    toggleSkill: (id) => {
      update((d) => {
        const skill = d.skills.find((s) => s.id === id)
        if (skill === undefined) return
        skill.enabled = !skill.enabled
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `${skill.enabled ? '启用' : '停用'}技能：${skill.name}`, at: Date.now() })
      })
    },
    uploadSkill: (name) => {
      update((d) => {
        const trimmed = name.trim()
        if (trimmed === '') return
        const id = `sk${String(d.skills.length + 1)}-${Date.now().toString(36)}`
        d.skills.push({ id, name: trimmed, enabled: false })
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `上传技能：${trimmed}`, at: Date.now() })
      })
    },
    assignSkill: (id) => {
      update((d) => {
        const skill = d.skills.find((s) => s.id === id)
        if (skill === undefined) return
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `角色装配：${skill.name}`, at: Date.now() })
      })
    },

    setMcpConnected: (id, connected) => {
      update((d) => {
        const m = d.mcpServices.find((x) => x.id === id)
        if (m === undefined) return
        m.connected = connected
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `${m.name}：${connected ? '已连接' : '已停止'}`, at: Date.now() })
      })
    },

    // Idle proactive: one seat that has been idle long enough pushes a tip.
    idleTick: () => {
      update((d) => {
        const idle = d.seats.find((s) => s.status === 'idle')
        if (idle === undefined) return
        const at = Date.now()
        d.messages.push({ id: nextMessageId(), type: 'proactive', from: idle.name, content: '主动提示：当前无任务，已整理重点信息。', at })
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `${idle.name} 主动推送提示`, at })
      })
    },
  }
}

// ---------- React context ----------

export interface ConsoleContextValue {
  state: ConsoleState
  actions: ConsoleActions
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null)

/** Provider owning the console state; mount once around the console shell. */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConsoleState>(initialState)
  const actions = useMemo(() => createActions(setState), [])
  const value = useMemo<ConsoleContextValue>(() => ({ state, actions }), [state, actions])
  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
}

/** Read the console state + actions; throws outside the provider. */
export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext)
  if (value === null) throw new Error('useConsole must be used inside <ConsoleProvider>')
  return value
}
