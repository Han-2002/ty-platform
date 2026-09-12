import { describe, expect, it } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { UserSeatManager } from '../src/identity/userSeatManager.js';
import { ActivityTemplateManager } from '../src/activity/activityTemplateManager.js';
import { PermissionDenied } from '../src/errors.js';
import { role, seat } from './helpers.js';
import type { SeatsConfig } from '../src/types.js';

function makeOrg() {
  const cfg: SeatsConfig = {
    roles: [
      role({ id: 'director', clearance: 5, can_dispatch: true, can_approve: true, packs: [] }),
      role({ id: 'staff', clearance: 3, can_dispatch: false, can_approve: false, packs: [] }),
    ],
    seats: [
      seat({ id: 'd1', role: 'director', parent: null }),
      seat({ id: 's1', role: 'staff', parent: 'd1' }),
      seat({ id: 's2', role: 'staff', parent: 'd1' }),
    ],
    activities: [
      { id: 'act-a', name: '洪兰对抗' },
      { id: 'act-b', name: '专项筹划活动' },
    ],
  };
  return new Organization(cfg);
}

const honglanTemplate = {
  id: 'tpl-honglan',
  name: '洪兰对抗标准模板',
  phases: ['准备', '想定理解', '方案拟制', '推演验证', '方案确定', '执行', '复盘'],
  hierarchicalWorkflow: ['接收任务', '组长拆解', '成员执行', '组长审核', '汇总方案', '提交'],
  peerWorkflow: ['接收任务', '协商分工', '并行执行', '结果共享', '群体决策', '提交'],
  requireFinalHumanApproval: true,
};

describe('user-seat-activity-v1', () => {
  it('活动可以绑定不同业务模板，而不是全系统共用一套固定阶段', () => {
    const org = makeOrg();
    const am = new ActivityTemplateManager(org);

    am.registerTemplate(honglanTemplate);
    am.registerTemplate({
      ...honglanTemplate,
      id: 'tpl-special',
      name: '专项活动模板',
      phases: ['准备', '方案拟制', '验证', '复盘'],
    });

    am.bindActivity('d1', 'act-a', 'tpl-honglan');
    am.bindActivity('d1', 'act-b', 'tpl-special');

    expect(am.templateForActivity('act-a').phases).toContain('想定理解');
    expect(am.templateForActivity('act-b').phases).not.toContain('想定理解');
  });

  it('真实用户可以被编配到某活动中的具体席位', () => {
    const org = makeOrg();
    const um = new UserSeatManager(org);

    um.createUser('u-zhang', '张三');
    const assignment = um.assign('d1', 'u-zhang', 's1', 'act-a');

    expect(assignment.active).toBe(true);
    expect(assignment.seatId).toBe('s1');
    expect(assignment.activityId).toBe('act-a');
  });

  it('同一活动中的同一席位不能同时被两个人占用', () => {
    const org = makeOrg();
    const um = new UserSeatManager(org);

    um.createUser('u1', '张三');
    um.createUser('u2', '李四');
    um.assign('d1', 'u1', 's1', 'act-a');

    expect(() => um.assign('d1', 'u2', 's1', 'act-a')).toThrow('已被用户 u1 占用');
  });

  it('释放席位后可以重新编配', () => {
    const org = makeOrg();
    const um = new UserSeatManager(org);

    um.createUser('u1', '张三');
    um.createUser('u2', '李四');
    const a1 = um.assign('d1', 'u1', 's1', 'act-a');
    um.release('d1', a1.id);

    const a2 = um.assign('d1', 'u2', 's1', 'act-a');
    expect(a2.active).toBe(true);
  });

  it('能够形成 Runtime 后续需要的人+席位+活动业务上下文', () => {
    const org = makeOrg();
    const um = new UserSeatManager(org);

    um.createUser('u1', '张三');
    um.assign('d1', 'u1', 's1', 'act-a');

    expect(um.context('u1', 's1', 'act-a')).toMatchObject({
      userId: 'u1',
      userName: '张三',
      seatId: 's1',
      roleId: 'staff',
      activityId: 'act-a',
      clearance: 3,
      canDispatch: false,
      canApprove: false,
    });
  });

  it('未被编配的用户不能冒用席位上下文', () => {
    const org = makeOrg();
    const um = new UserSeatManager(org);

    um.createUser('u1', '张三');
    expect(() => um.context('u1', 's1', 'act-a')).toThrow(PermissionDenied);
  });

  it('普通席位不能擅自改变活动阶段或人员编配', () => {
    const org = makeOrg();
    const um = new UserSeatManager(org);
    const am = new ActivityTemplateManager(org);

    um.createUser('u1', '张三');
    am.registerTemplate(honglanTemplate);
    am.bindActivity('d1', 'act-a', 'tpl-honglan');

    expect(() => um.assign('s1', 'u1', 's2', 'act-a')).toThrow(PermissionDenied);
    expect(() => am.setPhase('s1', 'act-a', '方案拟制')).toThrow(PermissionDenied);
  });

  it('活动模板可以为层级组和平级组提供不同的标准流程定义', () => {
    const org = makeOrg();
    const am = new ActivityTemplateManager(org);

    am.registerTemplate(honglanTemplate);
    am.bindActivity('d1', 'act-a', 'tpl-honglan');

    expect(am.workflowForGroupMode('act-a', 'hierarchical')).toContain('组长拆解');
    expect(am.workflowForGroupMode('act-a', 'peer')).toContain('协商分工');
  });
});
