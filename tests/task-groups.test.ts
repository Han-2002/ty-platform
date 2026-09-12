import { describe, expect, it } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { SkillRegistry } from '../src/skills/skillRegistry.js';
import { TaskManager } from '../src/task/taskManager.js';
import { TaskGroupManager } from '../src/task/taskGroupManager.js';
import { PermissionDenied } from '../src/errors.js';
import { parsedSkill, role, seat, seatsConfig } from './helpers.js';

function makeOrg() {
  return new Organization(
    seatsConfig(
      [
        role({ id: 'director', clearance: 5, can_dispatch: true, can_approve: true, packs: ['core'] }),
        role({ id: 'leader', clearance: 4, can_dispatch: true, can_approve: false, packs: ['core'] }),
        role({ id: 'staff', clearance: 4, can_dispatch: false, can_approve: false, packs: ['core'] }),
      ],
      [
        seat({ id: 'd1', role: 'director', parent: null }),
        seat({ id: 'l1', role: 'leader', parent: 'd1' }),
        seat({ id: 's1', role: 'staff', parent: 'l1' }),
        seat({ id: 's2', role: 'staff', parent: 'l1' }),
        seat({ id: 's3', role: 'staff', parent: 'd1' }),
        seat({ id: 's4', role: 'staff', parent: 'd1' }),
      ],
    ),
  );
}

function makeRegistry() {
  return new SkillRegistry(
    [parsedSkill('plan', 3, ['director', 'leader', 'staff'])],
    { skills: [], packs: { core: ['plan'] } },
  );
}

function makeManagers() {
  const org = makeOrg();
  const tm = new TaskManager(org, makeRegistry());
  const gm = new TaskGroupManager(org, tm);
  return { org, tm, gm };
}

const taskInput = {
  activityId: 'act-a',
  title: '拟制局部方案',
  requiredSkills: ['plan'],
  requiredClearance: 3,
};

describe('task-groups', () => {
  it('同一活动可同时创建层级组和平级组', () => {
    const { gm } = makeManagers();

    const hierarchical = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'A组',
      mode: 'hierarchical',
      memberSeatIds: ['l1', 's1', 's2'],
      leaderSeatId: 'l1',
    });

    const peer = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'B组',
      mode: 'peer',
      memberSeatIds: ['s3', 's4'],
      peerDecisionMode: 'score',
    });

    expect(hierarchical.mode).toBe('hierarchical');
    expect(peer.mode).toBe('peer');
    expect(gm.groupsForActivity('act-a')).toHaveLength(2);
  });

  it('层级组只有 leader 能分派本组子任务', () => {
    const { gm, tm } = makeManagers();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'A组',
      mode: 'hierarchical',
      memberSeatIds: ['l1', 's1', 's2'],
      leaderSeatId: 'l1',
    });

    expect(() => gm.dispatchHierarchicalTask(group.id, 's1', taskInput, 's2')).toThrow(PermissionDenied);

    const task = gm.dispatchHierarchicalTask(group.id, 'l1', taskInput, 's2');
    expect(task.groupId).toBe(group.id);
    expect(task.assignedSeatId).toBe('s2');
    expect(tm.tasksForGroup(group.id)).toHaveLength(1);
  });

  it('平级组可把协商分工结果落成真实 Task', () => {
    const { gm } = makeManagers();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'B组',
      mode: 'peer',
      memberSeatIds: ['s3', 's4'],
      peerDecisionMode: 'negotiation',
    });

    const task = gm.recordPeerAssignment(group.id, 's3', taskInput, 's4');
    expect(task.groupId).toBe(group.id);
    expect(task.assignedSeatId).toBe('s4');
  });

  it('平级组没有群体决策记录时不能提交最终方案', () => {
    const { gm } = makeManagers();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'B组',
      mode: 'peer',
      memberSeatIds: ['s3', 's4'],
      peerDecisionMode: 'vote',
    });

    expect(() => gm.submitGroupPlan(group.id, 's3', '方案B', '内容')).toThrow(
      '平级组提交方案前必须先形成群体决策记录',
    );

    gm.confirmPeerDecision(group.id, 's3', '2票同意方案B', ['s3', 's4']);
    const plan = gm.submitGroupPlan(group.id, 's3', '方案B', '内容');

    expect(plan.groupId).toBe(group.id);
    expect(plan.status).toBe('submitted');
  });

  it('层级组只能由 leader 汇总提交方案，并由有审批权席位最终批准', () => {
    const { gm } = makeManagers();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'A组',
      mode: 'hierarchical',
      memberSeatIds: ['l1', 's1', 's2'],
      leaderSeatId: 'l1',
    });

    expect(() => gm.submitGroupPlan(group.id, 's1', '方案A', '内容')).toThrow(PermissionDenied);

    const plan = gm.submitGroupPlan(group.id, 'l1', '方案A', '内容');
    expect(() => gm.approvePlan('s1', plan.id)).toThrow(PermissionDenied);

    gm.approvePlan('d1', plan.id);
    expect(gm.getPlan(plan.id).status).toBe('approved');
    expect(gm.getGroup(group.id).status).toBe('completed');
  });
});
