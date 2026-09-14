/** Knowledge access: role switcher + real clearance/deny filtering. */
import { engineHelpers } from '../store'
import type { ConsoleModuleProps } from '../modules'
import css from './console.module.css'

export function KnowledgeModule({ state, actions, t }: ConsoleModuleProps) {
  const visible = state.knowledge.filter((d) => engineHelpers.canView(state.currentRoleId, d))
  return (
    <div>
      <div className={css.field}>
        <select
          className={css.select}
          value={state.currentRoleId}
          onChange={(e) => { actions.setRole(e.target.value) }}
          aria-label={t('knowledge.role')}
        >
          {engineHelpers.allRoles().map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <p className={css.itemMeta}>{t('knowledge.role')}：{state.currentRoleId}</p>
      {visible.length === 0 ? (
        <p className={css.empty}>{t('knowledge.empty')}</p>
      ) : (
        <ul className={css.list}>
          {visible.map((d) => (
            <li key={d.id} className={css.listItem}>
              <span>{d.title}</span>
              <span className={css.itemMeta}>c{d.clearance}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
