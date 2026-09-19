import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConsoleModuleProps } from '../modules'
import { businessApi, errorText } from './businessApi'
import css from './console.module.css'

interface TaskGroup {
  id: string
  name: string
  mode: 'hierarchical' | 'peer'
  memberSeatIds: string[]
  leaderSeatId?: string
}
interface WorkflowStep {
  id: string
  key: string
  name: string
  actorRule: 'leader' | 'member' | 'any'
  status: 'pending' | 'active' | 'completed'
}
interface Workflow {
  id: string
  groupId: string
  activityId: string
  template: string
  status: 'running' | 'completed'
  steps: WorkflowStep[]
  updatedAt: number
}
interface Proposal {
  id: string
  workflowId: string
  proposedBySeatId: string
  reason: string
  change:
    | { type: 'insert_step'; afterStepKey: string; name: string; actorRule?: string }
    | { type: 'backtrack'; targetStepKey: string }
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

export function WorkflowModule({ session }: ConsoleModuleProps) {
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const reload = useCallback(async () => {
    try {
      const [g, w, p] = await Promise.all([
        businessApi<TaskGroup[]>(session, `/api/task-groups?activityId=${encodeURIComponent(session.activityId)}`),
        businessApi<Workflow[]>(session, `/api/workflows?activityId=${encodeURIComponent(session.activityId)}`),
        businessApi<Proposal[]>(session, `/api/workflow-proposals?activityId=${encodeURIComponent(session.activityId)}`),
      ])
      setGroups(g)
      setWorkflows(w)
      setProposals(p)
      setError('')
    } catch (e) {
      setError(errorText(e))
    }
  }, [session])

  useEffect(() => { void reload() }, [reload])

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  async function post(path: string, body: unknown = {}) {
    setBusy(path)
    setError('')
    try {
      await businessApi(session, path, { method: 'POST', body: JSON.stringify(body) })
      await reload()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy('')
    }
  }

  async function proposeInsert(w: Workflow) {
    const current = w.steps.find((s) => s.status === 'active') ?? w.steps.at(-1)
    if (!current) return
    const name = window.prompt('新增步骤名称：', '补充分析与复核')
    if (!name) return
    const reason = window.prompt('调整原因：', '根据当前推演态势动态调整工作流')
    if (!reason) return
    await post(`/api/workflows/${w.id}/proposals`, {
      change: { type: 'insert_step', afterStepKey: current.key, name, actorRule: 'any' },
      reason,
    })
  }

  async function proposeBacktrack(w: Workflow) {
    const target = window.prompt(
      `回退目标步骤 key：\n${w.steps.map((s) => `${s.key} = ${s.name}`).join('\n')}`,
      w.steps[0]?.key ?? '',
    )
    if (!target) return
    const reason = window.prompt('回退原因：', '需要重新执行前序关键步骤')
    if (!reason) return
    await post(`/api/workflows/${w.id}/proposals`, {
      change: { type: 'backtrack', targetStepKey: target },
      reason,
    })
  }

  return (
    <div>
      <div className={css.row} style={{ marginBottom: 12 }}>
        <strong>标准工作流 + 动态调整</strong>
        <span className={css.itemMeta}>Agent 可提出插入 / 回退建议，人工审批后生效</span>
        <span className={css.spacer} />
        <button type="button" className={css.button} onClick={() => { void reload() }}>刷新</button>
      </div>

      {error !== '' && <p style={{ color: '#b42318' }}>{error}</p>}

      {groups.length === 0 && <p className={css.empty}>请先创建任务组</p>}

      <ul className={css.list}>
        {groups.map((g) => {
          const w = workflows.find((x) => x.groupId === g.id)
          if (!w) {
            return (
              <li key={g.id} className={css.listItem}>
                <div>
                  <strong>{g.name}</strong>
                  <div className={css.itemMeta}>{g.mode === 'hierarchical' ? '层级标准流程' : '平级标准流程'}</div>
                </div>
                <button
                  type="button"
                  className={css.button}
                  disabled={busy !== ''}
                  onClick={() => { void post(`/api/task-groups/${g.id}/workflow`) }}
                >
                  创建标准工作流
                </button>
              </li>
            )
          }

          const current = w.steps.find((s) => s.status === 'active')
          return (
            <li key={g.id} style={{ listStyle: 'none', marginBottom: 14 }}>
              <div className={css.row}>
                <strong>{g.name}</strong>
                <span className={css.badge}>{w.status === 'completed' ? '已完成' : w.template}</span>
                <span className={css.spacer} />
                {current && (
                  <button
                    type="button"
                    className={css.button}
                    disabled={busy !== ''}
                    onClick={() => { void post(`/api/workflows/${w.id}/complete`) }}
                  >
                    完成当前步骤
                  </button>
                )}
                <button type="button" className={css.button} onClick={() => { void proposeInsert(w) }}>建议插入步骤</button>
                <button type="button" className={css.button} onClick={() => { void proposeBacktrack(w) }}>建议回退</button>
              </div>

              <table className={css.table} style={{ marginTop: 6 }}>
                <thead><tr><th>顺序</th><th>步骤</th><th>执行规则</th><th>状态</th></tr></thead>
                <tbody>
                  {w.steps.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td>{s.name}<div className={css.itemMeta}>{s.key}</div></td>
                      <td>{s.actorRule === 'leader' ? '组长' : s.actorRule === 'member' ? '普通成员' : '任意成员'}</td>
                      <td><span className={css.badge}>{s.status === 'active' ? '当前' : s.status === 'completed' ? '完成' : '待执行'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          )
        })}
      </ul>

      <div style={{ marginTop: 18, borderTop: '0.5px solid rgba(0,0,0,.08)', paddingTop: 12 }}>
        <strong>工作流调整审批</strong>
        {proposals.length === 0 ? <p className={css.empty}>暂无调整申请</p> : (
          <table className={css.table} style={{ marginTop: 6 }}>
            <thead><tr><th>任务组</th><th>变更</th><th>原因</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {proposals.map((p) => {
                const w = workflows.find((x) => x.id === p.workflowId)
                const g = w ? groupMap.get(w.groupId) : undefined
                return (
                  <tr key={p.id}>
                    <td>{g?.name ?? '-'}</td>
                    <td>{p.change.type === 'insert_step' ? `插入：${p.change.name}` : `回退：${p.change.targetStepKey}`}</td>
                    <td>{p.reason}</td>
                    <td><span className={css.badge}>{p.status}</span></td>
                    <td>
                      {p.status === 'pending' && (
                        <div className={css.row}>
                          <button className={css.button} onClick={() => { void post(`/api/workflow-proposals/${p.id}/approve`) }}>批准</button>
                          <button className={css.button} onClick={() => { void post(`/api/workflow-proposals/${p.id}/reject`) }}>拒绝</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
