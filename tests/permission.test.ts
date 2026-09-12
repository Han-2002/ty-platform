import { describe, expect, it } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { UserSeatManager } from '../src/identity/userSeatManager.js';
import { PermissionEngine } from '../src/permission/permissionEngine.js';
import { PermissionDenied } from '../src/errors.js';
import { role, seat } from './helpers.js';
import type { SeatsConfig } from '../src/types.js';

function setup() {
  const cfg: SeatsConfig = {
    roles: [
      role({ id: 'director', clearance: 5, can_dispatch: true, can_approve: true, packs: [] }),
      role({ id: 'leader', clearance: 4, can_dispatch: true, can_approve: false, packs: [] }),
      role({ id: 'staff', clearance: 3, can_dispatch: false, can_approve: false, packs: [] }),
    ],
    seats: [
      seat({ id: 'd1', role: 'director', parent: null }),
      seat({ id: 'l1', role: 'leader', parent: 'd1' }),
      seat({ id: 's1', role: 'staff', parent: 'l1' }),
      seat({ id: 's2', role: 'staff', parent: 'd1' }),
    ],
    activities: [{ id: 'act-a', name: '洪兰对抗' }],
  };

  const org = new Organization(cfg);
  const users = new UserSeatManager(org);

  users.createUser('ud', '总导演');
  users.createUser('ul', '组长');
  users.createUser('u1', '参谋甲');
  users.createUser('u2', '参谋乙');

  users.assign('d1', 'ud', 'd1', 'act-a');
  users.assign('d1', 'ul', 'l1', 'act-a');
  users.assign('d1', 'u1', 's1', 'act-a');
  users.assign('d1', 'u2', 's2', 'act-a');

  return { org, users, pe: new PermissionEngine(org, users) };
}

describe('permission-v1', () => {
  it('未被编配到席位的用户默认拒绝', () => {
    const { pe, users } = setup();
    users.createUser('ghost', '未编配人员');

    expect(
      pe.check({
        userId: 'ghost',
        seatId: 's1',
        activityId: 'act-a',
        action: 'knowledge.read',
      }).allowed,
    ).toBe(false);
  });

  it('知识资源同时受密级和角色白名单控制', () => {
    const { pe } = setup();

    const low = pe.check({
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'knowledge.read',
      resourceClearance: 4,
    });
    expect(low.allowed).toBe(false);

    const roleDenied = pe.check({
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'knowledge.read',
      resourceClearance: 2,
      allowedRoleIds: ['director'],
    });
    expect(roleDenied.allowed).toBe(false);
  });

  it('组长席位具有 task.dispatch 基础权限', () => {
    const { pe } = setup();

    expect(
      pe.check({
        userId: 'ul',
        seatId: 'l1',
        activityId: 'act-a',
        action: 'task.dispatch',
      }).allowed,
    ).toBe(true);
  });

  it('普通席位不能直接批准方案或工作流变更', () => {
    const { pe } = setup();

    expect(
      pe.check({
        userId: 'u1',
        seatId: 's1',
        activityId: 'act-a',
        action: 'plan.approve',
      }).allowed,
    ).toBe(false);

    expect(
      pe.check({
        userId: 'u1',
        seatId: 's1',
        activityId: 'act-a',
        action: 'workflow.approve_change',
      }).allowed,
    ).toBe(false);
  });

  it('跨组通信默认拒绝', () => {
    const { pe } = setup();

    const decision = pe.check({
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'message.cross_group',
      targetGroupId: 'group-b',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('默认隔离');
  });

  it('审批席位可以签发临时跨组授权，授权后允许', () => {
    const { pe } = setup();

    const grant = pe.issueTemporaryGrant('d1', {
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'message.cross_group',
      targetGroupId: 'group-b',
      expiresAt: Date.now() + 60_000,
      reason: '临时跨组协同',
    });

    const decision = pe.check({
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'message.cross_group',
      targetGroupId: 'group-b',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe('temporary_grant');
    expect(decision.reason).toContain(grant.id);
  });

  it('临时授权撤销后立即失效', () => {
    const { pe } = setup();

    const grant = pe.issueTemporaryGrant('d1', {
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'message.cross_group',
      targetGroupId: 'group-b',
      expiresAt: Date.now() + 60_000,
      reason: '临时跨组协同',
    });

    pe.revokeTemporaryGrant('d1', grant.id);

    expect(
      pe.check({
        userId: 'u1',
        seatId: 's1',
        activityId: 'act-a',
        action: 'message.cross_group',
        targetGroupId: 'group-b',
      }).allowed,
    ).toBe(false);
  });

  it('无审批权席位不能签发临时授权', () => {
    const { pe } = setup();

    expect(() =>
      pe.issueTemporaryGrant('s1', {
        userId: 'u1',
        seatId: 's1',
        activityId: 'act-a',
        action: 'plan.approve',
        expiresAt: Date.now() + 60_000,
        reason: '越权尝试',
      }),
    ).toThrow(PermissionDenied);
  });
});
