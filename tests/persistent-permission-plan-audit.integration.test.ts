import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Organization } from '../src/org/organization.js';
import { UserSeatManager } from '../src/identity/userSeatManager.js';
import { PersistentIdentityService } from '../src/identity/persistentIdentityService.js';
import { PermissionEngine } from '../src/permission/permissionEngine.js';
import { PersistentPermissionService } from '../src/permission/persistentPermissionService.js';
import { AuditTrail } from '../src/audit/auditTrail.js';
import { PersistentAuditService } from '../src/audit/persistentAuditService.js';
import { PlanLifecycleService } from '../src/plan/planLifecycle.js';
import { PersistentPlanLifecycleService } from '../src/plan/persistentPlanLifecycleService.js';
import { SimulationRunner, SimulationService } from '../src/sim/simulation.js';
import { PostgresDatabase } from '../src/persistence/postgres.js';
import { PostgresRepositories } from '../src/persistence/postgresRepositories.js';
import { role, seat } from './helpers.js';
import type { GroupPlan, SeatsConfig, SimulatorConfig } from '../src/types.js';

const databaseUrl = process.env.DATABASE_URL;
const test = databaseUrl ? it : it.skip;
const ACTIVITY = 'act-persist-v3';
const here = fileURLToPath(new URL('.', import.meta.url));
const sim = (n: string) => join(here, '..', 'simulators', n);

const configs: SimulatorConfig[] = [
  { id:'sim-red', name:'红方', command:process.execPath, args:[sim('sim-red.mjs')], tool:'run_simulation', weight:0.7 },
  { id:'sim-blue', name:'蓝方', command:process.execPath, args:[sim('sim-blue.mjs')], tool:'run_simulation', weight:0.3 },
];

function makeOrg() {
  const cfg: SeatsConfig = {
    roles: [
      role({ id:'director', clearance:5, can_dispatch:true, can_approve:true, packs:[] }),
      role({ id:'staff', clearance:3, can_dispatch:false, can_approve:false, packs:[] }),
    ],
    seats: [
      seat({ id:'d1', role:'director', parent:null }),
      seat({ id:'s1', role:'staff', parent:'d1' }),
      seat({ id:'s2', role:'staff', parent:'d1' }),
    ],
    activities: [{ id:ACTIVITY, name:'持久化V3活动' }],
  };
  return new Organization(cfg);
}

async function bootstrapIdentity(repos: PostgresRepositories) {
  const manager = new UserSeatManager(makeOrg());
  const service = new PersistentIdentityService(manager, repos);
  await service.createUser('persist-v3-director', '导演');
  await service.createUser('persist-v3-u1', '参谋甲');
  await service.createUser('persist-v3-u2', '参谋乙');
  await service.assign('d1','persist-v3-director','d1',ACTIVITY);
  await service.assign('d1','persist-v3-u1','s1',ACTIVITY);
  await service.assign('d1','persist-v3-u2','s2',ACTIVITY);
  return { manager, service };
}

