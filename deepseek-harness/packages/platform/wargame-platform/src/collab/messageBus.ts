import { randomUUID } from 'node:crypto';
import type { Conversation, Message, MessageType } from '../types.ts';
import type { Organization } from '../org/organization.ts';

export class MessageBus {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, Message[]>();

  constructor(private readonly org: Organization) {}

  createGroup(activityId: string, members: string[], id?: string): Conversation {
    const c: Conversation = { id: id ?? randomUUID(), type: 'group', members: [...members], activityId };
    this.conversations.set(c.id, c);
    this.messages.set(c.id, []);
    return c;
  }

  createDirect(activityId: string, a: string, b: string, id?: string): Conversation {
    const c: Conversation = { id: id ?? randomUUID(), type: 'direct', members: [a, b], activityId };
    this.conversations.set(c.id, c);
    this.messages.set(c.id, []);
    return c;
  }

  send(
    conversationId: string,
    from: string,
    type: MessageType,
    content: string,
    mentions: string[] = [],
  ): Message {
    const c = this.conversations.get(conversationId);
    if (!c) throw new Error(`会话不存在: ${conversationId}`);
    if (!c.members.includes(from)) throw new Error(`席位 ${from} 不在会话 ${conversationId} 中`);
    const msg: Message = {
      id: randomUUID(),
      conversationId,
      type,
      from,
      content,
      mentions,
      timestamp: Date.now(),
    };
    this.messages.get(conversationId)!.push(msg);
    return msg;
  }

  getMessages(conversationId: string): Message[] {
    return [...(this.messages.get(conversationId) ?? [])];
  }

  conversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  allConversations(activityId?: string): Conversation[] {
    const list = [...this.conversations.values()];
    return activityId ? list.filter((c) => c.activityId === activityId) : list;
  }

  // 某席位可见的消息（成员资格 + 可选活动作用域）
  messagesForSeat(seatId: string, activityId?: string): Message[] {
    const result: Message[] = [];
    for (const c of this.conversations.values()) {
      if (activityId && c.activityId !== activityId) continue;
      if (!c.members.includes(seatId)) continue;
      result.push(...(this.messages.get(c.id) ?? []));
    }
    return result;
  }

  // @ 提及通知
  mentionsFor(seatId: string): Message[] {
    const result: Message[] = [];
    for (const msgs of this.messages.values()) {
      for (const m of msgs) {
        if (m.mentions.includes(seatId)) result.push(m);
      }
    }
    return result;
  }

  // 指挥链广播：覆盖发起席位的全部后代（含自身以便成员校验）
  broadcast(
    from: string,
    activityId: string,
    type: MessageType,
    content: string,
  ): { recipients: string[]; message: Message } {
    const descendants = this.org.descendants(from);
    const c = this.createGroup(activityId, [from, ...descendants]);
    const message = this.send(c.id, from, type, content);
    return { recipients: descendants, message };
  }

  // 从任意消息分支出新会话：继承该消息及之前上下文，且与源会话相互独立
  branch(fromMessageId: string): Conversation {
    let sourceMsg: Message | undefined;
    let sourceConv: Conversation | undefined;
    for (const [cid, msgs] of this.messages) {
      const found = msgs.find((m) => m.id === fromMessageId);
      if (found) {
        sourceMsg = found;
        sourceConv = this.conversations.get(cid);
        break;
      }
    }
    if (!sourceMsg || !sourceConv) throw new Error(`消息不存在: ${fromMessageId}`);

    const prev = this.messages
      .get(sourceConv.id)!
      .filter((m) => m.timestamp <= sourceMsg!.timestamp)
      .map((m) => ({ ...m, id: randomUUID(), conversationId: '' }));

    const newConv: Conversation = {
      id: randomUUID(),
      type: sourceConv.type,
      members: [...sourceConv.members],
      activityId: sourceConv.activityId,
      branchFrom: fromMessageId,
    };
    this.conversations.set(newConv.id, newConv);
    this.messages.set(
      newConv.id,
      prev.map((m) => ({ ...m, conversationId: newConv.id })),
    );
    return newConv;
  }
}
