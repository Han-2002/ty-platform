import type { ActivityItem } from '../types.js';

export function ActivitySelector({
  activities,
  selected,
  onSelect,
}: {
  activities: ActivityItem[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div data-testid="activity-selector">
      <label htmlFor="activity-select">活动（工作区）</label>
      <select
        id="activity-select"
        data-testid="activity-select"
        value={selected ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          请选择活动
        </option>
        {activities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// 任务下达 / 消息输入：未选活动时不可用
export function Composer({ disabled }: { disabled: boolean }) {
  return (
    <textarea
      data-testid="composer"
      disabled={disabled}
      placeholder={disabled ? '请先选择活动' : '输入指令…'}
    />
  );
}
