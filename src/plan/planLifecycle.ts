import { randomUUID } from 'node:crypto';
import type { GroupPlan, Plan } from '../types.js';
import type { PermissionEngine } from '../permission/permissionEngine.js';
import type { AuditTrail } from '../audit/auditTrail.js';
import type { SimulationService, PlanRunResult } from '../sim/simulation.js';

export type VersionedPlanStatus =
  | 'candidate'
  | 'evaluated'
  | 'selected'
  | 'dispatched'
  | 'superseded';

export interface PlanActorContext {
  userId: string;
  seatId: string;
  activityId: string;
  groupId?: string;
  actorType?: 'human' | 'agent' | 'system';
}

export interface VersionedPlan {
  id: string;
  logicalPlanId: string;
  activityId: string;
  groupId: string;
  version: number;
  name: string;
  content: string;
  submittedBySeatId: string;
  parentVersionId?: string;
  status: VersionedPlanStatus;
  createdAt: number;
}

export interface EvaluationRun {
  id: string;
  activityId: string;
  planVersionIds: string[];
  recommendedPlanVersionId?: string;
  selectedPlanVersionId?: string;
  createdAt: number;
  confirmedAt?: number;
  dispatchedAt?: number;
  selectionReason?: string;
}

export class PlanLifecycleService {
  private readonly versions = new Map<string, VersionedPlan>();
  private readonly evaluations = new Map<string, EvaluationRun>();

  constructor(
    private readonly simulation: SimulationService,
    private readonly permissions: PermissionEngine,
    private readonly audit?: AuditTrail,
  ) {}

  createFromGroupPlan(ctx: PlanActorContext, groupPlan: GroupPlan): VersionedPlan {
    if (ctx.activityId !== groupPlan.activityId) throw new Error('业务上下文 activityId 与 GroupPlan 不一致');
    if (ctx.groupId && ctx.groupId !== groupPlan.groupId) throw new Error('业务上下文 groupId 与 GroupPlan 不一致');

    this.permissions.assert({
      userId: ctx.userId, seatId: ctx.seatId, activityId: ctx.activityId,
      groupId: groupPlan.groupId, action: 'plan.submit', actorType: ctx.actorType,
      resourceId: groupPlan.id,
    });

    const version: VersionedPlan = {
      id: randomUUID(), logicalPlanId: groupPlan.id, activityId: groupPlan.activityId,
      groupId: groupPlan.groupId, version: 1, name: groupPlan.name, content: groupPlan.content,
      submittedBySeatId: groupPlan.submittedBySeatId, status: 'candidate', createdAt: Date.now(),
    };
    this.versions.set(version.id, version);
    this.auditVersion('plan.version.create', ctx, version);
    return version;
  }

  revise(ctx: PlanActorContext, parentVersionId: string, name: string, content: string): VersionedPlan {
    const parent = this.getVersion(parentVersionId);
    if (ctx.activityId !== parent.activityId) throw new Error('activityId 不一致');
    if (ctx.groupId && ctx.groupId !== parent.groupId) throw new Error('groupId 不一致');

    this.permissions.assert({
      userId: ctx.userId, seatId: ctx.seatId, activityId: ctx.activityId,
      groupId: parent.groupId, action: 'plan.submit', actorType: ctx.actorType,
      resourceId: parent.logicalPlanId,
    });

    const maxVersion = Math.max(
      ...[...this.versions.values()]
        .filter((v) => v.logicalPlanId === parent.logicalPlanId)
        .map((v) => v.version),
    );
    parent.status = 'superseded';

    const next: VersionedPlan = {
      id: randomUUID(), logicalPlanId: parent.logicalPlanId, activityId: parent.activityId,
      groupId: parent.groupId, version: maxVersion + 1, name, content,
      submittedBySeatId: ctx.seatId, parentVersionId: parent.id,
      status: 'candidate', createdAt: Date.now(),
    };
    this.versions.set(next.id, next);
    this.auditVersion('plan.version.revise', ctx, next);
    return next;
  }

  getVersion(versionId: string): VersionedPlan {
    const version = this.versions.get(versionId);
    if (!version) throw new Error(`方案版本不存在: ${versionId}`);
    return version;
  }

  allVersions(): VersionedPlan[] {
    return [...this.versions.values()].map((v) => ({ ...v }));
  }

  allEvaluations(): EvaluationRun[] {
    return [...this.evaluations.values()].map((r) => ({
      ...r,
      planVersionIds: [...r.planVersionIds],
    }));
  }

  restoreVersion(version: VersionedPlan): void {
    this.versions.set(version.id, { ...version });
  }

  restoreEvaluation(run: EvaluationRun, results: PlanRunResult[] = []): void {
    this.evaluations.set(run.id, {
      ...run,
      planVersionIds: [...run.planVersionIds],
    });
    if (results.length > 0) {
      this.simulation.restoreState(
        results,
        run.recommendedPlanVersionId,
        run.selectedPlanVersionId,
        Boolean(run.confirmedAt),
      );
    }
  }

  clearForRestore(): void {
    this.versions.clear();
    this.evaluations.clear();
    this.simulation.clearRestoredState();
  }

  versionsForLogicalPlan(logicalPlanId: string): VersionedPlan[] {
    return [...this.versions.values()]
      .filter((v) => v.logicalPlanId === logicalPlanId)
      .sort((a, b) => a.version - b.version);
  }

  versionsForActivity(activityId: string): VersionedPlan[] {
    return [...this.versions.values()].filter((v) => v.activityId === activityId);
  }

