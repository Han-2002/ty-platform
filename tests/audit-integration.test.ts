import { describe, expect, it } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { SkillRegistry } from '../src/skills/skillRegistry.js';
import { TaskManager } from '../src/task/taskManager.js';
import { TaskGroupManager } from '../src/task/taskGroupManager.js';
import { UserSeatManager } from '../src/identity/userSeatManager.js';
import { PermissionEngine } from '../src/permission/permissionEngine.js';
import { KnowledgeBase } from '../src/knowledge/knowledgeBase.js';
import { MessageBus } from '../src/collab/messageBus.js';
import { AuditTrail } from '../src/audit/auditTrail.js';
import { role, seat, parsedSkill } from './helpers.js';
import type { KnowledgeDocument, SeatsConfig } from '../src/types.js';

function setup() {
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
      seat({ id: 's2', role: 'staff', parent: 'd1' }),
    ],
    activities: [{ id: 'act-a', name: '洪兰对抗' }],
  };

  const org = new Organization(cfg);
  const registry = new SkillRegistry(
    [parsedSkill('plan', 1, ['director', 'leader', 'staff'])],
    { skills: [], packs: { core: ['plan'] } },
  );
  const tm = new TaskManager(org, registry);
  const gm = new TaskGroupManager(org, tm);

  const groupA = gm.createGroup('d1', {
    activityId: 'act-a',
    name: 'A组',
    mode: 'hierarchical',
    memberSeatIds: ['l1', 's1'],
    leaderSeatId: 'l1',
  });
  const groupB = gm.createGroup('d1', {
    activityId: 'act-a',
    name: 'B组',
    mode: 'peer',
    memberSeatIds: ['s2'],
    peerDecisionMode: 'score',
  });

  const users = new UserSeatManager(org);
  users.createUser('ud', '总导演');
  users.createUser('u1', '参谋甲');
  users.createUser('u2', '参谋乙');
  users.assign('d1', 'ud', 'd1', 'act-a');
  users.assign('d1', 'u1', 's1', 'act-a');
  users.assign('d1', 'u2', 's2', 'act-a');

  const audit = new AuditTrail();
  const pe = new PermissionEngine(org, users, audit);

  const docs: KnowledgeDocument[] = [
    { id: 'public', title: '公开规范', content: '通用筹划方法', clearance: 1, allow: [], deny: [] },
    { id: 'secret', title: '核心参数', content: '高密级核心参数', clearance: 5, allow: ['director'], deny: [] },
  ];
  const kb = new KnowledgeBase(docs, pe, audit);
  const bus = new MessageBus(org, pe, gm, audit);

  return { org, gm, groupA, groupB, users, audit, pe, kb, bus };
}

describe('audit-v1', () => {
  it('审计记录形成可校验 hash 链', () => {
    const audit = new AuditTrail();
    audit.append({ actorType: 'system', action: 'a', result: 'info' });
    audit.append({ actorType: 'system', action: 'b', result: 'success' });

    expect(audit.count()).toBe(2);
    expect(audit.verifyIntegrity()).toBe(true);
    expect(audit.all()[1].prevHash).toBe(audit.all()[0].hash);
  });

  it('Permission allow/deny 都进入统一审计', () => {
    const { pe, audit } = setup();

    pe.check({
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'knowledge.read',
      resourceId: 'public',
      resourceClearance: 1,
    });

    pe.check({
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'plan.approve',
    });

    const checks = audit.query({ action: 'permission.check' });
    expect(checks.some((x) => x.result === 'allowed')).toBe(true);
    expect(checks.some((x) => x.result === 'denied')).toBe(true);
  });

  it('临时授权签发和撤销都有独立审计事件', () => {
    const { pe, audit, groupB } = setup();

    const grant = pe.issueTemporaryGrant('d1', {
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'message.cross_group',
      targetGroupId: groupB.id,
      expiresAt: Date.now() + 60_000,
      reason: '临时协同',
    });
    pe.revokeTemporaryGrant('d1', grant.id);

    expect(audit.query({ action: 'permission.grant.issue' })).toHaveLength(1);
    expect(audit.query({ action: 'permission.grant.revoke' })).toHaveLength(1);
  });

  it('知识检索和文档读取进入审计，但不复制文档正文', () => {
    const { kb, audit } = setup();

    kb.searchForContext(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', actorType: 'agent' },
      '筹划',
    );
    kb.getDocumentForContext(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', actorType: 'agent' },
      'public',
    );

    expect(audit.query({ action: 'knowledge.search' })).toHaveLength(1);
    expect(audit.query({ action: 'knowledge.document.read' })).toHaveLength(1);

    const serialized = JSON.stringify(audit.all());
    expect(serialized).not.toContain('通用筹划方法');
  });

  it('安全通信进入审计，且审计不保存消息正文', () => {
    const { bus, audit, groupA } = setup();

    const conv = bus.createTaskGroupConversation(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id, actorType: 'agent' },
      groupA.id,
      ['l1', 's1'],
    );

    bus.sendSecure(
      conv.id,
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id, actorType: 'agent' },
      'report',
      '这是一条敏感正文，不应该复制到审计日志',
    );

    expect(audit.query({ action: 'communication.send' })).toHaveLength(1);
    expect(JSON.stringify(audit.all())).not.toContain('这是一条敏感正文');
  });

  it('跨组通道的授权、创建和消息发送可串联追踪', () => {
    const { pe, bus, audit, groupA, groupB } = setup();

    pe.issueTemporaryGrant('d1', {
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'message.cross_group',
      targetGroupId: groupB.id,
      expiresAt: Date.now() + 60_000,
      reason: '临时共享评估结果',
    });

    const conv = bus.createCrossGroupDirect(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
      groupA.id,
      groupB.id,
      's2',
    );
    bus.sendSecure(
      conv.id,
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
      'report',
      '跨组消息',
    );

    expect(audit.query({ action: 'permission.grant.issue' })).toHaveLength(1);
    expect(audit.query({ action: 'communication.cross_group.channel.create' })).toHaveLength(1);
    expect(audit.query({ action: 'communication.cross_group.send' })).toHaveLength(1);
    expect(audit.verifyIntegrity()).toBe(true);
  });
});
