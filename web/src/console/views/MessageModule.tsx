/** Global message stream: instruction / report / proactive. */
import type { ConsoleModuleProps } from '../modules'
import type { MessageType } from '../types'
import css from './console.module.css'

const TYPE_LABEL: Record<MessageType, 'msg.instruction' | 'msg.report' | 'msg.proactive'> = {
  instruction: 'msg.instruction',
  report: 'msg.report',
  proactive: 'msg.proactive',
}

export function MessageModule({ state, t }: ConsoleModuleProps) {
  if (state.messages.length === 0) {
    return <p className={css.empty}>暂无消息</p>
  }
  return (
    <ul className={css.list}>
      {state.messages.map((m) => (
        <li key={m.id} className={css.listItem} data-type={m.type}>
          <span>
            {m.from}：{m.content}
          </span>
          <span className={css.badge}>{t(TYPE_LABEL[m.type])}</span>
        </li>
      ))}
    </ul>
  )
}
