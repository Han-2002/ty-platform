import { useCallback, useEffect, useState } from 'react'
import type { BusinessModuleProps } from '../modules.ts'
import { businessApi, errorText } from './businessApi.ts'
import css from './console.module.css'

interface AuditRecord {
  id: string
  at: number
  sequence: number
  actorType: 'human' | 'agent' | 'system'
  activityId?: string
  userId?: string
  seatId?: string
  action: string
  targetType?: string
  targetId?: string
  result: string
  reason?: string
  hash: string
  prevHash: string
}

export function AuditModule({ session }: BusinessModuleProps) {
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [actionFilter, setActionFilter] = useState('')
  const [seatFilter, setSeatFilter] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ activityId: session.activityId })
      if (actionFilter.trim() !== '') q.set('action', actionFilter.trim())
      if (seatFilter.trim() !== '') q.set('seatId', seatFilter.trim())
      const r = await businessApi<AuditRecord[]>(session, `/api/audit?${q.toString()}`)
      setRecords(r)
      setError('')
    } catch (e) {
      setError(errorText(e))
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [session, actionFilter, seatFilter])

  useEffect(() => { void reload() }, [reload])

  return (
    <div>
      <div className={css.row} style={{ marginBottom: 12 }}>
        <strong>全链路审计与复盘</strong>
        <span className={css.itemMeta}>人 / Agent / 系统动作、审批、访问、通信、方案与仿真</span>
        <span className={css.spacer} />
        <button className={css.button} disabled={loading} onClick={() => { void reload() }}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      <div className={css.row} style={{ marginBottom: 12 }}>
        <input className={css.input} placeholder="按 action 精确筛选" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
        <input className={css.input} placeholder="按 seatId 筛选" value={seatFilter} onChange={(e) => setSeatFilter(e.target.value)} />
        <button className={css.button} onClick={() => { void reload() }}>查询</button>
        <button className={css.button} onClick={() => { setActionFilter(''); setSeatFilter('') }}>清空</button>
      </div>

      {error !== '' && (
        <p style={{ color: 'var(--dsw-alias-label-error, #ff6b6b)' }}>
          {error.includes('审批') ? '当前席位无审计查询权限。审计记录仅审批席位可查看。' : error}
        </p>
      )}

      {records.length === 0 && error === '' ? <p className={css.empty}>暂无审计记录</p> : (
        <table className={css.table}>
          <thead><tr><th>#</th><th>时间</th><th>主体</th><th>动作</th><th>目标</th><th>结果</th><th>Hash</th></tr></thead>
          <tbody>
            {[...records].reverse().slice(0, 250).map((r) => (
              <tr key={r.id}>
                <td>{r.sequence}</td>
                <td>{new Date(r.at).toLocaleString()}</td>
                <td>{r.seatId ?? r.userId ?? r.actorType}</td>
                <td>{r.action}</td>
                <td>{r.targetType ?? '-'}{r.targetId ? ` · ${r.targetId.slice(0, 8)}` : ''}</td>
                <td><span className={css.badge}>{r.result}</span></td>
                <td title={r.hash} style={{ fontFamily: 'monospace' }}>{r.hash.slice(0, 12)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

