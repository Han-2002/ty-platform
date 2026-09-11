import type { MessageItem, MessageType } from '../types.js';

const TYPE_LABEL: Record<MessageType, string> = {
  instruction: '指令',
  report: '汇报',
  proactive: '主动提示',
};

export function MessageStream({ messages }: { messages: MessageItem[] }) {
  return (
    <ul data-testid="message-stream">
      {messages.map((m) => (
        <li key={m.id} data-type={m.type}>
          {TYPE_LABEL[m.type]}：{m.from}：{m.content}
        </li>
      ))}
    </ul>
  );
}
