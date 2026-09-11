/** Session-scoped bridge: silently captures the current session's
 *  `inputActions.setDraft` so the root-scope skill cards in the console can
 *  insert `/<skill> ` into the active composer. Renders nothing. */
import { useEffect } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { setAddSkillToDraft } from '../engine.ts'

export type SkillInjectorSlotProps =
  PropsRuntime<'conversation.input.left'>

export function SkillInjectorSlot(props: SkillInjectorSlotProps) {
  // PropsRuntime does not publicly declare `inputActions`; it is supplied by
  // the session standard kit at render time. Reach it through the standard
  // prop name and cast to the shape the slot registers.
  const { inputActions } = props as unknown as {
    inputActions: { setDraft: (text: string) => void }
  }
  useEffect(() => {
    setAddSkillToDraft((name: string) => {
      inputActions.setDraft(`/${name} `)
    })
  }, [inputActions])
  return null
}
