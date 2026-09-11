/** Activity selection + composer with a bottom-left "+" attachment menu
 *  (local file upload, jump to skills module). */
import { useEffect, useRef, useState } from 'react'
import type { ConsoleModuleProps } from '../modules.ts'
import css from './console.module.css'

export function ActivityModule({ state, actions, t }: ConsoleModuleProps) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const disabled = state.currentActivityId === null
  const canSend = !disabled && text.trim() !== ''

  useEffect(() => {
    if (!menuOpen) return
    const onDocDown = (e: MouseEvent): void => {
      if (containerRef.current === null) return
      if (!containerRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => { document.removeEventListener('mousedown', onDocDown) }
  }, [menuOpen])

  return (
    <div>
      <div className={css.field}>
        <select
          className={css.select}
          value={state.currentActivityId ?? ''}
          onChange={(e) => { actions.selectActivity(e.target.value || null) }}
          aria-label={t('module.activity')}
        >
          <option value="" disabled>
            {t('activity.placeholder')}
          </option>
          {state.activities.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div className={css.composer} ref={containerRef}>
        <textarea
          className={css.composerTextarea}
          value={text}
          onChange={(e) => { setText(e.target.value) }}
          disabled={disabled}
          placeholder={disabled ? t('activity.composer.disabled') : t('activity.composer.placeholder')}
        />
        <div className={css.composerBar}>
          <button
            type="button"
            className={css.attachButton}
            disabled={disabled}
            onClick={() => { setMenuOpen((v) => !v) }}
            aria-label={t('composer.attach')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            +
          </button>
          <span className={css.spacer} />
          <button
            type="button"
            className={css.button}
            disabled={!canSend}
            onClick={() => {
              actions.sendInstruction(text.trim())
              setText('')
            }}
          >
            派发指令
          </button>
        </div>
        {menuOpen && (
          <div className={css.attachMenu} role="menu">
            <button
              type="button"
              className={css.attachItem}
              role="menuitem"
              onClick={() => { fileInputRef.current?.click() }}
            >
              <span className={css.attachItemIcon} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9.5 3.5L5 8a2.121 2.121 0 003 3l5-5a3.536 3.536 0 00-5-5l-5.5 5.5a5 5 0 007 7l5.5-5.5" />
                </svg>
              </span>
              <span className={css.attachItemLabel}>{t('menu.uploadFile')}</span>
              <span className={css.attachItemChevron} aria-hidden="true">›</span>
            </button>
            <input
              ref={fileInputRef}
              className={css.fileInput}
              type="file"
              multiple
              onChange={(e) => {
                const files = e.target.files
                if (files === null) return
                for (const f of Array.from(files)) {
                  actions.uploadSkill(f.name)
                }
                e.target.value = ''
                setMenuOpen(false)
              }}
            />
            <button
              type="button"
              className={css.attachItem}
              role="menuitem"
              onClick={() => {
                actions.selectModule('skills')
                setMenuOpen(false)
              }}
            >
              <span className={css.attachItemIcon} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" />
                </svg>
              </span>
              <span className={css.attachItemLabel}>{t('menu.addSkill')}</span>
              <span className={css.attachItemChevron} aria-hidden="true">›</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
