/** Skill manager: the platform skill directory, as clickable cards. Each card
 *  shows the skill's name + description with a top-right "+" that appends
 *  `/<name> ` to the console instruction draft (and jumps to the activity
 *  module so the operator sees it). Clicking the card body opens a detail panel. */
import { useState } from 'react'
import type { ConsoleModuleProps } from '../modules'
import css from './console.module.css'

export function SkillModule({ state, actions, t }: ConsoleModuleProps) {
  const realSkills = state.realSkills ?? []
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const selected = selectedName === null
    ? null
    : realSkills.find((s) => s.name === selectedName) ?? null

  const addSkill = (name: string): void => {
    actions.appendDraft(`/${name} `)
    actions.selectModule('activity')
  }

  return (
    <div>
      {realSkills.length === 0 ? (
        <p className={css.empty}>{t('skill.empty')}</p>
      ) : (
        <div className={css.skillGrid}>
          {realSkills.map((skill) => (
            <article
              key={skill.name}
              className={css.skillCard}
              role="button"
              tabIndex={0}
              onClick={() => { setSelectedName(skill.name) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedName(skill.name)
                }
              }}
              aria-label={skill.name}
            >
              <button
                type="button"
                className={css.skillAddBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  addSkill(skill.name)
                }}
                aria-label={t('skill.addToComposer')}
                title={t('skill.addToComposer')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M7 1.5v11M1.5 7h11" />
                </svg>
              </button>
              <div className={css.skillIcon} aria-hidden>{iconFor(skill.name)}</div>
              <div className={css.skillBody}>
                <div className={css.skillName}>{skill.name}</div>
                <div className={css.skillDesc}>
                  {skill.description}
                  {!skill.modelInvocable && <span className={css.itemMeta}> · {t('skill.userOnly')}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {selected !== null && (
        <div
          className={css.skillDetailBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={selected.name}
          onClick={() => { setSelectedName(null) }}
        >
          <div className={css.skillDetailPanel} onClick={(e) => { e.stopPropagation() }}>
            <header className={css.skillDetailHeader}>
              <div className={css.skillIcon} aria-hidden style={{ fontSize: 28 }}>{iconFor(selected.name)}</div>
              <div className={css.skillDetailTitleWrap}>
                <h3 className={css.skillName}>{selected.name}</h3>
                {!selected.modelInvocable && <span className={css.itemMeta}>{t('skill.userOnly')}</span>}
              </div>
              <button
                type="button"
                className={css.close}
                onClick={() => { setSelectedName(null) }}
                aria-label={t('view.close')}
              >×</button>
            </header>
            <div className={css.skillDetailBody}>
              <p>{selected.description}</p>
            </div>
            <footer className={css.skillDetailFooter}>
              <button
                type="button"
                className={css.button}
                onClick={() => {
                  addSkill(selected.name)
                  setSelectedName(null)
                }}
              >
                {t('skill.addToComposer')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

/** Stable emoji icon picked from the skill name. */
function iconFor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('excel') || name.includes('表格')) return '📊'
  if (lower.includes('wecom') || name.includes('企业微信') || name.includes('wechat')) return '💬'
  if (name.includes('周报') || lower.includes('weekly') || lower.includes('report')) return '📝'
  if (lower.includes('book') || name.includes('书') || lower.includes('writer')) return '✍️'
  if (lower.includes('minimax') || lower.includes('prompt') || name.includes('提示词')) return '✨'
  if (lower.includes('search') || name.includes('搜索')) return '🔍'
  return '🧩'
}
