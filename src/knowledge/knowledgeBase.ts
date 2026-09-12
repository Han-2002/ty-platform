import type { KnowledgeDocument } from '../types.js';
import type { PermissionEngine } from '../permission/permissionEngine.js';
import type { AuditTrail } from '../audit/auditTrail.js';

export interface RoleView {
  id: string;
  clearance: number;
}

export interface KnowledgeAccessContext {
  userId: string;
  seatId: string;
  activityId: string;
  groupId?: string;
  taskId?: string;
  actorType?: 'human' | 'agent' | 'system';
}

export function canView(role: RoleView, doc: KnowledgeDocument): boolean {
  if (role.clearance < doc.clearance) return false;
  if (doc.deny.includes(role.id)) return false;
  if (doc.allow.length > 0 && !doc.allow.includes(role.id)) return false;
  return true;
}

export class KnowledgeBase {
  private readonly documents: KnowledgeDocument[];

  constructor(
    documents: KnowledgeDocument[],
    private readonly permissions?: PermissionEngine,
    private readonly audit?: AuditTrail,
  ) {
    this.documents = documents;
  }

  visibleDocuments(role: RoleView): KnowledgeDocument[] {
    return this.documents.filter((d) => canView(role, d));
  }

  search(role: RoleView, query: string): KnowledgeDocument[] {
    const visible = this.visibleDocuments(role);
    const q = query.toLowerCase();
    return visible.filter(
      (d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q),
    );
  }

  visibleCount(role: RoleView): number {
    return this.visibleDocuments(role).length;
  }

  hasBlockedMatch(role: RoleView, query: string): boolean {
    const q = query.toLowerCase();
    return this.documents.some(
      (d) =>
        !canView(role, d) &&
        (d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)),
    );
  }

  visibleDocumentsForContext(ctx: KnowledgeAccessContext): KnowledgeDocument[] {
    const pe = this.requirePermissions();
    return this.documents.filter((doc) =>
      pe.check({
        userId: ctx.userId,
        seatId: ctx.seatId,
        activityId: ctx.activityId,
        groupId: ctx.groupId,
        taskId: ctx.taskId,
        actorType: ctx.actorType,
        action: 'knowledge.read',
        resourceId: doc.id,
        resourceClearance: doc.clearance,
        allowedRoleIds: doc.allow,
        deniedRoleIds: doc.deny,
      }).allowed,
    );
  }

  searchForContext(ctx: KnowledgeAccessContext, query: string): KnowledgeDocument[] {
    const q = query.toLowerCase();
    const result = this.visibleDocumentsForContext(ctx).filter(
      (d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q),
    );

    this.audit?.append({
      actorType: ctx.actorType ?? 'human',
      activityId: ctx.activityId,
      userId: ctx.userId,
      seatId: ctx.seatId,
      action: 'knowledge.search',
      targetType: 'knowledge_base',
      result: 'success',
      metadata: {
        groupId: ctx.groupId,
        taskId: ctx.taskId,
        queryLength: query.length,
        returnedDocumentIds: result.map((d) => d.id),
      },
    });

    return result;
  }

  getDocumentForContext(
    ctx: KnowledgeAccessContext,
    documentId: string,
  ): KnowledgeDocument {
    const doc = this.documents.find((d) => d.id === documentId);
    if (!doc) throw new Error(`知识文档不存在: ${documentId}`);

    const pe = this.requirePermissions();
    pe.assert({
      userId: ctx.userId,
      seatId: ctx.seatId,
      activityId: ctx.activityId,
      groupId: ctx.groupId,
      taskId: ctx.taskId,
      actorType: ctx.actorType,
      action: 'knowledge.read',
      resourceId: doc.id,
      resourceClearance: doc.clearance,
      allowedRoleIds: doc.allow,
      deniedRoleIds: doc.deny,
    });

    this.audit?.append({
      actorType: ctx.actorType ?? 'human',
      activityId: ctx.activityId,
      userId: ctx.userId,
      seatId: ctx.seatId,
      action: 'knowledge.document.read',
      targetType: 'knowledge_document',
      targetId: doc.id,
      result: 'success',
      metadata: { groupId: ctx.groupId, taskId: ctx.taskId },
    });

    return doc;
  }

  private requirePermissions(): PermissionEngine {
    if (!this.permissions) {
      throw new Error('KnowledgeBase 未配置 PermissionEngine，不能使用上下文权限接口');
    }
    return this.permissions;
  }
}
