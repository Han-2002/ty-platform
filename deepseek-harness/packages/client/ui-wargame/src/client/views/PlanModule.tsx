/** Plan comparison: generate 2 plans via CONNECTED mcp services, weighted score, dispatch. */
import { useState } from 'react'
import type { ConsoleModuleProps } from '../modules.ts'
import css from './console.module.css'

export function PlanModule({ state, actions, t }: ConsoleModuleProps) {
  const [notice, setNotice] = useState('')
  if (state.plans.length === 0) {
    return (
      <div>
        <p className={css.empty}>暂无候选方案</p>
        <div className={css.row} style={{ marginTop: 8 }}>
          <button type="button" className={css.button} onClick={() => { window.setTimeout(() => actions.generatePlans(), 0) }}>
            生成方案
          </button>
        </div>
      </div>
    )
  }
  const selected = state.plans.find((p) => p.selected)
  return (
    <div>
      <table className={css.table}>
        <thead>
          <tr>
            <th>{t('plan.name')}</th>
            <th>{t('plan.scores')}</th>
            <th>{t('plan.weighted')}</th>
          </tr>
        </thead>
        <tbody>
          {state.plans.map((p) => (
            <tr key={p.planId} data-selected={String(p.selected)}>
              <td>
                {p.planName}
                {p.selected ? `（${t('plan.selected')}）` : ''}
                {p.dispatched ? ' · 已下发' : ''}
              </td>
              <td>{p.scores.map((s) => `${s.simulator}:${s.score}`).join(' ')}</td>
              <td>{p.weighted}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={css.row} style={{ marginTop: 8 }}>
        <button
          type="button"
          className={css.button}
          disabled={selected === undefined || selected.dispatched}
          onClick={() => { actions.confirmSelectedPlan() }}
        >
          下发择优方案
        </button>
        <button type="button" className={css.button} onClick={() => { window.setTimeout(() => actions.generatePlans(), 0) }}>
          重新生成
        </button>
      </div>
    </div>
  )
}


