import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { Platform } from './platform.ts'
import type { AgentSeatContextSync } from './types.ts'

const ACTIONS = [
  'knowledge.read',
  'message.send',
  'message.cross_group',
  'task.dispatch',
  'workflow.propose_change',
  'workflow.approve_change',
  'plan.submit',
  'plan.approve',
  'simulation.run',
  'plan.dispatch',
  'seat.assign',
] as const

type PermissionAction = typeof ACTIONS[number]

interface PermissionDecision {
  action: string
  seatId: string
  allowed: boolean
  reason: string
  source: string
}

export class AgentSeatBridge {
  private readonly sessions =
    new Map<string, AgentSeatContextSync>()

  constructor(
    private readonly ctx: Context,
    private readonly platform: Platform,
  ) {
    this.installPromptContext()
    this.installPermissionTool()
  }

  sync(input: AgentSeatContextSync): void {
    // 不信任浏览器传来的角色字段，席位身份以 Host 配置为准。
    const seat = this.platform.org.getSeat(input.seatId)
    const activity =
      this.platform.org.getActivity(input.activityId)

    this.sessions.set(input.sessionId, {
      ...input,
      activityName: activity.name,
      seatName: seat.name,
      roleId: seat.role.id,
      roleName: seat.role.name,
      clearance: seat.clearance,
      canDispatch: seat.can_dispatch,
      canApprove: seat.can_approve,
    })
  }

  private contextForAgent(agent: unknown):
    AgentSeatContextSync | undefined {
    const id =
      (agent as any)?.session?.id

    if (id === undefined) return undefined

    return this.sessions.get(String(id))
  }

  private installPromptContext(): void {
    this.ctx.systemPrompt.context({
      name: 'wargame-seat-context',
      order: 125,

      text: (assembly) => {
        const current =
          this.contextForAgent(
            (assembly as any).agent,
          )

        if (!current) {
          return ''
        }

        const seat =
          this.platform.org.getSeat(
            current.seatId,
          )

        const skills =
          this.platform.registry
            .availableSkills({
              id: seat.role.id,
              clearance: seat.clearance,
              packs: seat.packs,
              skill_allow: seat.skill_allow,
            })
            .map((s) => s.name)

        const knowledge =
          this.platform.kb
            .visibleDocuments({
              id: seat.role.id,
              clearance: seat.clearance,
            })
            .map((d) => `${d.title}(C${d.clearance})`)

        return [
          '【当前推演席位上下文】',
          `用户：${current.userName} (${current.userId})`,
          `活动：${current.activityName} (${current.activityId})`,
          `席位：${current.seatName} (${current.seatId})`,
          `角色：${current.roleName} (${current.roleId})`,
          `密级：C${current.clearance}`,
          `基础分派权：${current.canDispatch ? '有' : '无'}`,
          `基础审批权：${current.canApprove ? '有' : '无'}`,
          `当前角色可用技能：${skills.length > 0 ? skills.join('、') : '无'}`,
          `当前角色可见知识：${knowledge.length > 0 ? knowledge.join('、') : '无'}`,
          '',
          '强制规则：',
          '1. 你的业务身份就是以上当前席位，不得自行提升或假设其他席位身份。',
          '2. 涉及业务动作权限时，必须调用 wargame_permission_check 获取实时 PermissionEngine 决策。',
          '3. PermissionEngine 返回 denied 时，不得声称已执行或可以绕过。',
          '4. 临时授权可能改变结果，因此不得仅根据基础角色猜测权限。',
        ].join('\n')
      },
    })
  }

  private installPermissionTool(): void {
    const bridge = this
    this.ctx.tools.register(
      defineTool({
        name: 'wargame_permission_check',

        description:
          'Check whether the CURRENT wargame seat may perform a controlled business action. '
          + 'This calls the real ty-platform PermissionEngine and includes active temporary grants. '
          + 'Use it before claiming permission for controlled actions.',

        parameters: {
          action: {
            type: 'string',
            required: true,
            enum: [...ACTIONS],
            description:
              'Business action to authorize.',
          },

          target_group_id: {
            type: 'string',
            description:
              'Target task-group id when the permission is group-scoped.',
          },

          resource_id: {
            type: 'string',
            description:
              'Resource id when the permission is resource-scoped.',
          },

          resource_clearance: {
            type: 'number',
            description:
              'Required clearance of the resource when applicable.',
          },
        },

        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: {
                type: 'string',
                required: true,
              },
              seatId: {
                type: 'string',
                required: true,
              },
              allowed: {
                type: 'boolean',
                required: true,
              },
              reason: {
                type: 'string',
                required: true,
              },
              source: {
                type: 'string',
                required: true,
              },
            },
          },

          render: (_args, value) => [{
            type: 'text',
            text:
              `PermissionEngine: ${value.action} = `
              + `${value.allowed ? 'ALLOWED' : 'DENIED'}; `
              + `seat=${value.seatId}; `
              + `source=${value.source}; `
              + `reason=${value.reason}`,
          }],
        },

        async execute(args, exec) {
          const current =
            bridge.contextForAgent(
              (exec as any).agent,
            )

          if (!current) {
            throw new Error(
              '当前 Agent 尚未绑定推演席位，请刷新页面后重试。',
            )
          }

          const response = await fetch(
            'http://127.0.0.1:8787/api/permissions/check',
            {
              method: 'POST',

              headers: {
                authorization:
                  `Bearer ${current.token}`,
                'content-type':
                  'application/json',
                'x-seat-id':
                  current.seatId,
                'x-activity-id':
                  current.activityId,
              },

              body: JSON.stringify({
                action:
                  args.action as PermissionAction,

                ...(args.target_group_id
                  ? {
                      targetGroupId:
                        args.target_group_id,
                    }
                  : {}),

                ...(args.resource_id
                  ? {
                      resourceId:
                        args.resource_id,
                    }
                  : {}),

                ...(args.resource_clearance !== undefined
                  ? {
                      resourceClearance:
                        args.resource_clearance,
                    }
                  : {}),
              }),

              signal: exec.signal,
            },
          )

          const data =
            await response.json() as
              PermissionDecision & {
                error?: string
                message?: string
              }

          if (!response.ok) {
            throw new Error(
              data.message ??
              data.error ??
              `Permission API ${response.status}`,
            )
          }

          return data
        },
      }),
    )
  }
}



