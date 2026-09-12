import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Organization } from '../org/organization.js';

export interface Conversation {
  id: string;
  activityId: string;
  name: string;
  kind: 'activity' | 'group' | 'direct';
  memberSeatIds: string[];
  createdBySeatId: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  activityId: string;
  senderUserId: string;
  senderSeatId: string;
  content: string;
  createdAt: number;
}

export class PersistentChatService {
  constructor(
    private readonly db: Pool,
    private readonly org: Organization,
  ) {}

  async ensureActivityConversation(activityId: string): Promise<Conversation> {
    const id = `activity:${activityId}`;
    const existing = await this.getConversation(id);
    if (existing) return existing;

    this.org.getActivity(activityId);
    const members = this.org.allSeats().map((s) => s.id);
    const creator = this.org.allSeats().find((s) => s.can_approve)?.id ?? members[0];
    if (!creator) throw new Error('没有可用于创建活动群的席位');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO conversations(id,activity_id,name,kind,created_by_seat_id,created_at)
         VALUES($1,$2,$3,'activity',$4,$5)
         ON CONFLICT(id) DO NOTHING`,
        [id, activityId, `${this.org.getActivity(activityId).name}-活动群`, creator, Date.now()],
      );
      for (const seatId of members) {
        await client.query(
          `INSERT INTO conversation_members(conversation_id,seat_id)
           VALUES($1,$2)
           ON CONFLICT DO NOTHING`,
          [id, seatId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return (await this.getConversation(id))!;
  }

  async createConversation(input: {
    activityId: string;
    name: string;
    kind: 'group' | 'direct';
    memberSeatIds: string[];
    createdBySeatId: string;
  }): Promise<Conversation> {
    this.org.getActivity(input.activityId);
    const members = [...new Set(input.memberSeatIds)];
    if (!members.includes(input.createdBySeatId)) members.push(input.createdBySeatId);
    if (members.length < 2) throw new Error('会话至少需要两个席位');
    for (const seatId of members) this.org.getSeat(seatId);

    const conversation: Conversation = {
      id: randomUUID(),
      activityId: input.activityId,
      name: input.name.trim() || '未命名会话',
      kind: input.kind,
      memberSeatIds: members,
      createdBySeatId: input.createdBySeatId,
      createdAt: Date.now(),
    };

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO conversations(id,activity_id,name,kind,created_by_seat_id,created_at)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          conversation.id,
          conversation.activityId,
          conversation.name,
          conversation.kind,
          conversation.createdBySeatId,
          conversation.createdAt,
        ],
      );
      for (const seatId of members) {
        await client.query(
          `INSERT INTO conversation_members(conversation_id,seat_id) VALUES($1,$2)`,
          [conversation.id, seatId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return conversation;
  }

  async listConversations(activityId: string, seatId: string): Promise<Conversation[]> {
    await this.ensureActivityConversation(activityId);
    const { rows } = await this.db.query(
      `SELECT c.id,c.activity_id,c.name,c.kind,c.created_by_seat_id,c.created_at,
              COALESCE(array_agg(cm2.seat_id ORDER BY cm2.seat_id), '{}') AS members
       FROM conversations c
       JOIN conversation_members mine
         ON mine.conversation_id=c.id AND mine.seat_id=$2
       JOIN conversation_members cm2
         ON cm2.conversation_id=c.id
       WHERE c.activity_id=$1
       GROUP BY c.id
       ORDER BY c.created_at,c.id`,
      [activityId, seatId],
    );
    return rows.map((r) => ({
      id: r.id,
      activityId: r.activity_id,
      name: r.name,
      kind: r.kind,
      memberSeatIds: r.members,
      createdBySeatId: r.created_by_seat_id,
      createdAt: Number(r.created_at),
    }));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const { rows } = await this.db.query(
      `SELECT c.id,c.activity_id,c.name,c.kind,c.created_by_seat_id,c.created_at,
              COALESCE(array_agg(cm.seat_id ORDER BY cm.seat_id), '{}') AS members
       FROM conversations c
       LEFT JOIN conversation_members cm ON cm.conversation_id=c.id
       WHERE c.id=$1
       GROUP BY c.id`,
      [id],
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id,
      activityId: r.activity_id,
      name: r.name,
      kind: r.kind,
      memberSeatIds: r.members,
      createdBySeatId: r.created_by_seat_id,
      createdAt: Number(r.created_at),
    };
  }

  async listMessages(
    conversationId: string,
    seatId: string,
    limit = 100,
  ): Promise<ChatMessage[]> {
    await this.assertMember(conversationId, seatId);
    const { rows } = await this.db.query(
      `SELECT id,conversation_id,activity_id,sender_user_id,sender_seat_id,content,created_at
       FROM chat_messages
       WHERE conversation_id=$1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, Math.min(Math.max(limit, 1), 300)],
    );
    return rows.reverse().map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      activityId: r.activity_id,
      senderUserId: r.sender_user_id,
      senderSeatId: r.sender_seat_id,
      content: r.content,
      createdAt: Number(r.created_at),
    }));
  }

  async sendMessage(input: {
    conversationId: string;
    userId: string;
    seatId: string;
    content: string;
  }): Promise<ChatMessage> {
    const conversation = await this.assertMember(input.conversationId, input.seatId);
    const content = input.content.trim();
    if (!content) throw new Error('消息不能为空');
    if (content.length > 10_000) throw new Error('消息过长');

    const message: ChatMessage = {
      id: randomUUID(),
      conversationId: conversation.id,
      activityId: conversation.activityId,
      senderUserId: input.userId,
      senderSeatId: input.seatId,
      content,
      createdAt: Date.now(),
    };
    await this.db.query(
      `INSERT INTO chat_messages(
        id,conversation_id,activity_id,sender_user_id,sender_seat_id,content,created_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        message.id,
        message.conversationId,
        message.activityId,
        message.senderUserId,
        message.senderSeatId,
        message.content,
        message.createdAt,
      ],
    );
    return message;
  }

  private async assertMember(conversationId: string, seatId: string): Promise<Conversation> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) throw new Error(`会话不存在: ${conversationId}`);
    if (!conversation.memberSeatIds.includes(seatId)) {
      throw new Error(`席位 ${seatId} 不属于会话 ${conversationId}`);
    }
    return conversation;
  }
}
