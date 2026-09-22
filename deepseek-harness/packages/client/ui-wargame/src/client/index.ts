/** Wargaming console plugin, browser half. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `sidebar.footer.action` SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the `shell.overlay` SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the `conversation.input.left` SlotMap entry (composer
// toolbar left slot owned by ui-conversation's InputBar).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the `remote.skills` RPC merge for the real skill catalog
// (the `skills` Remote namespace is provided by the Session controller).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { WargameTrigger } from './WargameTrigger.tsx'
import { WargameOverlay } from './WargameOverlay.tsx'
import { SkillAttachButton } from './views/SkillAttachButton.tsx'
import { SkillInjectorSlot } from './views/SkillInjectorSlot.tsx'
import {
  createConsoleStore, skillCatalog, knowledgeCatalog, setConsoleActions, getConsoleActions,
  type ConsoleActions,
} from './engine.ts'
import { en, zh, type WargameKey } from './locales.ts'

export type { WargameKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    wargame: WargameKey
  }
}

const NS = 'wargame'

export const inject = ['slots', 'locale', 'sessions', 'remote', 'remote.skills', 'remote.wargame']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-wargame: dictionaries')

  // Root-scope store handle: shared by the sidebar trigger and the shell
  // overlay (the framework caches ONE root instance for this handle).
  const handle = createConsoleStore()

  // 推演技能目录：跟随当前登录席位角色加载。
  skillCatalog.reload = async () => {
    const actions = getConsoleActions()

    try {
      const seatId =
        sessionStorage.getItem(
          'ty.harness.business.LOGIN_SEAT_V2',
        )

      if (!seatId) {
        actions.setRealSkills([])
        return
      }

      const seats =
        await ctx.remote.wargame.listSeats()

      if (!seats.ok) {
        actions.setRealSkills([])
        return
      }

      const seat =
        seats.value.find(
          (s) => s.id === seatId,
        )

      if (!seat) {
        actions.setRealSkills([])
        return
      }

      const result =
        await ctx.remote.wargame.listSkills({
          roleId: seat.roleId,
        })

      if (!result.ok) {
        actions.setRealSkills([])
        return
      }

      actions.setRealSkills(
        result.value.map((skill) => ({
          name: skill.name,
          description: skill.description,
          modelInvocable: true,
        })),
      )
    } catch {
      actions.setRealSkills([])
    }
  }

  knowledgeCatalog.reload = async (roleId: string) => {
    const actions = getConsoleActions()

    actions.loadKnowledge([])

    try {
      const knowledge =
        await ctx.remote.wargame.listKnowledge({ roleId })

      if (knowledge.ok) {
        actions.loadKnowledge(
          knowledge.value.map((d) => ({
            id: d.id,
            title: d.title,
            content: d.content,
            clearance: d.clearance,
            allow: [],
            deny: [],
          })),
        )
      }
    } catch {
      actions.loadKnowledge([])
    }
  }
  // Load real platform data from the host `wargame` Remote namespace into the
  // console store (seats / activities / knowledge / simulators).
  const loadRemoteData = async (actions: ConsoleActions): Promise<void> => {
    try {
      const seats = await ctx.remote.wargame.listSeats()
      if (seats.ok) {
        actions.loadSeats(seats.value.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status === 'awaiting' ? 'waiting_approval' : s.status,
        })))
      }
      const activities = await ctx.remote.wargame.listActivities()
      if (activities.ok) {
        actions.loadActivities(activities.value.map((a) => ({ id: a.id, name: a.name })))
      }
      const simulators = await ctx.remote.wargame.listSimulators()
      if (simulators.ok) {
        actions.loadSimulators(simulators.value.map((m) => ({
          id: m.id,
          name: m.name,
          connected: true,
          weight: m.weight,
        })))
      }
    } catch {
      // A failed fetch leaves the store on its previous (possibly empty) data.
    }
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'wargame',
    order: 100,
    locale: NS,
    store: handle,
    // Capture the root instance's baked actions so session-scope entries can
    // drive the same console store through getConsoleActions().
    inject: (actions: unknown) => {
      const baked = actions as ConsoleActions
      setConsoleActions(baked)
      void loadRemoteData(baked)
      return {}
    },
  }, WargameTrigger))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'wargame',
    order: 0,
    locale: NS,
    store: handle,
  }, WargameOverlay))

  // Conversation-composer left toolbar: a silent bridge that captures the
  // session-scoped `inputActions` (so the root-scope skill cards can drive
  // the composer draft), then the dedicated sword "add skill" button.
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'wargame-skill-bridge',
    order: 90,
    locale: NS,
  }, SkillInjectorSlot))

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'wargame-skill',
    order: 100,
    locale: NS,
  }, SkillAttachButton))
}


