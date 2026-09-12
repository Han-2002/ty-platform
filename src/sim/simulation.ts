import type { Plan, SimulationResult, SimulatorConfig } from '../types.js';
import { McpClient } from './mcpClient.js';

export interface SimRunOutcome {
  simulatorId: string;
  connected: boolean;
  result?: SimulationResult;
  error?: string;
}

export interface PlanRunResult {
  plan: Plan;
  outcomes: SimRunOutcome[];
  weightedScore: number;
  rank?: number;
}

export function weightedAggregate(
  outcomes: SimRunOutcome[],
  configs: SimulatorConfig[],
): { score: number; count: number } {
  const weightById = new Map(configs.map((c) => [c.id, c.weight]));
  let num = 0;
  let den = 0;
  let count = 0;
  for (const o of outcomes) {
    if (o.connected && o.result) {
      const w = weightById.get(o.simulatorId) ?? 0;
      num += o.result.score * w;
      den += w;
      count += 1;
    }
  }
  if (den === 0) return { score: 0, count: 0 };
  return { score: num / den, count };
}

export interface PlanGenerator {
  seatId: string;
  seatName: string;
  generate: (topic: string) => Promise<string>;
}

export async function generatePlansConcurrently(
  generators: PlanGenerator[],
  topic: string,
): Promise<Plan[]> {
  return Promise.all(
    generators.map(async (g, i) => {
      const content = await g.generate(topic);
      return {
        plan_id: `plan-${i + 1}`,
        plan_name: `${g.seatName}-方案`,
        plan_content: content,
        seatId: g.seatId,
      };
    }),
  );
}

export class SimulationRunner {
  constructor(
    readonly configs: SimulatorConfig[],
    private readonly timeoutMs = 5000,
  ) {}

  async runPlan(plan: Plan): Promise<SimRunOutcome[]> {
    return Promise.all(this.configs.map((cfg) => this.runOne(cfg, plan)));
  }

  private async runOne(cfg: SimulatorConfig, plan: Plan): Promise<SimRunOutcome> {
    const client = new McpClient({ command: cfg.command, args: cfg.args, timeoutMs: this.timeoutMs });
    try {
      await client.connect();
      const raw = (await client.callTool(cfg.tool, {
        plan_id: plan.plan_id,
        plan_name: plan.plan_name,
        plan_content: plan.plan_content,
      })) as Partial<SimulationResult>;
      const result: SimulationResult = {
        plan_id: plan.plan_id,
        simulatorId: cfg.id,
        score: typeof raw.score === 'number' ? raw.score : 0,
        metrics: raw.metrics ?? {},
        narrative: raw.narrative ?? '',
        success: raw.success !== false,
      };
      return { simulatorId: cfg.id, connected: true, result };
    } catch (e) {
      return { simulatorId: cfg.id, connected: false, error: (e as Error).message };
    } finally {
      client.dispose();
    }
  }
}

export class SimulationService {
  private results: PlanRunResult[] = [];
  private selectedPlanId?: string;
  private recommendedPlanId?: string;
  private confirmed = false;

  constructor(private readonly runner: SimulationRunner) {}

  async evaluatePlans(plans: Plan[]): Promise<PlanRunResult[]> {
    const results: PlanRunResult[] = await Promise.all(
      plans.map(async (plan): Promise<PlanRunResult> => {
        const outcomes = await this.runner.runPlan(plan);
        const { score } = weightedAggregate(outcomes, this.runner.configs);
        return { plan, outcomes, weightedScore: score };
      }),
    );
    results.sort((a, b) => b.weightedScore - a.weightedScore);
    results.forEach((r, i) => {
      r.rank = i + 1;
    });
    this.results = results;

    // 系统推荐第一名。为了兼容旧接口，默认 selectedPlan 仍指向推荐项；
    // 但人工可以在确认前通过 selectPlan() 改选任意候选方案。
    this.recommendedPlanId = results[0]?.plan.plan_id;
    this.selectedPlanId = this.recommendedPlanId;
    this.confirmed = false;
    return results;
  }

  get rankedResults(): PlanRunResult[] {
    return this.results;
  }

  recommendedPlan(): PlanRunResult | undefined {
    return this.results.find((r) => r.plan.plan_id === this.recommendedPlanId);
  }

  selectedPlan(): PlanRunResult | undefined {
    return this.results.find((r) => r.plan.plan_id === this.selectedPlanId);
  }

  // 人工可不接受系统第一名，明确改选另一套候选方案。
  selectPlan(planId: string): PlanRunResult {
    const found = this.results.find((r) => r.plan.plan_id === planId);
    if (!found) throw new Error(`候选方案不存在于本轮仿真结果: ${planId}`);
    this.selectedPlanId = planId;
    this.confirmed = false;
    return found;
  }

  get isConfirmed(): boolean {
    return this.confirmed;
  }

  confirmSelection(): void {
    if (!this.selectedPlanId) throw new Error('尚无择优方案可确认');
    this.confirmed = true;
  }

  dispatchSelected(): { plan: Plan } {
    if (!this.selectedPlanId || !this.confirmed) {
      throw new Error('择优方案尚未经人工确认，禁止下发执行');
    }
    return { plan: this.selectedPlan()!.plan };
  }

  report(): string {
    const lines: string[] = ['方案推演对比报告'];
    for (const r of this.results) {
      const perSim = r.outcomes
        .map((o) => {
          const cfg = this.runner.configs.find((c) => c.id === o.simulatorId);
          const weight = cfg ? `(权重${cfg.weight})` : '';
          return o.connected ? `${o.simulatorId}${weight}=${o.result!.score}` : `${o.simulatorId}=未连接`;
        })
        .join(', ');
      lines.push(
        `[第${r.rank}名] ${r.plan.plan_name} 加权得分=${r.weightedScore.toFixed(2)}（${perSim}）`,
      );
    }
    return lines.join('\n');
  }
}
