/** Execution trajectory: real log of engine actions. */
import type { ConsoleModuleProps } from '../modules'
import css from './console.module.css'

export function TrajectoryModule({ state, t }: ConsoleModuleProps) {
  if (state.trajectory.length === 0) {
    return <p className={css.empty}>{t('trajectory.empty')}</p>
  }
  return (
    <ul className={css.list}>
      {state.trajectory.map((step) => (
        <li key={step.step} className={css.listItem}>
          <span>{step.action}</span>
          <span className={css.itemMeta}>#{step.step}</span>
        </li>
      ))}
    </ul>
  )
}
