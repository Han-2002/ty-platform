import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Organization } from '../src/org/organization.js';
import { UserSeatManager } from '../src/identity/userSeatManager.js';
import { PermissionEngine } from '../src/permission/permissionEngine.js';
import { AuditTrail } from '../src/audit/auditTrail.js';
import { SimulationRunner, SimulationService } from '../src/sim/simulation.js';
import { PlanLifecycleService } from '../src/plan/planLifecycle.js';
import { role, seat } from './helpers.js';
import type { GroupPlan, SeatsConfig, SimulatorConfig } from '../src/types.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const sim = (n: string) => join(here, '..', 'simulators', n);

const configs: SimulatorConfig[] = [
  { id: 'sim-red', name: '红方', command: process.execPath, args: [sim('sim-red.mjs')], tool: 'run_simulation', weight: 0.7 },
  { id: 'sim-blue', name: '蓝方', command: process.execPath, args: [sim('sim-blue.mjs')], tool: 'run_simulation', weight: 0.3 },
];

function setup() {
  const cfg: SeatsConfig = {
    roles: [
      role({ id: 'director', clearance: 5, can_dispatch: true, can_approve: true, packs: [] }),
      role({ id: 'staff', clearance: 4, can_dispatch: false, can_approve: false, packs: [] }),
    ],
    seats: [
      seat({ id: 'd1', role: 'director', parent: null }),
      seat({ id: 's1', role: 'staff', parent: 'd1' }),
      seat({ id: 's2', role: 'staff', parent: 'd1' }),
    ],
    activities: [{ id: 'act-a', name: '洪兰对抗' }],
  };
  const org = new Organization(cfg);
  const users = new UserSeatManager(org);
  users.createUser('ud', '总导演');
  users.createUser('u1', 'A组参谋');
  users.createUser('u2', 'B组参谋');
  users.assign('d1', 'ud', 'd1', 'act-a');
  users.assign('d1', 'u1', 's1', 'act-a');
  users.assign('d1', 'u2', 's2', 'act-a');

  const audit = new AuditTrail();
  const pe = new PermissionEngine(org, users, audit);
  const simService = new SimulationService(new SimulationRunner(configs));
  const lifecycle = new PlanLifecycleService(simService, pe, audit);

  const planA: GroupPlan = {
    id: 'group-plan-a',
    activityId: 'act-a',
    groupId: 'group-a',
    name: 'A组方案',
    content: '方案A内容',
    submittedBySeatId: 's1',
    status: 'submitted',
    createdAt: Date.now(),
  };
  const planB: GroupPlan = {
    id: 'group-plan-b',
    activityId: 'act-a',
    groupId: 'group-b',
    name: 'B组方案',
    content: '方案B内容',
    submittedBySeatId: 's2',
    status: 'submitted',
    createdAt: Date.now(),
  };

  return { audit, lifecycle, simService, planA, planB };
}

