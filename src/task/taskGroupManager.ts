import { randomUUID } from 'node:crypto';
import { PermissionDenied } from '../errors.js';
import type {
  GroupPlan,
  PeerDecisionMode,
  PeerDecisionRecord,
  TaskGroup,
  TaskGroupMode,
} from '../types.js';
import type { Organization } from '../org/organization.js';
import type { TaskInput, TaskManager } from './taskManager.js';

export interface CreateTaskGroupInput {
  activityId: string;
  name: string;
  mode: TaskGroupMode;
  memberSeatIds: string[];
  leaderSeatId?: string;
  peerDecisionMode?: PeerDecisionMode;
}

export class TaskGroupManager {
  private readonly groups = new Map<string, TaskGroup>();
  private readonly peerDecisions = new Map<string, PeerDecisionRecord>();
  private readonly plans = new Map<string, GroupPlan>();

  constructor(
    private readonly org: Organization,
    private readonly tasks: TaskManager,
  ) {}

  createGroup(bySeatId: string, input: CreateTaskGroupInput): TaskGroup {
    const creator = this.org.getSeat(bySeatId);
    if (!creator.can_dispatch) {
      throw new PermissionDenied(`席位 ${bySeatId} 无任务组创建权`);
    }

    this.org.getActivity(input.activityId);

    const memberSeatIds = [...new Set(input.memberSeatIds)];
    if (memberSeatIds.length === 0) throw new Error('任务组至少需要 1 个成员');
    for (const seatId of memberSeatIds) this.org.getSeat(seatId);

    if (input.mode === 'hierarchical') {
      if (!input.leaderSeatId) throw new Error('层级组必须指定 leaderSeatId');
      if (!memberSeatIds.includes(input.leaderSeatId)) {
        throw new Error('层级组 leader 必须属于本任务组');
      }
      const leader = this.org.getSeat(input.leaderSeatId);
      if (!leader.can_dispatch) {
        throw new Error(`层级组 leader ${leader.id} 必须具备 can_dispatch`);
      }
    } else {
      if (input.leaderSeatId) throw new Error('平级组不能指定 leaderSeatId');
      if (!input.peerDecisionMode) throw new Error('平级组必须指定 peerDecisionMode');
    }

    const group: TaskGroup = {
      id: randomUUID(),
      activityId: input.activityId,
      name: input.name,
      mode: input.mode,
      memberSeatIds,
      leaderSeatId: input.mode === 'hierarchical' ? input.leaderSeatId : undefined,
      peerDecisionMode: input.mode === 'peer' ? input.peerDecisionMode : undefined,
      status: 'forming',
      createdAt: Date.now(),
    };
    this.groups.set(group.id, group);
    return group;
  }

