import type { GroupPlan } from '../types.js';
import type { PostgresRepositories } from '../persistence/postgresRepositories.js';
import type { PlanRunResult } from '../sim/simulation.js';
import type {
  PlanActorContext,
  PlanLifecycleService,
  VersionedPlan,
  EvaluationRun,
} from './planLifecycle.js';

export class PersistentPlanLifecycleService {
  constructor(
    private readonly lifecycle: PlanLifecycleService,
    private readonly repos: PostgresRepositories,
  ) {}

  async hydrate(activityId?: string): Promise<void> {
    const [versions, evaluations] = await Promise.all([
      this.repos.listPlanVersions(activityId),
      this.repos.listEvaluationRuns(activityId),
    ]);

    this.lifecycle.clearForRestore();
    for (const version of versions) this.lifecycle.restoreVersion(version);
    for (const item of evaluations) this.lifecycle.restoreEvaluation(item.run, item.results);
  }

  async createFromGroupPlan(ctx: PlanActorContext, groupPlan: GroupPlan): Promise<VersionedPlan> {
    const version = this.lifecycle.createFromGroupPlan(ctx, groupPlan);
    try {
      await this.repos.savePlanVersion(version);
      return version;
    } catch (error) {
      await this.hydrate(ctx.activityId);
      throw error;
    }
  }

  async revise(
    ctx: PlanActorContext,
    parentVersionId: string,
    name: string,
    content: string,
  ): Promise<VersionedPlan> {
    const parentBefore = this.lifecycle.getVersion(parentVersionId);
    const next = this.lifecycle.revise(ctx, parentVersionId, name, content);
    try {
      await this.repos.savePlanVersion(parentBefore);
      await this.repos.savePlanVersion(next);
      return next;
    } catch (error) {
      await this.hydrate(ctx.activityId);
      throw error;
    }
  }

  async evaluate(
    ctx: PlanActorContext,
    versionIds: string[],
  ): Promise<{ run: EvaluationRun; results: PlanRunResult[] }> {
    const outcome = await this.lifecycle.evaluate(ctx, versionIds);
    try {
      for (const id of versionIds) await this.repos.savePlanVersion(this.lifecycle.getVersion(id));
      await this.repos.saveEvaluationRun(outcome.run, outcome.results);
      return outcome;
    } catch (error) {
      await this.hydrate(ctx.activityId);
      throw error;
    }
  }

  async confirmSelection(
    ctx: PlanActorContext,
    runId: string,
    versionId: string,
    reason: string,
  ): Promise<EvaluationRun> {
    const run = this.lifecycle.confirmSelection(ctx, runId, versionId, reason);
    try {
      for (const id of run.planVersionIds) await this.repos.savePlanVersion(this.lifecycle.getVersion(id));
      await this.repos.saveEvaluationRun(run);
      return run;
    } catch (error) {
      await this.hydrate(ctx.activityId);
      throw error;
    }
  }

  async dispatchSelected(ctx: PlanActorContext, runId: string): Promise<VersionedPlan> {
    const version = this.lifecycle.dispatchSelected(ctx, runId);
    const run = this.lifecycle.getEvaluation(runId);
    try {
      await this.repos.savePlanVersion(version);
      await this.repos.saveEvaluationRun(run);
      return version;
    } catch (error) {
      await this.hydrate(ctx.activityId);
      throw error;
    }
  }
}
