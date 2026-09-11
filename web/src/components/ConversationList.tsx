import type { ConversationItem } from '../types.js';

export function ConversationList({ conversations }: { conversations: ConversationItem[] }) {
  return (
    <ul data-testid="conversation-list">
      {conversations.map((c) => (
        <li key={c.id} data-testid={`conversation-${c.id}`} data-type={c.type}>
          <span data-testid="conversation-type">{c.type === 'group' ? '群聊' : '直达'}</span>
          <span>{c.name}</span>
        </li>
      ))}
    </ul>
  );
}
