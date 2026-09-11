/**
 * The console engine: one `defineStore` that owns every cross-module fact
 * (seats, tasks, plans, skills, mcp, knowledge, etc.) and the shell state
 * (open / activeModule). State is persisted to localStorage so a refresh
 * keeps the operator's choices.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ModuleId } from './modules.ts'
import type {
  ActivityItem,
  ConversationItem,
  KnowledgeItem,
  McpServiceItem,
  MessageItem,
  OutputItem,
  PlanScore,
  RoleItem,
  RuntimeMetrics,
  SeatItem,
  SkillItem,
  TaskItem,
  TrajectoryStep,
} from './types.js'

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

// ---------- metrics ----------

const SEED_METRICS: RuntimeMetrics = { turns: 0, steps: 0, ttft: 0, tokens: 0, contextUsage: 0 }

// ---------- state + actions ----------

/** A real skill from the host skill directory (`skills/list` RPC). */
export interface RealSkill {
  name: string
  description: string
  /** Whether the model may invoke it on its own (false → user-only). */
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
}

let msgSeq = 0
const nextMessageId = (): string => `m${String(++msgSeq)}-${Date.now().toString(36)}`

function deterministicScore(seed: string, lo: number, hi: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return lo + (h % (hi - lo + 1))
}

export function createConsoleStore() {
  return defineStore({
    persist: 'wargame-console-v2',
    init: (): ConsoleState => ({
      open: false,
      activeModule: 'seats',
      currentActivityId: null,
      activeConversationId: null,
      currentRoleId: 'staff',
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
    }),
    actions: {
      open: (d) => { d.open = true },
      close: (d) => { d.open = false },
      selectModule: (d, id: ModuleId) => { d.activeModule = id },

      // Load real data from the host `wargame` Remote namespace.
      loadActivities: (d, items: ActivityItem[]) => { d.activities = items },
      loadSeats: (d, items: SeatItem[]) => { d.seats = items },
      loadKnowledge: (d, items: KnowledgeItem[]) => { d.knowledge = items },
      loadSimulators: (d, items: McpServiceItem[]) => { d.mcpServices = items },

      selectActivity: (d, id: string | null) => {
        d.currentActivityId = id
      },
      selectConversation: (d, id: string | null) => {
        d.activeConversationId = id
      },
      setRole: (d, id: string) => {
        d.currentRoleId = id
      },

      // Operator dispatches an instruction: real cross-module effect
      // (requires a selected activity and a role with canDispatch).
      sendInstruction: (d, text: string) => {
        if (d.currentActivityId === null) return
        const role = ROLES[d.currentRoleId]
        if (role === undefined || !role.canDispatch) return
        const at = Date.now()
        d.messages.push({ id: nextMessageId(), type: 'instruction', from: '操作员', content: text, at })
        // auto-dispatch to a capable idle staff seat
        const target = d.seats.find((s) => s.id === 'seat-staff-1') ?? d.seats.find((s) => s.status === 'idle')
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
      },

      approveOutput: (d, outputId: string) => {
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
      },

      rejectOutput: (d, outputId: string) => {
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
      },

      // Plan generation: uses only CONNECTED mcp services, weighted score.
      generatePlans: (d) => {
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
            const m = activeMcp.find((x) => x.id === s.simulator)
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
      },

      confirmSelectedPlan: (d) => {
        const plan = d.plans.find((p) => p.selected)
        if (plan === undefined || plan.dispatched) return
        plan.dispatched = true
        const at = Date.now()
        d.messages.push({ id: nextMessageId(), type: 'report', from: '系统', content: `已下发执行：${plan.planName}`, at })
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `择优下发：${plan.planName}（加权 ${String(plan.weighted)}）`, at })
        d.metrics.steps += 1
      },

      setRealSkills: (d, skills: RealSkill[]) => {
        d.realSkills = skills
      },
      toggleSkill: (d, id: string) => {
        const skill = d.skills.find((s) => s.id === id)
        if (skill === undefined) return
        skill.enabled = !skill.enabled
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `${skill.enabled ? '启用' : '停用'}技能：${skill.name}`, at: Date.now() })
      },
      uploadSkill: (d, name: string) => {
        const trimmed = name.trim()
        if (trimmed === '') return
        const id = `sk${String(d.skills.length + 1)}-${Date.now().toString(36)}`
        d.skills.push({ id, name: trimmed, enabled: false })
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `上传技能：${trimmed}`, at: Date.now() })
      },
      assignSkill: (d, id: string) => {
        const skill = d.skills.find((s) => s.id === id)
        if (skill === undefined) return
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `角色装配：${skill.name}`, at: Date.now() })
      },

      setMcpConnected: (d, id: string, connected: boolean) => {
        const m = d.mcpServices.find((x) => x.id === id)
        if (m === undefined) return
        m.connected = connected
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `${m.name}：${connected ? '已连接' : '已停止'}`, at: Date.now() })
      },

      // Idle proactive: one seat that has been idle long enough pushes a tip.
      idleTick: (d) => {
        const idle = d.seats.find((s) => s.status === 'idle')
        if (idle === undefined) return
        const at = Date.now()
        d.messages.push({ id: nextMessageId(), type: 'proactive', from: idle.name, content: `主动提示：当前无任务，已整理重点信息。`, at })
        d.trajectorySeq += 1
        d.trajectory.push({ step: d.trajectorySeq, action: `${idle.name} 主动推送提示`, at })
      },
    },
  })
}

