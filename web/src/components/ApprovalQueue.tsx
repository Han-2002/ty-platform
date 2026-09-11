import type { ApprovalItem } from '../types.js';

export function ApprovalQueue({
  items,
  onApprove,
  onReject,
}: {
  items: ApprovalItem[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <ul data-testid="approval-queue">
      {items.map((i) => (
        <li key={i.id} data-testid={`approval-${i.id}`}>
          <span>{i.title}</span>
          <button data-testid={`approve-${i.id}`} onClick={() => onApprove(i.id)}>
            通过
          </button>
          <button data-testid={`reject-${i.id}`} onClick={() => onReject(i.id)}>
            打回
          </button>
        </li>
      ))}
    </ul>
  );
}
