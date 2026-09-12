import { randomUUID } from 'node:crypto';
import { PermissionDenied } from '../errors.js';
import type { Organization } from '../org/organization.js';
import type { TaskGroupManager } from '../task/taskGroupManager.js';

export type WorkflowStatus = 'running' | 'completed';
export type WorkflowStepStatus = 'pending' | 'active' | 'completed';
export type WorkflowActorRule = 'leader' | 'member' | 'any';
export type WorkflowChangeStatus = 'pending' | 'approved' | 'rejected';

export interface WorkflowStep {
  id: string;
  key: string;
  name: string;
  actorRule: WorkflowActorRule;
  status: WorkflowStepStatus;
}

export interface WorkflowInstance {
  id: string;
  groupId: string;
  activityId: string;
  template: 'hierarchical-standard' | 'peer-standard';
  status: WorkflowStatus;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}

export type WorkflowChange =
  | {
      type: 'insert_step';
      afterStepKey: string;
      name: string;
      actorRule?: WorkflowActorRule;
    }
  | {
      type: 'backtrack';
      targetStepKey: string;
    };

export interface WorkflowChangeProposal {
  id: string;
  workflowId: string;
  proposedBySeatId: string;
  reason: string;
  change: WorkflowChange;
  status: WorkflowChangeStatus;
  createdAt: number;
  decidedAt?: number;
  decidedBySeatId?: string;
}

export interface WorkflowLogEntry {
  at: number;
  workflowId: string;
  actorSeatId?: string;
  action:
    | 'create'
    | 'complete_step'
    | 'workflow_completed'
    | 'propose_change'
    | 'approve_change'
    | 'reject_change';
  detail: string;
}

const hierarchicalTemplate = (): WorkflowStep[] => [
  step('accept_task', '接收组任务', 'leader', 'active'),
  step('leader_decompose', '组长拆解任务', 'leader'),
  step('member_execute', '成员并行执行', 'member'),
  step('leader_review', '组长审核成员产出', 'leader'),
  step('integrate_plan', '组长汇总形成方案', 'leader'),
  step('submit_plan', '提交任务组方案', 'leader'),
];

const peerTemplate = (): WorkflowStep[] => [
  step('accept_task', '接收组任务', 'any', 'active'),
  step('peer_negotiate', 'Agent 协商分工', 'member'),
  step('parallel_execute', '成员并行执行', 'member'),
  step('share_results', '组内共享结果', 'member'),
  step('peer_decision', '群体决策形成统一意见', 'member'),
  step('submit_plan', '提交任务组方案', 'member'),
];

function step(
  key: string,
  name: string,
  actorRule: WorkflowActorRule,
  status: WorkflowStepStatus = 'pending',
): WorkflowStep {
  return { id: randomUUID(), key, name, actorRule, status };
}

export class WorkflowManager {
  private readonly workflows = new Map<string, WorkflowInstance>();
  private readonly workflowByGroup = new Map<string, string>();
  private readonly proposals = new Map<string, WorkflowChangeProposal>();
  private readonly log: WorkflowLogEntry[] = [];

  constructor(
    private readonly org: Organization,
    private readonly groups: TaskGroupManager,
  ) {}

