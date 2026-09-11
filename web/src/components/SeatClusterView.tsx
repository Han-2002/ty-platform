import type { SeatItem, SeatStatus } from '../types.js';

const STATUS_LABEL: Record<SeatStatus, string> = {
  idle: '空闲',
  executing: '执行中',
  waiting_approval: '待审',
};

export function SeatClusterView({ seats }: { seats: SeatItem[] }) {
  return (
    <ul data-testid="seat-cluster">
      {seats.map((s) => (
        <li key={s.id} data-testid={`seat-${s.id}`} data-status={s.status}>
          {s.name}（{STATUS_LABEL[s.status]}）
        </li>
      ))}
    </ul>
  );
}