export const engineHelpers = {
  canView,
  roles: ROLES,
  allRoles: () => Object.keys(ROLES),
}

/** Hand-written baked actions: the framework's `BakedActions` derivation over
 * `ActionsDecl<T>` uses `any[]` for params, which makes every parameter
 * `possibly undefined` in the consumer. The runtime is correct; the type
 * derivation is the documented fragility. We expose the shape directly so
 * module views see required parameters. */
export type ConsoleActions = {
  open: () => void
  close: () => void
  selectModule: (id: ModuleId) => void
  selectActivity: (id: string | null) => void
  selectConversation: (id: string | null) => void
  setRole: (id: string) => void
  loadActivities: (items: ActivityItem[]) => void
  loadSeats: (items: SeatItem[]) => void
  loadKnowledge: (items: KnowledgeItem[]) => void
  loadSimulators: (items: McpServiceItem[]) => void
  sendInstruction: (text: string) => void
  approveOutput: (id: string) => void
  rejectOutput: (id: string) => void
  generatePlans: () => void
  confirmSelectedPlan: () => void
  setRealSkills: (skills: RealSkill[]) => void
  toggleSkill: (id: string) => void
  uploadSkill: (name: string) => void
  assignSkill: (id: string) => void
  setMcpConnected: (id: string, connected: boolean) => void
  idleTick: () => void
}

/** The full engine state shape. */
export type ConsoleStateShape = ConsoleState

/**
 * Shared console actions for cross-scope entries. The store is a per-scope
 * axis (root and session instances never share), so the console state lives on
 * the ROOT scope only (sidebar trigger + shell overlay). Session-scope entries
 * (the composer sword button) reach the SAME root instance through this
 * reference, captured from the root trigger's inject factory. A handle is
 * never exported at module level (per the store contract).
 */
let consoleActionsRef: ConsoleActions | null = null

export function setConsoleActions(actions: ConsoleActions): void {
  consoleActionsRef = actions
}

export function getConsoleActions(): ConsoleActions {
  return consoleActionsRef ?? NOOP_CONSOLE_ACTIONS
}

/** No-op write set used before the root store instance is mounted. */
const NOOP_CONSOLE_ACTIONS: ConsoleActions = {
  open: () => {},
  close: () => {},
  selectModule: () => {},
  selectActivity: () => {},
  selectConversation: () => {},
  setRole: () => {},
  loadActivities: () => {},
  loadSeats: () => {},
  loadKnowledge: () => {},
  loadSimulators: () => {},
  sendInstruction: () => {},
  approveOutput: () => {},
  rejectOutput: () => {},
  generatePlans: () => {},
  confirmSelectedPlan: () => {},
  setRealSkills: () => {},
  toggleSkill: () => {},
  uploadSkill: () => {},
  assignSkill: () => {},
  setMcpConnected: () => {},
  idleTick: () => {},
}

/**
 * Real skill directory loader. The browser bundle cannot import cordis
 * services into the store module, so `apply()` assigns `reload` with the host
 * RPC closure; components (including the composer sword button) call it to
 * refresh the real skill catalog into the console store's `realSkills`.
 */
export const skillCatalog: { reload: () => Promise<void> } = {
  reload: async () => {},
}

/**
 * Bridge to the session-scoped composer draft: the session-scope entry
 * SkillInjectorSlot captures `inputActions.setDraft` into this reference, so
 * root-scope skill cards in the console can insert `/<name> ` into the
 * current session's composer (the host's pre-step boundary recognizes the
 * leading /name and injects the rendered body on submit).
 */
let addSkillToDraft: (name: string) => void = () => {}
export function setAddSkillToDraft(fn: (name: string) => void): void {
  addSkillToDraft = fn
}
export function getAddSkillToDraft(): (name: string) => void {
  return addSkillToDraft
}
