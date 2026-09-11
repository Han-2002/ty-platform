/** MCP service manager: real start/stop toggles connection; affects plan generation. */
import type { ConsoleModuleProps } from '../modules.ts'
import css from './console.module.css'

export function McpModule({ state, actions, t }: ConsoleModuleProps) {
  return (
    <ul className={css.list}>
      {state.mcpServices.map((s) => (
        <li key={s.id} className={css.listItem} data-connected={String(s.connected)}>
          <span>
            {s.name}
            <span className={css.itemMeta}>
              （{s.connected ? t('mcp.connected') : t('mcp.disconnected')} · 权重 {s.weight}）
            </span>
          </span>
          <button
            type="button"
            className={css.button}
            onClick={() => { actions.setMcpConnected(s.id, !s.connected) }}
          >
            {s.connected ? t('mcp.stop') : t('mcp.start')}
          </button>
        </li>
      ))}
    </ul>
  )
}
