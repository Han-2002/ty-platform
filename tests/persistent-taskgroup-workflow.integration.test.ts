import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { SkillRegistry } from '../src/skills/skillRegistry.js';
import { TaskManager } from '../src/task/taskManager.js';
import { TaskGroupManager } from '../src/task/taskGroupManager.js';
import { PersistentTaskGroupService } from '../src/task/persistentTaskGroupService.js';
import { WorkflowManager } from '../src/workflow/workflowManager.js';
import { PersistentWorkflowService } from '../src/workflow/persistentWorkflowService.js';
import { PostgresDatabase } from '../src/persistence/postgres.js';
import { PostgresRepositories } from '../src/persistence/postgresRepositories.js';
import { parsedSkill, role, seat } from './helpers.js';
import type { SeatsConfig } from '../src/types.js';

const databaseUrl = process.env.DATABASE_URL;
const test = databaseUrl ? it : it.skip;
const ACTIVITY = 'act-persist-wf';

function makeOrg() {
  const cfg: SeatsConfig = {
    roles: [
      role({ id: 'director', clearance: 5, can_dispatch: true, can_approve: true, packs: ['core'] }),
      role({ id: 'leader', clearance: 4, can_dispatch: true, can_approve: false, packs: ['core'] }),
      role({ id: 'staff', clearance: 3, can_dispatch: false, can_approve: false, packs: ['core'] }),
    ],
    seats: [
      seat({ id: 'd1', role: 'director', parent: null }),
      seat({ id: 'l1', role: 'leader', parent: 'd1' }),
      seat({ id: 's1', role: 'staff', parent: 'l1' }),
    ],
    activities: [{ id: ACTIVITY, name: '持久化流程测试活动' }],
  };
  return new Organization(cfg);
}

function makeManagers() {
  const org = makeOrg();
  const registry = new SkillRegistry(
    [parsedSkill('plan', 1, ['director','leader','staff'])],
    { skills: [], packs: { core: ['plan'] } },
  );
  const tm = new TaskManager(org, registry);
  const gm = new TaskGroupManager(org, tm);
  const wm = new WorkflowManager(org, gm);
  return { org, tm, gm, wm };
}

async function cleanup(): Promise<void> {
  if (!databaseUrl) return;
  const db = new PostgresDatabase({ connectionString: databaseUrl });
  try {
    await db.pool.query(`
      DELETE FROM workflow_change_proposals
      WHERE workflow_id IN (SELECT id FROM workflow_instances WHERE activity_id=$1)
    `, [ACTIVITY]);
    await db.pool.query(`DELETE FROM workflow_steps WHERE workflow_id IN (SELECT id FROM workflow_instances WHERE activity_id=$1)`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM workflow_instances WHERE activity_id=$1`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM tasks WHERE activity_id=$1`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM task_group_members WHERE group_id IN (SELECT id FROM task_groups WHERE activity_id=$1)`, [ACTIVITY]);
    await db.pool.query(`DELETE FROM task_groups WHERE activity_id=$1`, [ACTIVITY]);
  } finally {
    await db.close();
  }
}

describe('persistent-taskgroup-workflow-v2', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  test('TaskGroup 写入 PostgreSQL 后，重建 Manager 可恢复成员与组模式', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      const repos = new PostgresRepositories(db.pool);

      const m1 = makeManagers();
      const gs1 = new PersistentTaskGroupService(m1.gm, repos);
      const group = await gs1.createGroup('d1', {
        activityId: ACTIVITY,
        name: '持久化A组',
        mode: 'hierarchical',
        memberSeatIds: ['l1','s1'],
        leaderSeatId: 'l1',
      });

      const m2 = makeManagers();
      const gs2 = new PersistentTaskGroupService(m2.gm, repos);
      await gs2.hydrate(ACTIVITY);

      const restored = m2.gm.getGroup(group.id);
      expect(restored.mode).toBe('hierarchical');
      expect(restored.leaderSeatId).toBe('l1');
      expect(restored.memberSeatIds).toEqual(expect.arrayContaining(['l1','s1']));
    } finally {
      await db.close();
    }
  });

  test('Workflow 推进一步并落库后，重启恢复仍保留当前步骤', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      const repos = new PostgresRepositories(db.pool);

      const m1 = makeManagers();
      const gs1 = new PersistentTaskGroupService(m1.gm, repos);
      const ws1 = new PersistentWorkflowService(m1.wm, repos);

      const group = await gs1.createGroup('d1', {
        activityId: ACTIVITY,
        name: '持久化流程组',
        mode: 'hierarchical',
        memberSeatIds: ['l1','s1'],
        leaderSeatId: 'l1',
      });
      const wf = await ws1.createForGroup(group.id);
      await ws1.completeCurrentStep(wf.id, 'l1');

      expect(m1.wm.currentStep(wf.id)?.key).toBe('leader_decompose');

      const m2 = makeManagers();
      const gs2 = new PersistentTaskGroupService(m2.gm, repos);
      const ws2 = new PersistentWorkflowService(m2.wm, repos);

      await gs2.hydrate(ACTIVITY);
      await ws2.hydrate(ACTIVITY);

      expect(m2.wm.currentStep(wf.id)?.key).toBe('leader_decompose');
      expect(m2.wm.getWorkflow(wf.id).steps[0].status).toBe('completed');
    } finally {
      await db.close();
    }
  });

  test('Workflow 动态变更申请与审批结果可跨重启恢复', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      const repos = new PostgresRepositories(db.pool);

      const m1 = makeManagers();
      const gs1 = new PersistentTaskGroupService(m1.gm, repos);
      const ws1 = new PersistentWorkflowService(m1.wm, repos);

      const group = await gs1.createGroup('d1', {
        activityId: ACTIVITY,
        name: '动态流程组',
        mode: 'hierarchical',
        memberSeatIds: ['l1','s1'],
        leaderSeatId: 'l1',
      });
      const wf = await ws1.createForGroup(group.id);

      const proposal = await ws1.proposeChange(
        wf.id,
        's1',
        { type: 'insert_step', afterStepKey: 'member_execute', name: '额外风险复核' },
        '需要增加风险检查',
      );
      await ws1.approveChange('d1', proposal.id);

      const m2 = makeManagers();
      const gs2 = new PersistentTaskGroupService(m2.gm, repos);
      const ws2 = new PersistentWorkflowService(m2.wm, repos);
      await gs2.hydrate(ACTIVITY);
      await ws2.hydrate(ACTIVITY);

      const restoredProposal = m2.wm.getProposal(proposal.id);
      expect(restoredProposal.status).toBe('approved');
      expect(m2.wm.getWorkflow(wf.id).steps.some((s) => s.name === '额外风险复核')).toBe(true);
    } finally {
      await db.close();
    }
  });
});
