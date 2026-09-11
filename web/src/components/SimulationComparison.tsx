import type { PlanScore } from '../types.js';

export function SimulationComparison({ plans }: { plans: PlanScore[] }) {
  return (
    <table data-testid="simulation-comparison">
      <thead>
        <tr>
          <th>方案</th>
          <th>各仿真评分</th>
          <th>加权总分</th>
        </tr>
      </thead>
      <tbody>
        {plans.map((p) => (
          <tr key={p.planId} data-testid={`plan-${p.planId}`} data-selected={String(p.selected)}>
            <td>
              {p.planName}
              {p.selected ? '（择优）' : ''}
            </td>
            <td>{p.scores.map((s) => `${s.simulator}:${s.score}`).join(' ')}</td>
            <td data-testid={`weighted-${p.planId}`}>{p.weighted}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
