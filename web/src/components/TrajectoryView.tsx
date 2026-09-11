import type { TrajectoryStep, RuntimeMetrics } from '../types.js';

export function TrajectoryView({ steps }: { steps: TrajectoryStep[] }) {
  return (
    <ol data-testid="trajectory-view">
      {steps.map((s) => (
        <li key={s.step}>
          {s.step}. {s.action}
        </li>
      ))}
    </ol>
  );
}

export function RuntimeMetrics({ metrics }: { metrics: RuntimeMetrics }) {
  return (
    <dl data-testid="runtime-metrics">
      <dt>turns</dt>
      <dd data-testid="metric-turns">{metrics.turns}</dd>
      <dt>steps</dt>
      <dd data-testid="metric-steps">{metrics.steps}</dd>
      <dt>TTFT</dt>
      <dd data-testid="metric-ttft">{metrics.ttft}</dd>
      <dt>tokens</dt>
      <dd data-testid="metric-tokens">{metrics.tokens}</dd>
      <dt>上下文占用</dt>
      <dd data-testid="metric-context">{metrics.contextUsage}</dd>
    </dl>
  );
}
