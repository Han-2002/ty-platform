import { randomUUID } from 'node:crypto';
import type { Conversation, Message, MessageType } from '../types.js';
import type { Organization } from '../org/organization.js';
import type { PermissionEngine } from '../permission/permissionEngine.js';
import type { TaskGroupManager } from '../task/taskGroupManager.js';
import type { AuditTrail } from '../audit/auditTrail.js';

export interface MessageAccessContext {
  userId: string;
  seatId: string;
  activityId: string;
  groupId?: string;
  taskId?: string;
  actorType?: 'human' | 'agent' | 'system';
}

interface CrossGroupScope {
  sourceGroupId: string;
  targetGroupId: string;
}

export class MessageBus {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, Message[]>();
  private readonly conversationGroupScope = new Map<string, string>();
  private readonly crossGroupScope = new Map<string, CrossGroupScope>();

  constructor(
    private readonly org: Organization,
    private readonly permissions?: PermissionEngine,
    private readonly groups?: TaskGroupManager,
    private readonly audit?: AuditTrail,
  ) {}

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

  messagesForSeat(seatId: string, activityId?: string): Message[] {
    const result: Message[] = [];
    for (const c of this.conversations.values()) {
      if (activityId && c.activityId !== activityId) continue;
      if (!c.members.includes(seatId)) continue;
      result.push(...(this.messages.get(c.id) ?? []));
    }
    return result;
  }

  mentionsFor(seatId: string): Message[] {
    const result: Message[] = [];
    for (const msgs of this.messages.values()) {
      for (const m of msgs) {
        if (m.mentions.includes(seatId)) result.push(m);
      }
    }
    return result;
  }

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

    const groupId = this.conversationGroupScope.get(sourceConv.id);
    if (groupId) this.conversationGroupScope.set(newConv.id, groupId);

    const cross = this.crossGroupScope.get(sourceConv.id);
    if (cross) this.crossGroupScope.set(newConv.id, { ...cross });

