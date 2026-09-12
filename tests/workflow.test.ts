import { describe, expect, it } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { SkillRegistry } from '../src/skills/skillRegistry.js';
import { TaskManager } from '../src/task/taskManager.js';
import { TaskGroupManager } from '../src/task/taskGroupManager.js';
import { WorkflowManager } from '../src/workflow/workflowManager.js';
import { PermissionDenied } from '../src/errors.js';
import { parsedSkill, role, seat, seatsConfig } from './helpers.js';

function setup() {
  const org = new Organization(
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

  const registry = new SkillRegistry(
    [parsedSkill('plan', 3, ['director', 'leader', 'staff'])],
    { skills: [], packs: { core: ['plan'] } },
  );

  const tm = new TaskManager(org, registry);
  const gm = new TaskGroupManager(org, tm);
  const wm = new WorkflowManager(org, gm);

  return { org, tm, gm, wm };
}

describe('workflow-v1', () => {
  it('层级组自动获得层级标准流程', () => {
    const { gm, wm } = setup();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'A组',
      mode: 'hierarchical',
      memberSeatIds: ['l1', 's1', 's2'],
      leaderSeatId: 'l1',
    });

    const workflow = wm.createForGroup(group.id);
    expect(workflow.template).toBe('hierarchical-standard');
    expect(workflow.steps.map((s) => s.key)).toEqual([
      'accept_task',
      'leader_decompose',
      'member_execute',
      'leader_review',
      'integrate_plan',
      'submit_plan',
    ]);
    expect(wm.currentStep(workflow.id)?.key).toBe('accept_task');
  });

  it('层级组 leader 与普通成员按角色推进步骤', () => {
    const { gm, wm } = setup();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'A组',
      mode: 'hierarchical',
      memberSeatIds: ['l1', 's1', 's2'],
      leaderSeatId: 'l1',
    });
    const workflow = wm.createForGroup(group.id);

    expect(() => wm.completeCurrentStep(workflow.id, 's1')).toThrow(PermissionDenied);
    wm.completeCurrentStep(workflow.id, 'l1');
    wm.completeCurrentStep(workflow.id, 'l1');

    expect(wm.currentStep(workflow.id)?.key).toBe('member_execute');
    expect(() => wm.completeCurrentStep(workflow.id, 'l1')).toThrow(PermissionDenied);

    wm.completeCurrentStep(workflow.id, 's1');
    expect(wm.currentStep(workflow.id)?.key).toBe('leader_review');
  });

  it('平级组自动获得协商型标准流程', () => {
    const { gm, wm } = setup();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'B组',
      mode: 'peer',
      memberSeatIds: ['s3', 's4'],
      peerDecisionMode: 'negotiation',
    });

    const workflow = wm.createForGroup(group.id);
    expect(workflow.template).toBe('peer-standard');
    expect(workflow.steps.map((s) => s.key)).toContain('peer_negotiate');
    expect(workflow.steps.map((s) => s.key)).toContain('peer_decision');

    wm.completeCurrentStep(workflow.id, 's3');
    wm.completeCurrentStep(workflow.id, 's4');
    expect(wm.currentStep(workflow.id)?.key).toBe('parallel_execute');
  });

  it('Agent 可以提出插入步骤，但未审批前流程不改变', () => {
    const { gm, wm } = setup();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'B组',
      mode: 'peer',
      memberSeatIds: ['s3', 's4'],
      peerDecisionMode: 'score',
    });

    const workflow = wm.createForGroup(group.id);
    const before = workflow.steps.length;

    const proposal = wm.proposeChange(
      workflow.id,
      's3',
      { type: 'insert_step', afterStepKey: 'share_results', name: '补充风险复核' },
      '当前结果分歧较大，需要增加复核步骤',
    );

    expect(proposal.status).toBe('pending');
    expect(workflow.steps).toHaveLength(before);

    wm.approveChange('d1', proposal.id);
    expect(workflow.steps).toHaveLength(before + 1);
    expect(workflow.steps.some((s) => s.name === '补充风险复核')).toBe(true);
  });

  it('无审批权席位不能批准工作流变更', () => {
    const { gm, wm } = setup();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'B组',
      mode: 'peer',
      memberSeatIds: ['s3', 's4'],
      peerDecisionMode: 'vote',
    });

    const workflow = wm.createForGroup(group.id);
    const proposal = wm.proposeChange(
      workflow.id,
      's3',
      { type: 'backtrack', targetStepKey: 'accept_task' },
      '重新确认任务边界',
    );

    expect(() => wm.approveChange('s4', proposal.id)).toThrow(PermissionDenied);
    expect(wm.getProposal(proposal.id).status).toBe('pending');
  });

  it('批准回退后，流程回到指定步骤并留下日志', () => {
    const { gm, wm } = setup();
    const group = gm.createGroup('d1', {
      activityId: 'act-a',
      name: 'B组',
      mode: 'peer',
      memberSeatIds: ['s3', 's4'],
      peerDecisionMode: 'vote',
    });

    const workflow = wm.createForGroup(group.id);
    wm.completeCurrentStep(workflow.id, 's3');
    wm.completeCurrentStep(workflow.id, 's4');

    const proposal = wm.proposeChange(
      workflow.id,
      's3',
      { type: 'backtrack', targetStepKey: 'peer_negotiate' },
      '需要重新协商任务分工',
    );
    wm.approveChange('d1', proposal.id);

    expect(wm.currentStep(workflow.id)?.key).toBe('peer_negotiate');
    expect(wm.getLog(workflow.id).some((x) => x.action === 'approve_change')).toBe(true);
  });
});
