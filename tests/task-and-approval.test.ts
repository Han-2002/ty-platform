import { describe, it, expect } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { SkillRegistry } from '../src/skills/skillRegistry.js';
import { TaskManager } from '../src/task/taskManager.js';
import { PermissionDenied } from '../src/errors.js';
import { role, seat, seatsConfig, parsedSkill } from './helpers.js';

function makeOrg() {
  return new Organization(
    seatsConfig(
      [
        role({ id: 'director', clearance: 5, can_dispatch: true, can_approve: true, packs: ['core'] }),
        role({ id: 'staff', clearance: 4, can_dispatch: true, can_approve: false, packs: ['core'] }),
        role({ id: 'support', clearance: 2, can_dispatch: false, can_approve: false, packs: ['support'] }),
      ],
      [
        seat({ id: 'd1', role: 'director', parent: null }),
        seat({ id: 's1', role: 'staff', parent: 'd1' }),
        seat({ id: 's2', role: 'staff', parent: 'd1' }),
        seat({ id: 'u1', role: 'support', parent: 's1' }),
      ],
    ),
  );
}

function makeRegistry() {
  return new SkillRegistry(
    [parsedSkill('plan', 3, ['director', 'staff']), parsedSkill('task', 1, ['director', 'staff', 'support'])],
    { skills: [], packs: { core: ['plan', 'task'], support: ['task'] } },
  );
}

const input = {
  activityId: 'act-a',
  title: '拟制方案',
  requiredSkills: ['plan'],
  requiredClearance: 3,
};

describe('task-and-approval', () => {
  it('capable_seats 按技能与密级筛选可用席位', () => {
    const tm = new TaskManager(makeOrg(), makeRegistry());
    const ids = (list: { id: string }[]) => list.map((s) => s.id).sort();
    expect(ids(tm.capableSeats(['plan'], 3))).toEqual(['d1', 's1', 's2']);
    expect(ids(tm.capableSeats(['plan'], 5))).toEqual(['d1']);
    expect(ids(tm.capableSeats(['task'], 1))).toEqual(['d1', 's1', 's2', 'u1']);
  });

  it('auto_dispatch 选中具备能力且负载较低的席位', () => {
    const tm = new TaskManager(makeOrg(), makeRegistry());
    tm.dispatch('d1', { ...input, title: 't1' }, 'd1');
    tm.dispatch('d1', { ...input, title: 't2' }, 's2');
    const task = tm.autoDispatch({ ...input, title: 't3' });
    expect(task.assignedSeatId).toBe('s1'); // 负载最低
  });

  it('无分派权席位分派任务被拒绝且任务未创建', () => {
    const tm = new TaskManager(makeOrg(), makeRegistry());
    expect(() => tm.dispatch('u1', input, 's1')).toThrow(PermissionDenied);
    expect(tm.tasksForActivity('act-a').length).toBe(0);
  });

  it('产出默认挂起待审，人类确认后闭环', () => {
    const tm = new TaskManager(makeOrg(), makeRegistry());
    const task = tm.dispatch('d1', input, 's1');
    const output = tm.submitOutput(task.id, 's1', '方案产出');
    expect(output.status).toBe('waiting_approval');
    tm.approve('d1', output.id);
    expect(tm.getOutput(output.id).status).toBe('completed');
  });

  it('无审批权席位审批被拒，产出保持待审', () => {
    const tm = new TaskManager(makeOrg(), makeRegistry());
    const task = tm.dispatch('d1', input, 's1');
    const output = tm.submitOutput(task.id, 's1', '方案产出');
    expect(() => tm.approve('s2', output.id)).toThrow(PermissionDenied);
    expect(tm.getOutput(output.id).status).toBe('waiting_approval');
  });

  it('审批打回使产出退回，不进入完成', () => {
    const tm = new TaskManager(makeOrg(), makeRegistry());
    const task = tm.dispatch('d1', input, 's1');
    const output = tm.submitOutput(task.id, 's1', '方案产出');
    tm.reject('d1', output.id);
    expect(tm.getOutput(output.id).status).toBe('executing');
  });

  it('人类反馈被记录并可被自进化读取', () => {
    const tm = new TaskManager(makeOrg(), makeRegistry());
    const task = tm.dispatch('d1', input, 's1');
    const output = tm.submitOutput(task.id, 's1', '方案产出');
    tm.recordFeedback(output.id, 'bad', '需改进评估准则');
    expect(tm.getFeedback().length).toBe(1);
    expect(tm.getFeedback()[0]).toMatchObject({ rating: 'bad', seatId: 's1' });
  });

  it('活动作用域隔离（任务按活动分区）', () => {
    const tm = new TaskManager(makeOrg(), makeRegistry());
    tm.autoDispatch({ ...input, activityId: 'act-a' });
    tm.autoDispatch({ ...input, activityId: 'act-b' });
    expect(tm.tasksForActivity('act-a').length).toBe(1);
    expect(tm.tasksForActivity('act-b').length).toBe(1);
  });
});
