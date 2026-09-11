/** Conversation-composer "+" toolbar: a dedicated circular "add skill" button
 *  (sword icon). Session-scoped entry — it drives the shared console store via
 *  getConsoleActions() (the root store instance captured at the sidebar trigger). */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { getConsoleActions, skillCatalog } from '../engine.ts'
import css from './console.module.css'

export type SkillAttachButtonProps =
  PropsRuntime<'conversation.input.left'>
  & PropsLocale<'wargame'>

export function SkillAttachButton({ t }: SkillAttachButtonProps) {
  return (
    <button
      type="button"
      className={css.attachButton}
      onClick={() => {
        void skillCatalog.reload()
        const actions = getConsoleActions()
        actions.open()
        actions.selectModule('skills')
      }}
      aria-label={t('menu.addSkill')}
      title={t('menu.addSkill')}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 2L5 8v2l-1 1 1 1 1-1h2l6-6-1-1-1-1-1-1z" />
        <path d="M5 10l-2 2" />
        <path d="M4 11l1 1" />
      </svg>
    </button>
  )
}
