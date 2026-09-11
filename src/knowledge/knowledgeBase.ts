import type { KnowledgeDocument } from '../types.js';

// 用于权限判定的最小角色视图，避免与 org 模块耦合
export interface RoleView {
  id: string;
  clearance: number;
}

// 可见性判定：deny 优先于 allow；密级不足直接不可见
export function canView(role: RoleView, doc: KnowledgeDocument): boolean {
  if (role.clearance < doc.clearance) return false;
  if (doc.deny.includes(role.id)) return false;
  if (doc.allow.length > 0 && !doc.allow.includes(role.id)) return false;
  return true;
}

export class KnowledgeBase {
  private readonly documents: KnowledgeDocument[];

  constructor(documents: KnowledgeDocument[]) {
    this.documents = documents;
  }

  // 检索前过滤：先计算可见集
  visibleDocuments(role: RoleView): KnowledgeDocument[] {
    return this.documents.filter((d) => canView(role, d));
  }

  // 仅在可见集内检索，不可见文档绝不进入候选集
  search(role: RoleView, query: string): KnowledgeDocument[] {
    const visible = this.visibleDocuments(role);
    const q = query.toLowerCase();
    return visible.filter(
      (d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q),
    );
  }

  // 可见文档条数（用于权限差异化断言）
  visibleCount(role: RoleView): number {
    return this.visibleDocuments(role).length;
  }

  // 是否存在「命中但越权不可见」的文档（仅用于拒绝判断，不返回内容、不暴露存在性）
  hasBlockedMatch(role: RoleView, query: string): boolean {
    const q = query.toLowerCase();
    return this.documents.some(
      (d) =>
        !canView(role, d) &&
        (d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)),
    );
  }
}