describe('plan-simulation-lifecycle-v1', () => {
  it('GroupPlan 转为可追踪版本，修订形成 v2 且保留父版本', () => {
    const { lifecycle, planA } = setup();

    const v1 = lifecycle.createFromGroupPlan(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: 'group-a' },
      planA,
    );
    const v2 = lifecycle.revise(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: 'group-a' },
      v1.id,
      'A组方案修订',
      '方案A内容-第二版',
    );

    expect(v1.version).toBe(1);
    expect(v1.status).toBe('superseded');
    expect(v2.version).toBe(2);
    expect(v2.parentVersionId).toBe(v1.id);
    expect(lifecycle.versionsForLogicalPlan(planA.id)).toHaveLength(2);
  });

  it('多方案版本进入真实多仿真系统并记录推荐方案', async () => {
    const { lifecycle, planA, planB } = setup();

    const a = lifecycle.createFromGroupPlan(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: 'group-a' },
      planA,
    );
    const b = lifecycle.createFromGroupPlan(
      { userId: 'u2', seatId: 's2', activityId: 'act-a', groupId: 'group-b' },
      planB,
    );

    const { run, results } = await lifecycle.evaluate(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      [a.id, b.id],
    );

    expect(results).toHaveLength(2);
    expect(results[0].rank).toBe(1);
    expect(run.recommendedPlanVersionId).toBe(results[0].plan.plan_id);
    expect(run.planVersionIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('普通席位不能进行最终方案确认', async () => {
    const { lifecycle, planA } = setup();
    const a = lifecycle.createFromGroupPlan(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: 'group-a' },
      planA,
    );
    const { run } = await lifecycle.evaluate(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      [a.id],
    );

    expect(() =>
      lifecycle.confirmSelection(
        { userId: 'u1', seatId: 's1', activityId: 'act-a' },
        run.id,
        a.id,
        '普通席位尝试确认',
      ),
    ).toThrow();
  });

  it('人工可以不接受系统推荐，明确选择另一套方案', async () => {
    const { lifecycle, planA, planB } = setup();

    const a = lifecycle.createFromGroupPlan(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: 'group-a' },
      planA,
    );
    const b = lifecycle.createFromGroupPlan(
      { userId: 'u2', seatId: 's2', activityId: 'act-a', groupId: 'group-b' },
      planB,
    );
    const { run, results } = await lifecycle.evaluate(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      [a.id, b.id],
    );

    const recommended = results[0].plan.plan_id;
    const alternate = results.find((r) => r.plan.plan_id !== recommended)!.plan.plan_id;

    lifecycle.confirmSelection(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      run.id,
      alternate,
      '虽然综合分略低，但人工判断其风险更可控',
    );

    expect(lifecycle.getEvaluation(run.id).selectedPlanVersionId).toBe(alternate);
    expect(lifecycle.getEvaluation(run.id).selectionReason).toContain('风险更可控');
  });

  it('未经人工确认不能下发；确认后由有权限席位下发', async () => {
    const { lifecycle, planA } = setup();
    const a = lifecycle.createFromGroupPlan(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: 'group-a' },
      planA,
    );
    const { run } = await lifecycle.evaluate(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      [a.id],
    );

    expect(() =>
      lifecycle.dispatchSelected(
        { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
        run.id,
      ),
    ).toThrow('尚未完成人工最终方案确认');

    lifecycle.confirmSelection(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      run.id,
      a.id,
      '确认方案',
    );
    const dispatched = lifecycle.dispatchSelected(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      run.id,
    );

    expect(dispatched.status).toBe('dispatched');
    expect(lifecycle.getEvaluation(run.id).dispatchedAt).toBeDefined();
  });

  it('版本、仿真、人工选择、下发均进入审计且不复制方案正文', async () => {
    const { lifecycle, audit, planA, planB } = setup();
    const a = lifecycle.createFromGroupPlan(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: 'group-a', actorType: 'agent' },
      planA,
    );
    const b = lifecycle.createFromGroupPlan(
      { userId: 'u2', seatId: 's2', activityId: 'act-a', groupId: 'group-b', actorType: 'agent' },
      planB,
    );

    const { run } = await lifecycle.evaluate(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      [a.id, b.id],
    );
    lifecycle.confirmSelection(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      run.id,
      a.id,
      '人工确认',
    );
    lifecycle.dispatchSelected(
      { userId: 'ud', seatId: 'd1', activityId: 'act-a' },
      run.id,
    );

    expect(audit.query({ action: 'plan.version.create' }).length).toBe(2);
    expect(audit.query({ action: 'simulation.evaluate' })).toHaveLength(1);
    expect(audit.query({ action: 'plan.selection.confirm' })).toHaveLength(1);
    expect(audit.query({ action: 'plan.dispatch' })).toHaveLength(1);
    expect(JSON.stringify(audit.all())).not.toContain('方案A内容');
    expect(audit.verifyIntegrity()).toBe(true);
  });
});
