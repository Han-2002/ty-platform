import type { McpServiceItem } from '../types.js';

export function McpManager({
  services,
  onToggle,
}: {
  services: McpServiceItem[];
  onToggle: (id: string) => void;
}) {
  return (
    <ul data-testid="mcp-manager">
      {services.map((s) => (
        <li key={s.id} data-testid={`mcp-${s.id}`} data-connected={String(s.connected)}>
          <span>
            {s.name}：{s.connected ? '已连接' : '未连接'}
          </span>
          <button data-testid={`mcp-toggle-${s.id}`} onClick={() => onToggle(s.id)}>
            {s.connected ? '停止' : '启动'}
          </button>
        </li>
      ))}
    </ul>
  );
}
