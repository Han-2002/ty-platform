import { describe, it, expect } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { MessageBus } from '../src/collab/messageBus.js';
import { role, seat, seatsConfig } from './helpers.js';

function orgTree() {
  return new Organization(
    seatsConfig(
      [role({ id: 'r' })],
      [
        seat({ id: 'root', role: 'r', parent: null }),
        seat({ id: 'a', role: 'r', parent: 'root' }),
        seat({ id: 'b', role: 'r', parent: 'root' }),
        seat({ id: 'a1', role: 'r', parent: 'a' }),
        seat({ id: 'c', role: 'r', parent: null }),
      ],
    ),
  );
}

describe('seat-collaboration', () => {
  it('群聊消息仅对成员可见', () => {
    const bus = new MessageBus(orgTree());
    const conv = bus.createGroup('act-a', ['a', 'b', 'c']);
    bus.send(conv.id, 'a', 'report', '群发内容');
    expect(bus.messagesForSeat('b').map((m) => m.content)).toEqual(['群发内容']);
    expect(bus.messagesForSeat('c').map((m) => m.content)).toEqual(['群发内容']);
    expect(bus.messagesForSeat('root').length).toBe(0);
  });

  it('直达会话消息仅两方可见', () => {
    const bus = new MessageBus(orgTree());
    const conv = bus.createDirect('act-a', 'a', 'b');
    bus.send(conv.id, 'a', 'instruction', '私密指令');
    expect(bus.messagesForSeat('b').map((m) => m.content)).toEqual(['私密指令']);
    expect(bus.messagesForSeat('a').map((m) => m.content)).toEqual(['私密指令']);
    expect(bus.messagesForSeat('c').length).toBe(0);
  });

  it('@ 提及使被提及席位收到通知', () => {
    const bus = new MessageBus(orgTree());
    const conv = bus.createGroup('act-a', ['a', 'b', 'c']);
    bus.send(conv.id, 'a', 'instruction', '请 @席位b 处理', ['b']);
    expect(bus.mentionsFor('b').length).toBe(1);
    expect(bus.mentionsFor('c').length).toBe(0);
  });

  it('指挥链广播覆盖子树且不外溢', () => {
    const bus = new MessageBus(orgTree());
    const { recipients } = bus.broadcast('root', 'act-a', 'instruction', '总导演广播');
    expect(new Set(recipients)).toEqual(new Set(['a', 'b', 'a1']));
    expect(bus.messagesForSeat('a1').map((m) => m.content)).toEqual(['总导演广播']);
    expect(bus.messagesForSeat('c').length).toBe(0);
  });

  it('消息区分类型（待审产出 / 主动提示）', () => {
    const bus = new MessageBus(orgTree());
    const conv = bus.createGroup('act-a', ['a', 'b']);
    const m1 = bus.send(conv.id, 'a', 'pending_output', '待审产出内容');
    const m2 = bus.send(conv.id, 'b', 'proactive', '主动提示内容');
    expect(m1.type).toBe('pending_output');
    expect(m2.type).toBe('proactive');
  });

  it('从任意消息分支出新会话并继承上下文、互不污染', () => {
    const bus = new MessageBus(orgTree());
    const src = bus.createGroup('act-a', ['a', 'b']);
    bus.send(src.id, 'a', 'report', '消息1');
    const m2 = bus.send(src.id, 'b', 'report', '消息2');

    const branch = bus.branch(m2.id);
    expect(branch.branchFrom).toBe(m2.id);
    // 继承消息1与消息2（含之前上下文）
    expect(bus.getMessages(branch.id).map((m) => m.content)).toEqual(['消息1', '消息2']);

    // 分支中的新交流不写入源会话
    bus.send(branch.id, 'a', 'report', '分支消息3');
    expect(bus.getMessages(src.id).map((m) => m.content)).toEqual(['消息1', '消息2']);
    expect(bus.getMessages(branch.id).map((m) => m.content)).toEqual(['消息1', '消息2', '分支消息3']);
  });
});
