import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BusinessModuleProps } from '../modules.ts'
import { businessApi, errorText } from './businessApi.ts'
import css from './console.module.css'

type Mode = 'hierarchical' | 'peer'
type Decision = 'vote' | 'score' | 'negotiate'

interface TaskGroup {
  id: string
  activityId: string
  name: string
  mode: Mode
  memberSeatIds: string[]
  leaderSeatId?: string
  peerDecisionMode?: Decision
  status: string
  createdAt: number
}

interface SeatMeta {
  id: string
  name: string
  canDispatch: boolean
  canApprove: boolean
}

export function TaskGroupModule({ session }: BusinessModuleProps) {
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [seats, setSeats] = useState<SeatMeta[]>([])
  const [name, setName] = useState('联合筹划组')
  const [mode, setMode] = useState<Mode>('hierarchical')
  const [leaderSeatId, setLeaderSeatId] = useState('')
  const [peerDecisionMode, setPeerDecisionMode] = useState<Decision>('negotiate')
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [g, s] = await Promise.all([
        businessApi<TaskGroup[]>(
          session,
          `/api/task-groups?activityId=${encodeURIComponent(session.activityId)}`,
        ),
        businessApi<SeatMeta[]>(session, '/api/seats'),
      ])
      setGroups(g)
      setSeats(s)
      setLeaderSeatId((current) => {
        if (current !== '') return current
        return (s.find((x) => x.canDispatch) ?? s[0])?.id ?? ''
      })
      setError('')
    } catch (e) {
      setError(errorText(e))
    }
  }, [session])

  useEffect(() => { void reload() }, [reload])

  const seatName = useMemo(
    () => new Map(seats.map((s) => [s.id, s.name])),
    [seats],
  )

  function toggleMember(id: string) {
    setMembers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function createGroup() {
    setBusy(true)
    setError('')
    try {
      const selected = [...new Set(members)]
      if (mode === 'hierarchical' && leaderSeatId !== '' && !selected.includes(leaderSeatId)) {
        selected.push(leaderSeatId)
      }
      if (selected.length === 0) throw new Error('至少选择 1 个成员席位')

      const payload: Record<string, unknown> = {
        activityId: session.activityId,
        name: name.trim() || '未命名任务组',
        mode,
        memberSeatIds: selected,
      }
      if (mode === 'hierarchical') payload.leaderSeatId = leaderSeatId
      else payload.peerDecisionMode = peerDecisionMode

      await businessApi(session, '/api/task-groups', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setMembers([])
      await reload()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className={css.row} style={{ marginBottom: 12 }}>
        <strong>任务组编成</strong>
        <span className={css.itemMeta}>层级组 / 平级组并行形成候选方案</span>
        <span className={css.spacer} />
        <button type="button" className={css.button} onClick={() => { void reload() }}>刷新</button>
      </div>

      <div style={{ borderBottom: '0.5px solid var(--dsw-alias-border-l2)', paddingBottom: 12, marginBottom: 12 }}>
        <div className={css.row} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className={css.field} style={{ minWidth: 180, marginBottom: 0 }}>
            <span className={css.itemMeta}>任务组名称</span>
            <input className={css.input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className={css.field} style={{ minWidth: 130, marginBottom: 0 }}>
            <span className={css.itemMeta}>组织模式</span>
            <select className={css.select} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="hierarchical">层级组</option>
              <option value="peer">平级组</option>
            </select>
          </label>

          {mode === 'hierarchical' ? (
            <label className={css.field} style={{ minWidth: 180, marginBottom: 0 }}>
              <span className={css.itemMeta}>组长</span>
              <select className={css.select} value={leaderSeatId} onChange={(e) => setLeaderSeatId(e.target.value)}>
                {seats.filter((s) => s.canDispatch).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className={css.field} style={{ minWidth: 160, marginBottom: 0 }}>
              <span className={css.itemMeta}>群体决策</span>
              <select className={css.select} value={peerDecisionMode} onChange={(e) => setPeerDecisionMode(e.target.value as Decision)}>
                <option value="negotiate">多轮协商</option>
                <option value="vote">投票</option>
                <option value="score">评分</option>
              </select>
            </label>
          )}

          <button type="button" className={css.button} disabled={busy} onClick={() => { void createGroup() }}>
            {busy ? '创建中…' : '创建任务组'}
          </button>
        </div>

        <div className={css.itemMeta} style={{ marginTop: 10, marginBottom: 6 }}>成员席位</div>
        <div className={css.row} style={{ flexWrap: 'wrap' }}>
          {seats.map((s) => (
            <label key={s.id} className={css.badge} style={{ cursor: 'pointer', height: 'auto', padding: '4px 8px' }}>
              <input
                type="checkbox"
                checked={members.includes(s.id)}
                onChange={() => toggleMember(s.id)}
                style={{ marginRight: 5 }}
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      {error !== '' && <p style={{ color: 'var(--dsw-alias-label-error, #ff6b6b)' }}>{error}</p>}

      {groups.length === 0 ? <p className={css.empty}>当前活动暂无任务组</p> : (
        <table className={css.table}>
          <thead>
            <tr><th>任务组</th><th>模式</th><th>成员</th><th>决策 / 组长</th><th>状态</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>{g.name}<div className={css.itemMeta}>{g.id.slice(0, 8)}</div></td>
                <td>{g.mode === 'hierarchical' ? '层级组' : '平级组'}</td>
                <td>{g.memberSeatIds.map((id) => seatName.get(id) ?? id).join('、')}</td>
                <td>{g.mode === 'hierarchical'
                  ? (seatName.get(g.leaderSeatId ?? '') ?? g.leaderSeatId ?? '-')
                  : ({ vote: '投票', score: '评分', negotiate: '多轮协商' }[g.peerDecisionMode ?? 'negotiate'])}</td>
                <td><span className={css.badge}>{g.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

