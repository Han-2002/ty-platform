/**
 * Wargaming platform host service: owns the Platform runtime and exposes its
 * business face over the `wargame` Typert Remote namespace, so the browser
 * `ui-wargame` console can drive real seats / knowledge / skills / tasks /
 * simulation instead of front-end mock data.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { Platform } from './platform.ts'
import { AgentSeatBridge } from './agentSeatBridge.ts'
import type { AgentSeatContextSync } from './types.ts'
import type { Seat } from './org/organization.ts'
import type {
  ActivityView,
  ApproveOutputRequest,
  ConversationView,
  GeneratePlansRequest,
  GeneratePlansValue,
  KnowledgeView,
  ListKnowledgeRequest,
  ListMessagesRequest,
  ListSkillsRequest,
  MessageView,
  OutputView,
  RoleView,
  SeatView,
  SendInstructionRequest,
  SimulatorView,
  SkillView,
  SubmitOutputRequest,
  TaskView,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `wargame` Remote namespace. */
    wargamePlatform: WargamePlatform
  }
}

/** Resolve the package root from this module's compiled (lib/) or source (src/) location. */
function packageRoot(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

/** Host service backing `ctx.remote.wargame`. */
export class WargamePlatform extends TypertRemoteService {
  static inject = ['typert', 'systemPrompt', 'tools']

  private readonly platform: Platform
  private readonly agentSeatBridge: AgentSeatBridge

  constructor(ctx: Context) {
    super(ctx, 'wargamePlatform', { namespace: 'wargame' })
    const root = packageRoot()
    const runtimeDir = join(root, 'runtime')
    mkdirSync(runtimeDir, { recursive: true })
    this.platform = new Platform({
      configDir: join(root, 'config'),
      skillsDir: join(root, 'skills'),
      runtimeDir,
      personasDir: join(root, 'config', 'personas'),
    })

    this.agentSeatBridge =
      new AgentSeatBridge(ctx, this.platform)
  }

  @Remote
  setAgentSeatContext(
    request: AgentSeatContextSync,
  ): { synced: true } {
    this.agentSeatBridge.sync(request)
    return { synced: true }
  }

  // ---------- seats / roles / activities ----------

  @Remote
  listSeats(): SeatView[] {
    const seatIds = this.platform.org.allSeats().map((s) => s.id)
    return seatIds.map((id) => this.seatView(this.platform.org.getSeat(id)))
  }

  @Remote
  listRoles(): RoleView[] {
    return this.platform.org.allSeats().map((s) => s.role).filter((r, i, arr) =>
      arr.findIndex((x) => x.id === r.id) === i).map((r) => ({
        id: r.id,
        name: r.name,
        level: r.level,
        clearance: r.clearance,
        canDispatch: r.can_dispatch,
        canApprove: r.can_approve,
        packs: [...r.packs],
      }))
  }

  @Remote
  listActivities(): ActivityView[] {
    return this.platform.org.allActivities().map((a) => ({
      id: a.id,
      name: a.name,
      phases: a.phases,
    }))
  }

  // ---------- knowledge (pre-filtered by role clearance) ----------

  @Remote
  listKnowledge(request: ListKnowledgeRequest): KnowledgeView[] {
    const role = this.platform.org.getRole(request.roleId)
    const view = { id: role.id, clearance: role.clearance }
    return this.platform.kb.visibleDocuments(view).map((d) => ({
      id: d.id,
      title: d.title,
      content: d.content,
      clearance: d.clearance,
    }))
  }

  // ---------- skills (authorized per role) ----------

  @Remote
  listSkills(request: ListSkillsRequest): SkillView[] {
    const seat = this.platform.org.allSeats().find((s) => s.role.id === request.roleId)
    if (seat === undefined) return []
    const roleView = {
      id: seat.role.id,
      clearance: seat.clearance,
      packs: seat.packs,
      skill_allow: seat.skill_allow,
    }
    return this.platform.registry.availableSkills(roleView).map((s) => ({
      name: s.name,
      description: s.description,
      clearance: s.clearance,
      enabled: s.enabled,
      allowedRoles: [...s.allowed_roles],
    }))
  }

  // ---------- simulators ----------

  @Remote
  listSimulators(): SimulatorView[] {
    return this.platform.simulationService['runner'].configs.map((c) => ({
      id: c.id,
      name: c.name,
      weight: c.weight,
    }))
  }

  // ---------- conversations / messages ----------

  @Remote
  listConversations(): ConversationView[] {
    return this.platform.messageBus.allConversations().map((c) => ({
      id: c.id,
      type: c.type,
      members: [...c.members],
      activityId: c.activityId,
      ...(c.branchFrom !== undefined ? { branchFrom: c.branchFrom } : {}),
    }))
  }

  @Remote
  listMessages(request: ListMessagesRequest): MessageView[] {
    return this.platform.messageBus.getMessages(request.conversationId).map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      type: m.type,
      from: m.from,
      content: m.content,
      mentions: [...m.mentions],
      timestamp: m.timestamp,
    }))
  }

  // ---------- tasks / outputs ----------

  @Remote
  listTasks(): TaskView[] {
    const tasks = this.platform.taskManager['tasksForActivity'] !== undefined
      ? [...this.platform.taskManager['tasks'].values()]
      : []
    return tasks.map((t) => ({
      id: t.id,
      activityId: t.activityId,
      title: t.title,
      requiredSkills: [...t.requiredSkills],
      requiredClearance: t.requiredClearance,
      ...(t.assignedSeatId !== undefined ? { assignedSeatId: t.assignedSeatId } : {}),
      status: t.status,
    }))
  }

  @Remote
  listPendingOutputs(): OutputView[] {
    return this.platform.taskManager.pendingOutputs().map((o) => this.outputView(o))
  }

  @Remote
  sendInstruction(request: SendInstructionRequest): TaskView {
    const task = this.platform.taskManager.autoDispatch({
      activityId: request.activityId,
      title: request.text,
      requiredSkills: [],
      requiredClearance: 0,
    })
    return this.taskView(task)
  }

  @Remote
  submitOutput(request: SubmitOutputRequest): OutputView {
    const output = this.platform.taskManager.submitOutput(request.taskId, request.seatId, request.content)
    return this.outputView(output)
  }

  @Remote
  approveOutput(request: ApproveOutputRequest): OutputView {
    const output = this.platform.taskManager.approve(request.bySeatId, request.outputId)
    return this.outputView(output)
  }

  @Remote
  rejectOutput(request: ApproveOutputRequest): OutputView {
    const output = this.platform.taskManager.reject(request.bySeatId, request.outputId)
    return this.outputView(output)
  }

  // ---------- plans / simulation ----------

  @Remote
  async generatePlans(request: GeneratePlansRequest): Promise<GeneratePlansValue> {
    const seats = this.platform.org.allSeats().filter((s) => s.can_dispatch).slice(0, 2)
    const seatIds = seats.map((s) => s.id)
    if (seatIds.length === 0) {
      throw new RemoteError('gateway/internal', 'no seat with dispatch permission', {})
    }
    const plans = await this.platform.generatePlans(seatIds, request.topic)
    const results = await this.platform.simulationService.evaluatePlans(plans)
    return {
      plans: results.map((r) => ({
        planId: r.plan.plan_id,
        planName: r.plan.plan_name,
        content: r.plan.plan_content,
        seatId: r.plan.seatId,
        weightedScore: Math.round(r.weightedScore * 10) / 10,
        rank: r.rank ?? 0,
        outcomes: r.outcomes.map((o) => ({
          simulatorId: o.simulatorId,
          connected: o.connected,
          ...(o.result !== undefined ? { score: o.result.score } : {}),
        })),
        confirmed: this.platform.simulationService.isConfirmed,
      })),
      report: this.platform.simulationService.report(),
    }
  }

  @Remote
  confirmPlan(): { confirmed: true } {
    this.platform.simulationService.confirmSelection()
    return { confirmed: true }
  }

  // ---------- helpers ----------

  private seatView(seat: Seat): SeatView {
    return {
      id: seat.id,
      name: seat.name,
      roleId: seat.role.id,
      roleName: seat.role.name,
      level: seat.level,
      clearance: seat.clearance,
      canDispatch: seat.can_dispatch,
      canApprove: seat.can_approve,
      parentId: seat.parentId,
      status: this.seatStatus(seat.id),
    }
  }

  private seatStatus(seatId: string): SeatView['status'] {
    const pending = this.platform.taskManager.pendingOutputs().some((o) => o.seatId === seatId)
    if (pending) return 'awaiting'
    const executing = this.platform.taskManager.tasksForActivity !== undefined
      && [...this.platform.taskManager['tasks'].values()].some(
        (t) => t.assignedSeatId === seatId && t.status === 'executing')
    if (executing) return 'executing'
    return 'idle'
  }

  private taskView(t: {
    id: string
    activityId: string
    title: string
    requiredSkills: string[]
    requiredClearance: number
    assignedSeatId?: string
    status: 'pending' | 'executing' | 'done'
  }): TaskView {
    return {
      id: t.id,
      activityId: t.activityId,
      title: t.title,
      requiredSkills: [...t.requiredSkills],
      requiredClearance: t.requiredClearance,
      ...(t.assignedSeatId !== undefined ? { assignedSeatId: t.assignedSeatId } : {}),
      status: t.status,
    }
  }

  private outputView(o: {
    id: string
    taskId: string
    seatId: string
    content: string
    status: 'executing' | 'waiting_approval' | 'completed'
  }): OutputView {
    return { id: o.id, taskId: o.taskId, seatId: o.seatId, content: o.content, status: o.status }
  }
}

export default WargamePlatform


