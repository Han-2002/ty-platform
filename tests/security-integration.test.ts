import { describe, expect, it } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { SkillRegistry } from '../src/skills/skillRegistry.js';
import { TaskManager } from '../src/task/taskManager.js';
import { TaskGroupManager } from '../src/task/taskGroupManager.js';
import { UserSeatManager } from '../src/identity/userSeatManager.js';
import { PermissionEngine } from '../src/permission/permissionEngine.js';
import { KnowledgeBase } from '../src/knowledge/knowledgeBase.js';
import { MessageBus } from '../src/collab/messageBus.js';
import { PermissionDenied } from '../src/errors.js';
import { parsedSkill, role, seat } from './helpers.js';
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
      seat({ id: 's3', role: 'staff', parent: 'd1' }),
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
    memberSeatIds: ['s2', 's3'],
    peerDecisionMode: 'score',
  });

  const users = new UserSeatManager(org);
  users.createUser('ud', '总导演');
  users.createUser('ul', '组长');
  users.createUser('u1', '参谋甲');
  users.createUser('u2', '参谋乙');
  users.assign('d1', 'ud', 'd1', 'act-a');
  users.assign('d1', 'ul', 'l1', 'act-a');
  users.assign('d1', 'u1', 's1', 'act-a');
  users.assign('d1', 'u2', 's2', 'act-a');

  const pe = new PermissionEngine(org, users);

  const docs: KnowledgeDocument[] = [
    { id: 'public', title: '公开规范', content: '通用筹划方法', clearance: 1, allow: [], deny: [] },
    { id: 'staff-doc', title: '参谋资料', content: '方案拟制参考', clearance: 3, allow: ['staff', 'leader', 'director'], deny: [] },
    { id: 'secret', title: '核心参数', content: '高密级核心参数', clearance: 5, allow: ['director'], deny: [] },
  ];

  const kb = new KnowledgeBase(docs, pe);
  const bus = new MessageBus(org, pe, gm);

  return { org, gm, groupA, groupB, users, pe, kb, bus };
}

describe('security-integration-v1', () => {
  it('KnowledgeBase 的上下文检索真正走统一 PermissionEngine', () => {
    const { kb } = setup();

    const staffVisible = kb.visibleDocumentsForContext({
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
    });
    expect(staffVisible.map((d) => d.id)).toEqual(['public', 'staff-doc']);

    const directorVisible = kb.visibleDocumentsForContext({
      userId: 'ud',
      seatId: 'd1',
      activityId: 'act-a',
    });
    expect(directorVisible.map((d) => d.id)).toEqual(['public', 'staff-doc', 'secret']);
  });

  it('越权知识文档不能通过 documentId 直接绕过检索读取', () => {
    const { kb } = setup();

    expect(() =>
      kb.getDocumentForContext(
        { userId: 'u1', seatId: 's1', activityId: 'act-a' },
        'secret',
      ),
    ).toThrow(PermissionDenied);
  });

  it('任务组内会话只能加入本组席位，组内成员可正常发送', () => {
    const { bus, groupA } = setup();

    expect(() =>
      bus.createTaskGroupConversation(
        { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
        groupA.id,
        ['s1', 's2'],
      ),
    ).toThrow('不能加入组内会话');

    const conv = bus.createTaskGroupConversation(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
      groupA.id,
      ['l1', 's1'],
    );

    const msg = bus.sendSecure(
      conv.id,
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
      'report',
      'A组内部报告',
      ['l1'],
    );

    expect(msg.content).toBe('A组内部报告');
    expect(bus.messagesForSeat('s2')).toHaveLength(0);
  });

  it('未授权时不能建立跨组直接会话', () => {
    const { bus, groupA, groupB } = setup();

    expect(() =>
      bus.createCrossGroupDirect(
        { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
        groupA.id,
        groupB.id,
        's2',
      ),
    ).toThrow(PermissionDenied);
  });

  it('人工临时授权后可以建立跨组会话并发送消息', () => {
    const { pe, bus, groupA, groupB } = setup();

    pe.issueTemporaryGrant('d1', {
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'message.cross_group',
      targetGroupId: groupB.id,
      expiresAt: Date.now() + 60_000,
      reason: 'A/B 两组临时协同',
    });

    const conv = bus.createCrossGroupDirect(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
      groupA.id,
      groupB.id,
      's2',
    );

    const msg = bus.sendSecure(
      conv.id,
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
      'report',
      '请求B组共享评估结果',
    );

    expect(msg.content).toBe('请求B组共享评估结果');
    expect(bus.messagesForSeat('s2').map((m) => m.content)).toContain('请求B组共享评估结果');
  });

  it('临时授权撤销后，已存在的跨组会话也不能继续发消息', () => {
    const { pe, bus, groupA, groupB } = setup();

    const grant = pe.issueTemporaryGrant('d1', {
      userId: 'u1',
      seatId: 's1',
      activityId: 'act-a',
      action: 'message.cross_group',
      targetGroupId: groupB.id,
      expiresAt: Date.now() + 60_000,
      reason: '短时协同',
    });

    const conv = bus.createCrossGroupDirect(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
      groupA.id,
      groupB.id,
      's2',
    );

    pe.revokeTemporaryGrant('d1', grant.id);

    expect(() =>
      bus.sendSecure(
        conv.id,
        { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
        'report',
        '授权撤销后不应发出',
      ),
    ).toThrow(PermissionDenied);
  });

  it('@ 提及不能借机越界通知非会话成员', () => {
    const { bus, groupA } = setup();

    const conv = bus.createTaskGroupConversation(
      { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
      groupA.id,
      ['l1', 's1'],
    );

    expect(() =>
      bus.sendSecure(
        conv.id,
        { userId: 'u1', seatId: 's1', activityId: 'act-a', groupId: groupA.id },
        'instruction',
        '尝试越界@',
        ['s2'],
      ),
    ).toThrow('不在当前会话中');
  });
});