  createForGroup(groupId: string): WorkflowInstance {
    if (this.workflowByGroup.has(groupId)) {
      throw new Error(`任务组 ${groupId} 已存在工作流`);
    }

    const group = this.groups.getGroup(groupId);
    const hierarchical = group.mode === 'hierarchical';
    const workflow: WorkflowInstance = {
      id: randomUUID(),
      groupId,
      activityId: group.activityId,
      template: hierarchical ? 'hierarchical-standard' : 'peer-standard',
      status: 'running',
      steps: hierarchical ? hierarchicalTemplate() : peerTemplate(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.workflows.set(workflow.id, workflow);
    this.workflowByGroup.set(groupId, workflow.id);
    this.pushLog(workflow.id, undefined, 'create', `创建 ${workflow.template}`);
    return workflow;
  }

  getWorkflow(workflowId: string): WorkflowInstance {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`工作流不存在: ${workflowId}`);
    return workflow;
  }

  workflowForGroup(groupId: string): WorkflowInstance | undefined {
    const id = this.workflowByGroup.get(groupId);
    return id ? this.workflows.get(id) : undefined;
  }

  allWorkflows(): WorkflowInstance[] {
    return [...this.workflows.values()].map((w) => ({
      ...w,
      steps: w.steps.map((s) => ({ ...s })),
    }));
  }

  allProposals(): WorkflowChangeProposal[] {
    return [...this.proposals.values()].map((p) => ({
      ...p,
      change: { ...p.change },
    }));
  }

  restoreWorkflow(workflow: WorkflowInstance): void {
    const group = this.groups.getGroup(workflow.groupId);
    if (group.activityId !== workflow.activityId) {
      throw new Error(`恢复工作流失败：activityId 与任务组不一致 ${workflow.id}`);
    }
    this.workflows.set(workflow.id, {
      ...workflow,
      steps: workflow.steps.map((s) => ({ ...s })),
    });
    this.workflowByGroup.set(workflow.groupId, workflow.id);
  }

  restoreProposal(proposal: WorkflowChangeProposal): void {
    this.getWorkflow(proposal.workflowId);
    this.proposals.set(proposal.id, {
      ...proposal,
      change: { ...proposal.change },
    });
  }

  clearForRestore(): void {
    this.workflows.clear();
    this.workflowByGroup.clear();
    this.proposals.clear();
    this.log.length = 0;
  }

  currentStep(workflowId: string): WorkflowStep | undefined {
    return this.getWorkflow(workflowId).steps.find((s) => s.status === 'active');
  }

  completeCurrentStep(workflowId: string, bySeatId: string): WorkflowInstance {
    const workflow = this.getWorkflow(workflowId);
    if (workflow.status === 'completed') throw new Error('工作流已完成');

    const current = this.currentStep(workflowId);
    if (!current) throw new Error('工作流没有活动步骤');

    this.assertCanAct(workflow, current, bySeatId);

    current.status = 'completed';
    this.pushLog(workflow.id, bySeatId, 'complete_step', `完成步骤 ${current.key}`);

    const next = workflow.steps.find((s) => s.status === 'pending');
    if (next) {
      next.status = 'active';
    } else {
      workflow.status = 'completed';
      this.pushLog(workflow.id, bySeatId, 'workflow_completed', '工作流完成');
    }
    workflow.updatedAt = Date.now();
    return workflow;
  }

  proposeChange(
    workflowId: string,
    bySeatId: string,
    change: WorkflowChange,
    reason: string,
  ): WorkflowChangeProposal {
    const workflow = this.getWorkflow(workflowId);
    const group = this.groups.getGroup(workflow.groupId);
    if (!group.memberSeatIds.includes(bySeatId)) {
      throw new PermissionDenied(`席位 ${bySeatId} 不属于任务组 ${group.id}`);
    }

    this.validateChange(workflow, change);

    const proposal: WorkflowChangeProposal = {
      id: randomUUID(),
      workflowId,
      proposedBySeatId: bySeatId,
      reason,
      change,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.proposals.set(proposal.id, proposal);
    this.pushLog(workflow.id, bySeatId, 'propose_change', `${change.type}: ${reason}`);
    return proposal;
  }

  approveChange(bySeatId: string, proposalId: string): WorkflowChangeProposal {
    const approver = this.org.getSeat(bySeatId);
    if (!approver.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无工作流变更审批权`);
    }

    const proposal = this.getProposal(proposalId);
    if (proposal.status !== 'pending') throw new Error('该工作流变更申请已处理');

    const workflow = this.getWorkflow(proposal.workflowId);
    this.applyChange(workflow, proposal.change);

    proposal.status = 'approved';
    proposal.decidedAt = Date.now();
    proposal.decidedBySeatId = bySeatId;
    workflow.updatedAt = Date.now();

    this.pushLog(workflow.id, bySeatId, 'approve_change', `批准 ${proposal.change.type}`);
    return proposal;
  }

  rejectChange(bySeatId: string, proposalId: string): WorkflowChangeProposal {
    const approver = this.org.getSeat(bySeatId);
    if (!approver.can_approve) {
      throw new PermissionDenied(`席位 ${bySeatId} 无工作流变更审批权`);
    }

    const proposal = this.getProposal(proposalId);
    if (proposal.status !== 'pending') throw new Error('该工作流变更申请已处理');

    proposal.status = 'rejected';
    proposal.decidedAt = Date.now();
    proposal.decidedBySeatId = bySeatId;

    this.pushLog(proposal.workflowId, bySeatId, 'reject_change', `拒绝 ${proposal.change.type}`);
    return proposal;
  }

  getProposal(proposalId: string): WorkflowChangeProposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`工作流变更申请不存在: ${proposalId}`);
    return proposal;
  }

  proposalsForWorkflow(workflowId: string): WorkflowChangeProposal[] {
    return [...this.proposals.values()].filter((p) => p.workflowId === workflowId);
  }

  getLog(workflowId?: string): WorkflowLogEntry[] {
    return workflowId ? this.log.filter((x) => x.workflowId === workflowId) : [...this.log];
  }

  private assertCanAct(
    workflow: WorkflowInstance,
    stepObj: WorkflowStep,
    bySeatId: string,
  ): void {
    const group = this.groups.getGroup(workflow.groupId);
    if (!group.memberSeatIds.includes(bySeatId)) {
      throw new PermissionDenied(`席位 ${bySeatId} 不属于任务组 ${group.id}`);
    }

    if (stepObj.actorRule === 'leader') {
      if (group.mode !== 'hierarchical' || group.leaderSeatId !== bySeatId) {
        throw new PermissionDenied(`步骤 ${stepObj.key} 只能由层级组 leader 执行`);
      }
      return;
    }

    if (stepObj.actorRule === 'member') {
      if (group.mode === 'hierarchical' && group.leaderSeatId === bySeatId) {
        throw new PermissionDenied(`步骤 ${stepObj.key} 需要普通组员执行`);
      }
      return;
    }
  }

  private validateChange(workflow: WorkflowInstance, change: WorkflowChange): void {
    if (change.type === 'insert_step') {
      if (!workflow.steps.some((s) => s.key === change.afterStepKey)) {
        throw new Error(`插入位置不存在: ${change.afterStepKey}`);
      }
      if (!change.name.trim()) throw new Error('新增步骤名称不能为空');
      return;
    }

    if (!workflow.steps.some((s) => s.key === change.targetStepKey)) {
      throw new Error(`回退目标不存在: ${change.targetStepKey}`);
    }
  }

  private applyChange(workflow: WorkflowInstance, change: WorkflowChange): void {
    if (change.type === 'insert_step') {
      const index = workflow.steps.findIndex((s) => s.key === change.afterStepKey);
      const inserted = step(
        `custom-${randomUUID()}`,
        change.name,
        change.actorRule ?? 'any',
        'pending',
      );
      workflow.steps.splice(index + 1, 0, inserted);

      if (workflow.status === 'completed') {
        workflow.status = 'running';
        inserted.status = 'active';
      }
      return;
    }

    const index = workflow.steps.findIndex((s) => s.key === change.targetStepKey);
    workflow.status = 'running';
    workflow.steps.forEach((s, i) => {
      if (i < index) s.status = 'completed';
      else if (i === index) s.status = 'active';
      else s.status = 'pending';
    });
  }

  private pushLog(
    workflowId: string,
    actorSeatId: string | undefined,
    action: WorkflowLogEntry['action'],
    detail: string,
  ): void {
    this.log.push({ at: Date.now(), workflowId, actorSeatId, action, detail });
  }
}
