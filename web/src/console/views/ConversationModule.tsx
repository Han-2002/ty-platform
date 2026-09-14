/** Conversation list: click selects the active conversation. */
import type { ConsoleModuleProps } from '../modules'
import type { ConversationType } from '../types'
import css from './console.module.css'

const TYPE_LABEL: Record<ConversationType, 'conversation.group' | 'conversation.direct'> = {
  group: 'conversation.group',
  direct: 'conversation.direct',
}

export function ConversationModule({ state, actions, t }: ConsoleModuleProps) {
  if (state.conversations.length === 0) {
    return <p className={css.empty}>暂无会话</p>
  }
  return (
    <ul className={css.list}>
      {state.conversations.map((c) => {
        const active = state.activeConversationId === c.id
        return (
          <li key={c.id} className={css.listItem} data-type={c.type}>
            <button
              type="button"
              className={css.button}
              onClick={() => { actions.selectConversation(active ? null : c.id) }}
              aria-pressed={active}
            >
              {active ? '✓ ' : ''}{c.name}
            </button>
            <span className={css.badge}>{t(TYPE_LABEL[c.type])}</span>
          </li>
        )
      })}
    </ul>
  )
}
