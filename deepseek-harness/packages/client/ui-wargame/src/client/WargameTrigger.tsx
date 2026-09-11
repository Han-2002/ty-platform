/** Sidebar-footer menu entry: opens the console through the engine's `open` action. */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createConsoleStore } from './engine.ts'
import css from './WargameTrigger.module.css'

export type WargameTriggerProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsStore<ReturnType<typeof createConsoleStore>>
  & PropsLocale<'wargame'>

export function WargameTrigger({ wide, actions, t }: WargameTriggerProps) {
  return (
    <button
      type="button"
      className={css.trigger}
      onClick={actions.open}
      aria-label={t('menu.trigger')}
      title={t('menu.trigger')}
    >
      {wide ? t('menu.trigger') : t('menu.trigger.short')}
    </button>
  )
}
