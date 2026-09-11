import type { KnowledgeItem } from '../types.js';

// 仅展示可见文档；越权文档完全不可见（不占位、不脱敏）
export function KnowledgePermissionView({
  role,
  documents,
}: {
  role: string;
  documents: KnowledgeItem[];
}) {
  const visible = documents.filter((d) => d.visible);
  return (
    <div data-testid="knowledge-permission-view">
      <p>当前角色：{role}</p>
      <ul data-testid="knowledge-list">
        {visible.map((d) => (
          <li key={d.id} data-testid={`knowledge-${d.id}`}>
            {d.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
