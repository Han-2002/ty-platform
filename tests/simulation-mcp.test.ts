import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SimulationRunner,
  SimulationService,
  weightedAggregate,
  generatePlansConcurrently,
} from '../src/sim/simulation.js';
import type { Plan, SimulatorConfig } from '../src/types.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const sim = (n: string) => join(here, '..', 'simulators', n);

const configs: SimulatorConfig[] = [
  { id: 'sim-red', name: '红方', command: process.execPath, args: [sim('sim-red.mjs')], tool: 'run_simulation', weight: 0.7 },
  { id: 'sim-blue', name: '蓝方', command: process.execPath, args: [sim('sim-blue.mjs')], tool: 'run_simulation', weight: 0.3 },
];

const plan: Plan = { plan_id: 'p1', plan_name: '方案一', plan_content: '拟制方案内容A', seatId: 's1' };

describe('simulation-mcp', () => {
  it('多套方案并发生成总耗时接近最慢单席', async () => {
    const gens = [100, 200, 300, 400].map((ms, i) => ({
      seatId: `s${i}`,
      seatName: `席${i}`,
      generate: () => new Promise<string>((r) => setTimeout(() => r(`方案${i}`), ms)),
    }));
    const start = Date.now();
    const plans = await generatePlansConcurrently(gens, 'topic');
    const elapsed = Date.now() - start;
    expect(plans.length).toBe(4);
    // 并发总耗时接近最慢单席(400ms)，显著小于串行之和(1000ms)
    expect(elapsed).toBeLessThan(700);
  });

  it('多仿真结果按权重加权汇总（0.7×80 + 0.3×60 = 74）', () => {
    const outcomes = [
      { simulatorId: 'sim-red', connected: true, result: { plan_id: 'p1', simulatorId: 'sim-red', score: 80, metrics: {}, narrative: '', success: true } },
      { simulatorId: 'sim-blue', connected: true, result: { plan_id: 'p1', simulatorId: 'sim-blue', score: 60, metrics: {}, narrative: '', success: true } },
    ];
    expect(weightedAggregate(outcomes, configs).score).toBe(74);
  });

  it('经 MCP 配置化接入并解析统一契约', async () => {
    const runner = new SimulationRunner(configs);
    const outcomes = await runner.runPlan(plan);
    expect(outcomes.length).toBe(2);
    for (const o of outcomes) {
      expect(o.connected).toBe(true);
      expect(typeof o.result!.score).toBe('number');
      expect(o.result!.metrics).toBeTypeOf('object');
      expect(typeof o.result!.narrative).toBe('string');
      expect(o.result!.success).toBe(true);
    }
  });

  it('单个仿真系统连接失败不中断整体', async () => {
    const bad: SimulatorConfig = { id: 'bad', name: '坏引擎', command: 'nonexistent-cmd-xyz', args: [], tool: 'run_simulation', weight: 0.5 };
    const runner = new SimulationRunner([...configs, bad]);
    const outcomes = await runner.runPlan(plan);
    expect(outcomes.find((o) => o.simulatorId === 'bad')!.connected).toBe(false);
    const good = outcomes.filter((o) => o.simulatorId !== 'bad');
    expect(good.length).toBe(2);
    expect(good.every((o) => o.connected)).toBe(true);
  });

  it('择优方案需人工确认后才下发，并输出对比报告', async () => {
    const svc = new SimulationService(new SimulationRunner(configs));
    const results = await svc.evaluatePlans([plan, { ...plan, plan_id: 'p2', plan_name: '方案二', plan_content: '拟制方案内容B' }]);
    expect(results.length).toBe(2);
    expect(results[0].rank).toBe(1);
    expect(svc.selectedPlan()).toBeDefined();

    // 未确认不下发
    expect(() => svc.dispatchSelected()).toThrow(/确认/);

    // 确认后下发
    svc.confirmSelection();
    expect(svc.isConfirmed).toBe(true);
    expect(svc.dispatchSelected().plan.plan_id).toBe(results[0].plan.plan_id);

    const report = svc.report();
    expect(report).toContain('方案推演对比报告');
    expect(report).toContain('加权得分');
    expect(report).toContain('第1名');
  });
});