  async evaluate(
    ctx: PlanActorContext,
    versionIds: string[],
  ): Promise<{ run: EvaluationRun; results: PlanRunResult[] }> {
    if (versionIds.length < 1) throw new Error('至少选择一个方案版本进行仿真');

    this.permissions.assert({
      userId: ctx.userId, seatId: ctx.seatId, activityId: ctx.activityId,
      action: 'simulation.run', actorType: ctx.actorType,
    });

    const versions = versionIds.map((id) => this.getVersion(id));
    for (const v of versions) {
      if (v.activityId !== ctx.activityId) throw new Error(`方案版本 ${v.id} 不属于活动 ${ctx.activityId}`);
    }

    const plans: Plan[] = versions.map((v) => ({
      plan_id: v.id, plan_name: `${v.name} v${v.version}`, plan_content: v.content,
      seatId: v.submittedBySeatId, groupId: v.groupId,
    }));

    const results = await this.simulation.evaluatePlans(plans);
    for (const v of versions) if (v.status !== 'superseded') v.status = 'evaluated';

    const run: EvaluationRun = {
      id: randomUUID(), activityId: ctx.activityId, planVersionIds: versions.map((v) => v.id),
      recommendedPlanVersionId: this.simulation.recommendedPlan()?.plan.plan_id,
      createdAt: Date.now(),
    };
    this.evaluations.set(run.id, run);

    this.audit?.append({
      actorType: ctx.actorType ?? 'human', activityId: ctx.activityId,
      userId: ctx.userId, seatId: ctx.seatId, action: 'simulation.evaluate',
      targetType: 'evaluation_run', targetId: run.id, result: 'success',
      metadata: {
        planVersionIds: [...run.planVersionIds],
        recommendedPlanVersionId: run.recommendedPlanVersionId,
        scores: results.map((r) => ({ planVersionId:r.plan.plan_id, weightedScore:r.weightedScore, rank:r.rank })),
      },
    });

    return { run, results };
  }

  getEvaluation(runId: string): EvaluationRun {
    const run = this.evaluations.get(runId);
    if (!run) throw new Error(`仿真评估轮次不存在: ${runId}`);
    return run;
  }

  confirmSelection(ctx: PlanActorContext, runId: string, versionId: string, reason: string): EvaluationRun {
    const run = this.getEvaluation(runId);
    if (run.activityId !== ctx.activityId) throw new Error('activityId 不一致');
    if (!run.planVersionIds.includes(versionId)) throw new Error(`方案版本 ${versionId} 不属于本轮仿真`);

    this.permissions.assert({
      userId: ctx.userId, seatId: ctx.seatId, activityId: ctx.activityId,
      action: 'plan.approve', actorType: ctx.actorType, resourceId: versionId,
    });

    this.simulation.selectPlan(versionId);
    this.simulation.confirmSelection();

    for (const id of run.planVersionIds) {
      const v = this.getVersion(id);
      if (id === versionId) v.status = 'selected';
      else if (v.status !== 'superseded') v.status = 'evaluated';
    }

    run.selectedPlanVersionId = versionId;
    run.confirmedAt = Date.now();
    run.selectionReason = reason;

    this.audit?.append({
      actorType: ctx.actorType ?? 'human', activityId: ctx.activityId,
      userId: ctx.userId, seatId: ctx.seatId, action: 'plan.selection.confirm',
      targetType: 'plan_version', targetId: versionId, result: 'success', reason,
      metadata: {
        evaluationRunId: run.id,
        recommendedPlanVersionId: run.recommendedPlanVersionId,
        selectedPlanVersionId: versionId,
        followedRecommendation: run.recommendedPlanVersionId === versionId,
      },
    });
    return run;
  }

  dispatchSelected(ctx: PlanActorContext, runId: string): VersionedPlan {
    const run = this.getEvaluation(runId);
    if (!run.selectedPlanVersionId || !run.confirmedAt) throw new Error('尚未完成人工最终方案确认');

    this.permissions.assert({
      userId: ctx.userId, seatId: ctx.seatId, activityId: ctx.activityId,
      action: 'plan.dispatch', actorType: ctx.actorType, resourceId: run.selectedPlanVersionId,
    });

    const dispatched = this.simulation.dispatchSelected();
    if (dispatched.plan.plan_id !== run.selectedPlanVersionId) {
      throw new Error('仿真服务当前选择与评估轮次不一致');
    }

    const version = this.getVersion(run.selectedPlanVersionId);
    version.status = 'dispatched';
    run.dispatchedAt = Date.now();

    this.audit?.append({
      actorType: ctx.actorType ?? 'human', activityId: ctx.activityId,
      userId: ctx.userId, seatId: ctx.seatId, action: 'plan.dispatch',
      targetType: 'plan_version', targetId: version.id, result: 'success',
      metadata: {
        evaluationRunId: run.id, logicalPlanId: version.logicalPlanId,
        version: version.version, groupId: version.groupId,
      },
    });
    return version;
  }

  private auditVersion(action: string, ctx: PlanActorContext, version: VersionedPlan): void {
    this.audit?.append({
      actorType: ctx.actorType ?? 'human', activityId: ctx.activityId,
      userId: ctx.userId, seatId: ctx.seatId, action,
      targetType: 'plan_version', targetId: version.id, result: 'success',
      metadata: {
        logicalPlanId: version.logicalPlanId, groupId: version.groupId,
        version: version.version, parentVersionId: version.parentVersionId,
        contentLength: version.content.length,
      },
    });
  }
}
