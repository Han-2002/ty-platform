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
  createConsoleStore,
  skillCatalog,
  knowledgeCatalog,
  setConsoleActions,
  getConsoleActions,
  type ConsoleActions,
} from './engine.ts'

import { en, zh, type WargameKey } from './locales.ts'
import {
  getBusinessSession,
  businessApi,
  type ConsoleSession,
} from './views/businessApi.ts'

export type { WargameKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    wargame: WargameKey
  }
}

const NS = 'wargame'

const LOGIN_SEAT_KEY =
  'ty.harness.business.LOGIN_SEAT_V2'

export const inject = [
  'slots',
  'locale',
  'sessions',
  'remote',
  'remote.skills',
  'remote.wargame',
]

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'ui-wargame: dictionaries',
  )

  // Root-scope store handle: shared by the sidebar trigger and the shell
  // overlay (the framework caches ONE root instance for this handle).
  const handle = createConsoleStore()

  // --------------------------------------------------------------------------
  // Skill catalog
  // --------------------------------------------------------------------------

  // 推演技能目录：跟随当前登录席位角色加载。
  skillCatalog.reload = async () => {
    const actions = getConsoleActions()

    try {
      const seatId =
        sessionStorage
          .getItem(LOGIN_SEAT_KEY)
          ?.trim()

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
    } catch (error) {
      console.error(
        '[wargame-skill] reload FAILED',
        error,
      )

      actions.setRealSkills([])
    }
  }

  // --------------------------------------------------------------------------
  // Knowledge catalog
  // --------------------------------------------------------------------------

  knowledgeCatalog.reload =
    async (roleId: string) => {
      const actions = getConsoleActions()

      actions.loadKnowledge([])

      try {
        const knowledge =
          await ctx.remote.wargame.listKnowledge({
            roleId,
          })

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
      } catch (error) {
        console.error(
          '[wargame-knowledge] reload FAILED',
          error,
        )

        actions.loadKnowledge([])
      }
    }

  // --------------------------------------------------------------------------
  // Agent <-> current wargame seat binding
  // --------------------------------------------------------------------------

  let lastSeatSyncKey = ''
  let seatSyncRunning = false

  /**
   * Resolve the business session actually selected in the UI.
   *
   * getBusinessSession() provides the authenticated business token and its
   * default assignment.  LOGIN_SEAT_V2 is the seat selected by the user from
   * the top-right "切换席位" UI.  When present it must win, otherwise the Agent
   * could keep using the default assignment after the human changes seats.
   */
  const currentBusinessSession =
    async (): Promise<ConsoleSession> => {
      const business =
        await getBusinessSession()

      const selectedSeatId =
        sessionStorage
          .getItem(LOGIN_SEAT_KEY)
          ?.trim()

      if (
        !selectedSeatId ||
        selectedSeatId === business.seatId
      ) {
        return business
      }

      return {
        ...business,
        seatId: selectedSeatId,
      }
    }

  /**
   * Bind the currently visible Harness session to the currently selected
   * ty-platform seat.
   *
   * Security note:
   * Browser data is NOT treated as authoritative for role/clearance.
   * /api/agent-context resolves those fields on the 8787 business backend.
   */
  const syncAgentSeatContext =
    async (): Promise<void> => {
      if (seatSyncRunning) return

      const sessionId =
        ctx.sessions.list
          .getSnapshot()
          .current

      if (sessionId === undefined) {
        console.debug(
          '[wargame-seat] no current Harness session yet',
        )
        return
      }

      seatSyncRunning = true

      try {
        const business =
          await currentBusinessSession()

        console.debug(
          '[wargame-seat] resolving business seat',
          {
            sessionId: String(sessionId),
            requestedSeatId: business.seatId,
            activityId: business.activityId,
          },
        )

        const current =
          await businessApi<{
            userId: string
            userName: string

            activityId: string
            activityName: string

            seatId: string
            seatName: string

            roleId: string
            roleName: string

            clearance: number
            canDispatch: boolean
            canApprove: boolean
          }>(
            business,
            '/api/agent-context',
          )

        const syncKey = [
          String(sessionId),
          current.userId,
          current.activityId,
          current.seatId,
          current.roleId,
          String(current.clearance),
        ].join('|')

        if (syncKey === lastSeatSyncKey) {
          return
        }

        console.info(
          '[wargame-seat] syncing',
          {
            sessionId: String(sessionId),
            userId: current.userId,

            activityId: current.activityId,
            activityName: current.activityName,

            seatId: current.seatId,
            seatName: current.seatName,

            roleId: current.roleId,
            roleName: current.roleName,

            clearance: current.clearance,
          },
        )

        await (ctx.remote.wargame as any)
          .setAgentSeatContext({
            sessionId: String(sessionId),

            // Required by AgentSeatBridge for the subsequent
            // PermissionEngine request.
            token: business.token,

            ...current,
          })

        lastSeatSyncKey = syncKey

        console.info(
          '[wargame-seat] synced OK',
          {
            sessionId: String(sessionId),
            seatId: current.seatId,
            seatName: current.seatName,
            roleId: current.roleId,
          },
        )
      } catch (error) {
        // Never swallow this failure.  An invisible failure would leave the
        // Agent unbound while the UI misleadingly shows an active seat.
        lastSeatSyncKey = ''

        console.error(
          '[wargame-seat] sync FAILED',
          error,
        )
      } finally {
        seatSyncRunning = false
      }
    }

  ctx.effect(() => {
    // 1. Session navigation / creation.
    const disposeSessions =
      ctx.sessions.list.subscribe(() => {
        lastSeatSyncKey = ''
        void syncAgentSeatContext()
      })

    // 2. Seat switch is currently persisted through sessionStorage.
    //    Same-document sessionStorage updates do not reliably emit a storage
    //    event, therefore poll cheaply for the selected seat.
    let observedSeatId =
      sessionStorage
        .getItem(LOGIN_SEAT_KEY)
        ?.trim() ?? ''

    const timer =
      window.setInterval(() => {
        const nextSeatId =
          sessionStorage
            .getItem(LOGIN_SEAT_KEY)
            ?.trim() ?? ''

        if (nextSeatId !== observedSeatId) {
          console.info(
            '[wargame-seat] selected seat changed',
            {
              from: observedSeatId,
              to: nextSeatId,
            },
          )

          observedSeatId = nextSeatId
          lastSeatSyncKey = ''

          void skillCatalog.reload()
        }

        // Also serves as startup/reconnect retry.
        void syncAgentSeatContext()
      }, 1500)

    // 3. Returning to the browser tab should re-check binding.
    const onFocus = (): void => {
      lastSeatSyncKey = ''
      void syncAgentSeatContext()
    }

    const onVisibilityChange = (): void => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        lastSeatSyncKey = ''
        void syncAgentSeatContext()
      }
    }

    window.addEventListener(
      'focus',
      onFocus,
    )

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    )

    // Initial attempt.
    void syncAgentSeatContext()

    return () => {
      disposeSessions()

      window.clearInterval(timer)

      window.removeEventListener(
        'focus',
        onFocus,
      )

      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      )
    }
  }, 'ui-wargame: agent seat context')

  // --------------------------------------------------------------------------
  // Load real platform data
  // --------------------------------------------------------------------------

  const loadRemoteData =
    async (
      actions: ConsoleActions,
    ): Promise<void> => {
      try {
        const seats =
          await ctx.remote.wargame.listSeats()

        if (seats.ok) {
          actions.loadSeats(
            seats.value.map((s) => ({
              id: s.id,
              name: s.name,
              status:
                s.status === 'awaiting'
                  ? 'waiting_approval'
                  : s.status,
            })),
          )
        }

        const activities =
          await ctx.remote.wargame
            .listActivities()

        if (activities.ok) {
          actions.loadActivities(
            activities.value.map((a) => ({
              id: a.id,
              name: a.name,
            })),
          )
        }

        const simulators =
          await ctx.remote.wargame
            .listSimulators()

        if (simulators.ok) {
          actions.loadSimulators(
            simulators.value.map((m) => ({
              id: m.id,
              name: m.name,
              connected: true,
              weight: m.weight,
            })),
          )
        }
      } catch (error) {
        console.error(
          '[wargame] loadRemoteData FAILED',
          error,
        )

        // A failed fetch leaves the store on its previous
        // (possibly empty) data.
      }
    }

  // --------------------------------------------------------------------------
  // Sidebar trigger
  // --------------------------------------------------------------------------

  ctx.slots.inject(
    'sidebar.footer.action',
    () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'wargame',
      order: 100,
      locale: NS,
      store: handle,

      // Capture the root instance's baked actions so session-scope entries can
      // drive the same console store through getConsoleActions().
      inject: (actions: unknown) => {
        const baked =
          actions as ConsoleActions

        setConsoleActions(baked)

        void loadRemoteData(baked)
        void skillCatalog.reload()
        void syncAgentSeatContext()

        return {}
      },
    }, WargameTrigger),
  )

  // --------------------------------------------------------------------------
  // Overlay
  // --------------------------------------------------------------------------

  ctx.slots.inject(
    'shell.overlay',
    () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'wargame',
      order: 0,
      locale: NS,
      store: handle,
    }, WargameOverlay),
  )

  // --------------------------------------------------------------------------
  // Conversation composer integrations
  // --------------------------------------------------------------------------

  // Silent bridge: captures the session-scoped inputActions so root-scope
  // skill cards can drive the composer draft.
  ctx.slots.inject(
    'conversation.input.left',
    () => ctx.slots.register({
      name: 'conversation.input.left',
      id: 'wargame-skill-bridge',
      order: 90,
      locale: NS,
    }, SkillInjectorSlot),
  )

  // Dedicated sword "add skill" button.
  ctx.slots.inject(
    'conversation.input.left',
    () => ctx.slots.register({
      name: 'conversation.input.left',
      id: 'wargame-skill',
      order: 100,
      locale: NS,
    }, SkillAttachButton),
  )
}
