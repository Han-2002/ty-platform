/** Runtime metrics: real counters derived from engine activity. */
import type { ConsoleModuleProps } from '../modules.ts'
import css from './console.module.css'

export function MetricsModule({ state, t }: ConsoleModuleProps) {
  const m = state.metrics
  return (
    <dl className={css.metrics}>
      <dt>{t('metric.turns')}</dt><dd>{m.turns}</dd>
      <dt>{t('metric.steps')}</dt><dd>{m.steps}</dd>
      <dt>{t('metric.ttft')}</dt><dd>{m.ttft} ms</dd>
      <dt>{t('metric.tokens')}</dt><dd>{m.tokens}</dd>
      <dt>{t('metric.context')}</dt><dd>{(m.contextUsage * 100).toFixed(0)}%</dd>
    </dl>
  )
}