  getGroup(groupId: string): TaskGroup {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`任务组不存在: ${groupId}`);
    return group;
  }

  groupsForActivity(activityId: string): TaskGroup[] {
    return [...this.groups.values()].filter((g) => g.activityId === activityId);
  }

  allGroups(): TaskGroup[] {
    return [...this.groups.values()].map((g) => ({
      ...g,
      memberSeatIds: [...g.memberSeatIds],
    }));
  }

  // 仅用于数据库恢复。
  restoreGroup(group: TaskGroup): void {
    this.org.getActivity(group.activityId);
    for (const seatId of group.memberSeatIds) this.org.getSeat(seatId);
    if (group.mode === 'hierarchical') {
      if (!group.leaderSeatId || !group.memberSeatIds.includes(group.leaderSeatId)) {
        throw new Error(`恢复层级组失败：leader 无效 ${group.id}`);
      }
    }
    this.groups.set(group.id, {
      ...group,
      memberSeatIds: [...group.memberSeatIds],
    });
  }

  clearForRestore(): void {
    this.groups.clear();
    this.peerDecisions.clear();
    this.plans.clear();
  }

  dispatchHierarchicalTask(
    groupId: string,
    bySeatId: string,
    input: TaskInput,
    targetSeatId: string,
  ) {
    const group = this.getGroup(groupId);
    if (group.mode !== 'hierarchical') throw new Error('该任务组不是层级组');
    if (group.leaderSeatId !== bySeatId) {
      throw new PermissionDenied(`只有层级组 leader ${group.leaderSeatId} 可以分派组内任务`);
    }
    this.assertMember(group, targetSeatId);
    this.assertSameActivity(group, input);
    group.status = 'executing';
    return this.tasks.dispatchInGroup(input, targetSeatId, group.id);
  }

  recordPeerAssignment(
    groupId: string,
    bySeatId: string,
    input: TaskInput,
    targetSeatId: string,
  ) {
    const group = this.getGroup(groupId);
    if (group.mode !== 'peer') throw new Error('该任务组不是平级组');
    this.assertMember(group, bySeatId);
    this.assertMember(group, targetSeatId);
    this.assertSameActivity(group, input);
    group.status = 'executing';
    return this.tasks.dispatchInGroup(input, targetSeatId, group.id);
  }

  confirmPeerDecision(
    groupId: string,
    bySeatId: string,
    summary: string,
    confirmedBySeatIds: string[],
  ): PeerDecisionRecord {
    const group = this.getGroup(groupId);
    if (group.mode !== 'peer') throw new Error('该任务组不是平级组');
    this.assertMember(group, bySeatId);

    const confirmed = [...new Set(confirmedBySeatIds)];
    if (confirmed.length === 0) throw new Error('至少需要 1 个成员确认平级组决策');
    for (const seatId of confirmed) this.assertMember(group, seatId);

    const record: PeerDecisionRecord = {
      groupId,
      mode: group.peerDecisionMode!,
      summary,
      confirmedBySeatIds: confirmed,
      createdAt: Date.now(),
    };
    this.peerDecisions.set(groupId, record);
    return record;
  }

  getPeerDecision(groupId: string): PeerDecisionRecord | undefined {
    return this.peerDecisions.get(groupId);
  }

  submitGroupPlan(
    groupId: string,
    bySeatId: string,
    name: string,
    content: string,
  ): GroupPlan {
    const group = this.getGroup(groupId);
    this.assertMember(group, bySeatId);

    if (group.mode === 'hierarchical' && group.leaderSeatId !== bySeatId) {
      throw new PermissionDenied('层级组方案只能由 leader 汇总提交');
    }
    if (group.mode === 'peer' && !this.peerDecisions.has(groupId)) {
      throw new Error('平级组提交方案前必须先形成群体决策记录');
    }

    const plan: GroupPlan = {
      id: randomUUID(),
      activityId: group.activityId,
      groupId,
      name,
      content,
      submittedBySeatId: bySeatId,
      status: 'submitted',
      createdAt: Date.now(),
    };
    this.plans.set(plan.id, plan);
    group.status = 'plan_submitted';
    return plan;
  }

  getPlan(planId: string): GroupPlan {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`任务组方案不存在: ${planId}`);
    return plan;
  }

  plansForActivity(activityId: string): GroupPlan[] {
    return [...this.plans.values()].filter((p) => p.activityId === activityId);
  }

  plansForGroup(groupId: string): GroupPlan[] {
    return [...this.plans.values()].filter((p) => p.groupId === groupId);
  }

  approvePlan(bySeatId: string, planId: string): GroupPlan {
    const seat = this.org.getSeat(bySeatId);
    if (!seat.can_approve) throw new PermissionDenied(`席位 ${bySeatId} 无最终方案审批权`);
    const plan = this.getPlan(planId);
    plan.status = 'approved';
    this.getGroup(plan.groupId).status = 'completed';
    return plan;
  }

  rejectPlan(bySeatId: string, planId: string): GroupPlan {
    const seat = this.org.getSeat(bySeatId);
    if (!seat.can_approve) throw new PermissionDenied(`席位 ${bySeatId} 无最终方案审批权`);
    const plan = this.getPlan(planId);
    plan.status = 'rejected';
    this.getGroup(plan.groupId).status = 'executing';
    return plan;
  }

  private assertMember(group: TaskGroup, seatId: string): void {
    if (!group.memberSeatIds.includes(seatId)) {
      throw new PermissionDenied(`席位 ${seatId} 不属于任务组 ${group.id}`);
    }
  }

  private assertSameActivity(group: TaskGroup, input: TaskInput): void {
    if (group.activityId !== input.activityId) {
      throw new Error(`任务 activityId 与任务组 ${group.id} 不一致`);
    }
  }
}