    return newConv;
  }

  createTaskGroupConversation(
    ctx: MessageAccessContext,
    groupId: string,
    members: string[],
    id?: string,
  ): Conversation {
    const pe = this.requirePermissions();
    const gm = this.requireGroups();
    const group = gm.getGroup(groupId);

    if (group.activityId !== ctx.activityId) {
      throw new Error(`任务组 ${groupId} 不属于活动 ${ctx.activityId}`);
    }
    if (ctx.groupId && ctx.groupId !== groupId) {
      throw new Error(`业务上下文 groupId 与目标任务组不一致`);
    }
    if (!group.memberSeatIds.includes(ctx.seatId)) {
      throw new Error(`席位 ${ctx.seatId} 不属于任务组 ${groupId}`);
    }

    for (const seatId of members) {
      if (!group.memberSeatIds.includes(seatId)) {
        throw new Error(`席位 ${seatId} 不属于任务组 ${groupId}，不能加入组内会话`);
      }
    }

    pe.assert({
      userId: ctx.userId,
      seatId: ctx.seatId,
      activityId: ctx.activityId,
      groupId,
      taskId: ctx.taskId,
      actorType: ctx.actorType,
      action: 'message.send',
    });

    const conv = this.createGroup(ctx.activityId, members, id);
    this.conversationGroupScope.set(conv.id, groupId);

    this.audit?.append({
      actorType: ctx.actorType ?? 'human',
      activityId: ctx.activityId,
      userId: ctx.userId,
      seatId: ctx.seatId,
      action: 'communication.group.create',
      targetType: 'conversation',
      targetId: conv.id,
      result: 'success',
      metadata: { groupId, memberSeatIds: [...members] },
    });

    return conv;
  }

  sendSecure(
    conversationId: string,
    ctx: MessageAccessContext,
    type: MessageType,
    content: string,
    mentions: string[] = [],
  ): Message {
    const pe = this.requirePermissions();
    const c = this.conversations.get(conversationId);
    if (!c) throw new Error(`会话不存在: ${conversationId}`);
    if (c.activityId !== ctx.activityId) {
      throw new Error(`会话 ${conversationId} 不属于活动 ${ctx.activityId}`);
    }
    if (!c.members.includes(ctx.seatId)) {
      throw new Error(`席位 ${ctx.seatId} 不在会话 ${conversationId} 中`);
    }

    const cross = this.crossGroupScope.get(conversationId);
    if (cross) {
      pe.assert({
        userId: ctx.userId,
        seatId: ctx.seatId,
        activityId: ctx.activityId,
        groupId: cross.sourceGroupId,
        taskId: ctx.taskId,
        actorType: ctx.actorType,
        action: 'message.cross_group',
        targetGroupId: cross.targetGroupId,
      });
    } else {
      const scopedGroupId = this.conversationGroupScope.get(conversationId);
      pe.assert({
        userId: ctx.userId,
        seatId: ctx.seatId,
        activityId: ctx.activityId,
        groupId: scopedGroupId ?? ctx.groupId,
        taskId: ctx.taskId,
        actorType: ctx.actorType,
        action: 'message.send',
      });
    }

    for (const seatId of mentions) {
      if (!c.members.includes(seatId)) {
        throw new Error(`被 @ 的席位 ${seatId} 不在当前会话中`);
      }
    }

    const msg = this.send(conversationId, ctx.seatId, type, content, mentions);

    // 不把正文 content 写入审计，避免审计系统复制敏感通信内容。
    this.audit?.append({
      actorType: ctx.actorType ?? 'human',
      activityId: ctx.activityId,
      userId: ctx.userId,
      seatId: ctx.seatId,
      action: cross ? 'communication.cross_group.send' : 'communication.send',
      targetType: 'message',
      targetId: msg.id,
      result: 'success',
      metadata: {
        conversationId,
        messageType: type,
        contentLength: content.length,
        mentions: [...mentions],
        sourceGroupId: cross?.sourceGroupId ?? this.conversationGroupScope.get(conversationId),
        targetGroupId: cross?.targetGroupId,
      },
    });

    return msg;
  }

  createCrossGroupDirect(
    ctx: MessageAccessContext,
    sourceGroupId: string,
    targetGroupId: string,
    targetSeatId: string,
    id?: string,
  ): Conversation {
    const pe = this.requirePermissions();
    const gm = this.requireGroups();
    const source = gm.getGroup(sourceGroupId);
    const target = gm.getGroup(targetGroupId);

    if (source.activityId !== ctx.activityId || target.activityId !== ctx.activityId) {
      throw new Error('跨组通信两侧必须属于同一活动');
    }
    if (!source.memberSeatIds.includes(ctx.seatId)) {
      throw new Error(`席位 ${ctx.seatId} 不属于源任务组 ${sourceGroupId}`);
    }
    if (!target.memberSeatIds.includes(targetSeatId)) {
      throw new Error(`目标席位 ${targetSeatId} 不属于目标任务组 ${targetGroupId}`);
    }

    pe.assert({
      userId: ctx.userId,
      seatId: ctx.seatId,
      activityId: ctx.activityId,
      groupId: sourceGroupId,
      taskId: ctx.taskId,
      actorType: ctx.actorType,
      action: 'message.cross_group',
      targetGroupId,
    });

    const conv = this.createDirect(ctx.activityId, ctx.seatId, targetSeatId, id);
    this.crossGroupScope.set(conv.id, { sourceGroupId, targetGroupId });

    this.audit?.append({
      actorType: ctx.actorType ?? 'human',
      activityId: ctx.activityId,
      userId: ctx.userId,
      seatId: ctx.seatId,
      action: 'communication.cross_group.channel.create',
      targetType: 'conversation',
      targetId: conv.id,
      result: 'success',
      metadata: { sourceGroupId, targetGroupId, targetSeatId },
    });

    return conv;
  }

  conversationTaskGroup(conversationId: string): string | undefined {
    return this.conversationGroupScope.get(conversationId);
  }

  conversationCrossGroupScope(conversationId: string): CrossGroupScope | undefined {
    const scope = this.crossGroupScope.get(conversationId);
    return scope ? { ...scope } : undefined;
  }

  private requirePermissions(): PermissionEngine {
    if (!this.permissions) {
      throw new Error('MessageBus 未配置 PermissionEngine，不能使用安全通信接口');
    }
    return this.permissions;
  }

  private requireGroups(): TaskGroupManager {
    if (!this.groups) {
      throw new Error('MessageBus 未配置 TaskGroupManager，不能使用任务组通信接口');
    }
    return this.groups;
  }
}