async function cleanupCore(): Promise<void> {
  if (!databaseUrl) return;
  const db = new PostgresDatabase({ connectionString: databaseUrl });
  try {
    await db.pool.query(`DELETE FROM evaluation_run_plans WHERE evaluation_run_id IN (SELECT id FROM evaluation_runs WHERE activity_id=$1)`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM evaluation_runs WHERE activity_id=$1`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM plan_versions WHERE activity_id=$1`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM temporary_grants WHERE activity_id=$1`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM seat_assignments WHERE activity_id=$1`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM users WHERE id LIKE 'persist-v3-%'`);
  } finally {
    await db.close();
  }
}

describe('persistent-permission-plan-audit-v3', () => {
  beforeEach(cleanupCore);
  afterEach(cleanupCore);

  test('临时授权签发后重启仍有效，撤销后重启仍保持失效', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      const repos = new PostgresRepositories(db.pool);
      const { manager } = await bootstrapIdentity(repos);

      const audit1 = new AuditTrail();
      const pe1 = new PermissionEngine(makeOrg(), manager, audit1);
      const ps1 = new PersistentPermissionService(pe1, repos);

      const grant = await ps1.issueTemporaryGrant('d1', {
        userId:'persist-v3-u1', seatId:'s1', activityId:ACTIVITY,
        action:'message.cross_group', targetGroupId:'group-b',
        expiresAt:Date.now()+60_000, reason:'持久化临时协同',
      });

      const manager2 = new UserSeatManager(makeOrg());
      const ids2 = new PersistentIdentityService(manager2, repos);
      await ids2.hydrate();
      const pe2 = new PermissionEngine(makeOrg(), manager2);
      const ps2 = new PersistentPermissionService(pe2, repos);
      await ps2.hydrate(ACTIVITY);

      expect(pe2.check({
        userId:'persist-v3-u1', seatId:'s1', activityId:ACTIVITY,
        action:'message.cross_group', targetGroupId:'group-b',
      }).allowed).toBe(true);

      await ps2.revokeTemporaryGrant('d1', grant.id);

      const manager3 = new UserSeatManager(makeOrg());
      const ids3 = new PersistentIdentityService(manager3, repos);
      await ids3.hydrate();
      const pe3 = new PermissionEngine(makeOrg(), manager3);
      const ps3 = new PersistentPermissionService(pe3, repos);
      await ps3.hydrate(ACTIVITY);

      expect(pe3.check({
        userId:'persist-v3-u1', seatId:'s1', activityId:ACTIVITY,
        action:'message.cross_group', targetGroupId:'group-b',
      }).allowed).toBe(false);
    } finally {
      await db.close();
    }
  });

  test('方案版本、仿真轮次和人工选择可跨重启恢复并继续下发', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      const repos = new PostgresRepositories(db.pool);
      const { manager } = await bootstrapIdentity(repos);
      const pe = new PermissionEngine(makeOrg(), manager);
      const simService1 = new SimulationService(new SimulationRunner(configs));
      const lifecycle1 = new PlanLifecycleService(simService1, pe);
      const persistent1 = new PersistentPlanLifecycleService(lifecycle1, repos);

      const planA: GroupPlan = {
        id:'persist-v3-plan-a', activityId:ACTIVITY, groupId:'group-a',
        name:'A组方案', content:'A内容', submittedBySeatId:'s1',
        status:'submitted', createdAt:Date.now(),
      };
      const planB: GroupPlan = {
        id:'persist-v3-plan-b', activityId:ACTIVITY, groupId:'group-b',
        name:'B组方案', content:'B内容', submittedBySeatId:'s2',
        status:'submitted', createdAt:Date.now(),
      };

      const a = await persistent1.createFromGroupPlan(
        { userId:'persist-v3-u1', seatId:'s1', activityId:ACTIVITY, groupId:'group-a' }, planA,
      );
      const b = await persistent1.createFromGroupPlan(
        { userId:'persist-v3-u2', seatId:'s2', activityId:ACTIVITY, groupId:'group-b' }, planB,
      );
      const { run, results } = await persistent1.evaluate(
        { userId:'persist-v3-director', seatId:'d1', activityId:ACTIVITY },
        [a.id,b.id],
      );
      const chosen = results[0].plan.plan_id;
      await persistent1.confirmSelection(
        { userId:'persist-v3-director', seatId:'d1', activityId:ACTIVITY },
        run.id, chosen, '重启前已完成人工确认',
      );

      // 模拟整个方案/仿真业务服务重启。
      const manager2 = new UserSeatManager(makeOrg());
      const ids2 = new PersistentIdentityService(manager2, repos);
      await ids2.hydrate();
      const pe2 = new PermissionEngine(makeOrg(), manager2);
      const simService2 = new SimulationService(new SimulationRunner(configs));
      const lifecycle2 = new PlanLifecycleService(simService2, pe2);
      const persistent2 = new PersistentPlanLifecycleService(lifecycle2, repos);
      await persistent2.hydrate(ACTIVITY);

      expect(lifecycle2.getEvaluation(run.id).selectedPlanVersionId).toBe(chosen);
      expect(lifecycle2.getEvaluation(run.id).confirmedAt).toBeDefined();

      const dispatched = await persistent2.dispatchSelected(
        { userId:'persist-v3-director', seatId:'d1', activityId:ACTIVITY },
        run.id,
      );
      expect(dispatched.id).toBe(chosen);
      expect(dispatched.status).toBe('dispatched');
    } finally {
      await db.close();
    }
  });

  test('AuditTrail flush 到 PostgreSQL 后，新进程可恢复完整 hash 链并继续追加', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      const repos = new PostgresRepositories(db.pool);

      // 不删除既有 audit_records，先恢复全局链，保证 sequence/hash 连续。
      const audit1 = new AuditTrail();
      const aps1 = new PersistentAuditService(audit1, repos);
      await aps1.hydrate();

      const before = audit1.count();
      audit1.append({
        actorType:'system', activityId:ACTIVITY, action:'persist-v3.audit.test',
        targetType:'test', targetId:`${Date.now()}`, result:'success',
      });
      const flushed = await aps1.flush();
      expect(flushed).toBe(1);

      const audit2 = new AuditTrail();
      const aps2 = new PersistentAuditService(audit2, repos);
      await aps2.hydrate();

      expect(audit2.count()).toBe(before + 1);
      expect(audit2.verifyIntegrity()).toBe(true);

      audit2.append({
        actorType:'system', activityId:ACTIVITY, action:'persist-v3.audit.after-restart',
        result:'info',
      });
      await aps2.flush();
      expect(audit2.verifyIntegrity()).toBe(true);
    } finally {
      await db.close();
    }
  });
});
