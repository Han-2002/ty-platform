import { useEffect, useMemo, useRef, useState } from 'react';
import { api, API_BASE, type Me } from './api';
import './app.css';

type Conversation = {
  id: string;
  activityId: string;
  name: string;
  kind: string;
  memberSeatIds: string[];
};

type Message = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderSeatId: string;
  content: string;
  createdAt: number;
};

type TaskGroup = {
  id: string;
  activityId: string;
  name: string;
  mode: 'hierarchical' | 'peer';
  memberSeatIds: string[];
  leaderSeatId?: string;
  peerDecisionMode?: string;
  status: string;
};

type Workflow = {
  id: string;
  groupId: string;
  activityId: string;
  status: string;
  steps: Array<{ id: string; key: string; name: string; actorRule: string; status: string }>;
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

export default function App() {
  const [userId, setUserId] = useState('admin');
  const [password, setPassword] = useState('Admin123456!');
  const [token, setToken] = useState(localStorage.getItem('ty.token') ?? '');
  const [me, setMe] = useState<Me | null>(null);
  const [seatId, setSeatId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [status, setStatus] = useState('未登录');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');

  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const assignment = useMemo(
    () => me?.assignments.find((a) => a.active && a.seatId === seatId && a.activityId === activityId),
    [me, seatId, activityId],
  );

  async function login() {
    try {
      const r = await api<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId, password }),
      });
      localStorage.setItem('ty.token', r.token);
      setToken(r.token);
      setStatus(`已登录：${r.userName}`);
    } catch (e) {
      setStatus(`登录失败：${(e as Error).message}`);
    }
  }

  async function loadMe(t = token) {
    if (!t) return;
    const r = await api<Me>('/api/me', {}, t);
    setMe(r);
    const first = r.assignments.find((a) => a.active);
    if (first) {
      setSeatId(first.seatId);
      setActivityId(first.activityId);
    }
  }

  async function loadBusiness() {
    if (!token || !seatId || !activityId) return;
    try {
      const [cs, gs, ws, ps] = await Promise.all([
        api<Conversation[]>(`/api/conversations?activityId=${encodeURIComponent(activityId)}`, {}, token, seatId, activityId),
        api<TaskGroup[]>(`/api/task-groups?activityId=${encodeURIComponent(activityId)}`, {}, token, seatId, activityId),
        api<Workflow[]>(`/api/workflows?activityId=${encodeURIComponent(activityId)}`, {}, token, seatId, activityId),
        api<any[]>(`/api/plans?activityId=${encodeURIComponent(activityId)}`, {}, token, seatId, activityId),
      ]);
      setConversations(cs);
      setGroups(gs);
      setWorkflows(ws);
      setPlans(ps);
      if (!conversationId && cs[0]) setConversationId(cs[0].id);

      try {
        const ar = await api<any[]>(`/api/audit?activityId=${encodeURIComponent(activityId)}`, {}, token, seatId, activityId);
        setAudit(ar.slice(-30));
      } catch {
        setAudit([]);
      }
    } catch (e) {
      setStatus(`加载失败：${(e as Error).message}`);
    }
  }

  async function loadMessages() {
    if (!conversationId || !token || !seatId || !activityId) return;
    const ms = await api<Message[]>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {},
      token,
      seatId,
      activityId,
    );
    setMessages(ms);
  }

  async function sendMessage() {
    if (!draft.trim()) return;
    try {
      await api(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
        { method: 'POST', body: JSON.stringify({ content: draft }) },
        token,
        seatId,
        activityId,
      );
      setDraft('');
      await loadMessages();
    } catch (e) {
      setStatus(`发送失败：${(e as Error).message}`);
    }
  }

  async function createHierarchicalGroup() {
    const all = me?.assignments.filter((a) => a.active && a.activityId === activityId).map((a) => a.seatId) ?? [];
    const members = Array.from(new Set([seatId, ...all])).slice(0, Math.max(2, all.length));
    try {
      await api(
        '/api/task-groups',
        {
          method: 'POST',
          body: JSON.stringify({
            activityId,
            name: `层级任务组-${new Date().toLocaleTimeString()}`,
            mode: 'hierarchical',
            memberSeatIds: members,
            leaderSeatId: seatId,
          }),
        },
        token,
        seatId,
        activityId,
      );
      await loadBusiness();
    } catch (e) {
      setStatus(`创建层级组失败：${(e as Error).message}`);
    }
  }

  async function createPeerGroup() {
    const seatIds = prompt('输入平级组席位ID，用逗号分隔', seatId) ?? '';
    const members = seatIds.split(',').map((x) => x.trim()).filter(Boolean);
    try {
      await api(
        '/api/task-groups',
        {
          method: 'POST',
          body: JSON.stringify({
            activityId,
            name: `平级任务组-${new Date().toLocaleTimeString()}`,
            mode: 'peer',
            memberSeatIds: members,
            peerDecisionMode: 'negotiate',
          }),
        },
        token,
        seatId,
        activityId,
      );
      await loadBusiness();
    } catch (e) {
      setStatus(`创建平级组失败：${(e as Error).message}`);
    }
  }

  async function createWorkflow(groupId: string) {
    try {
      await api(
        `/api/task-groups/${encodeURIComponent(groupId)}/workflow`,
        { method: 'POST', body: '{}' },
        token,
        seatId,
        activityId,
      );
      await loadBusiness();
    } catch (e) {
      setStatus(`创建工作流失败：${(e as Error).message}`);
    }
  }

  async function advanceWorkflow(workflowId: string) {
    try {
      await api(
        `/api/workflows/${encodeURIComponent(workflowId)}/complete`,
        { method: 'POST', body: '{}' },
        token,
        seatId,
        activityId,
      );
      await loadBusiness();
    } catch (e) {
      setStatus(`推进工作流失败：${(e as Error).message}`);
    }
  }

  async function logout() {
    try {
      if (token) await api('/api/auth/logout', { method: 'POST', body: '{}' }, token);
    } catch {}
    localStorage.removeItem('ty.token');
    setToken('');
    setMe(null);
    setSeatId('');
    setActivityId('');
    setStatus('已退出');
  }

  useEffect(() => {
    if (token) loadMe(token).catch((e) => {
      setStatus(`Session失效：${e.message}`);
      localStorage.removeItem('ty.token');
      setToken('');
    });
  }, [token]);

  useEffect(() => {
    if (token && seatId && activityId && assignment) {
      loadBusiness();
      const wsUrl = API_BASE.replace(/^http/, 'ws') +
        `/ws?token=${encodeURIComponent(token)}&activityId=${encodeURIComponent(activityId)}&seatId=${encodeURIComponent(seatId)}`;
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data);
          if (event.type === 'chat.message.created') loadMessages();
          if (
            event.type?.startsWith('task_group.') ||
            event.type?.startsWith('workflow.') ||
            event.type?.startsWith('plan.') ||
            event.type?.startsWith('simulation.')
          ) loadBusiness();
        } catch {}
      };
      wsRef.current = ws;
      return () => {
        ws.close();
        wsRef.current = null;
      };
    }
  }, [token, seatId, activityId, assignment?.id]);

  useEffect(() => {
    loadMessages().catch(() => {});
  }, [conversationId, token, seatId, activityId]);

  if (!token || !me) {
    return (
      <main>
        <h1>多智能体协同决策平台</h1>
        <p>登录</p>
        <div>
          <label>用户ID：<input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
        </div>
        <div>
          <label>密码：<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        </div>
        <button onClick={login}>登录</button>
        <pre>{status}</pre>
      </main>
    );
  }

  return (
    <main>
      <h1>多智能体协同决策平台</h1>
      <div>用户：{me.userName} ({me.userId}) <button onClick={logout}>退出</button></div>
      <div>
        席位：
        <select value={seatId} onChange={(e) => {
          const s = e.target.value;
          setSeatId(s);
          const a = me.assignments.find((x) => x.active && x.seatId === s);
          if (a) setActivityId(a.activityId);
        }}>
          {me.assignments.filter((a) => a.active).map((a) => (
            <option key={a.id} value={a.seatId}>{a.seatId} / {a.activityId}</option>
          ))}
        </select>
      </div>
      <div>活动：{activityId}</div>
      <pre>状态：{status}</pre>

      <hr />
      <h2>1. 实时沟通</h2>
      <div>
        会话：
        <select value={conversationId} onChange={(e) => setConversationId(e.target.value)}>
          {conversations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={loadMessages}>刷新</button>
      </div>
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id}>
            [{fmtTime(m.createdAt)}] {m.senderSeatId} / {m.senderUserId}：{m.content}
          </div>
        ))}
      </div>
      <div>
        <input className="wide" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
          placeholder="输入消息，回车发送" />
        <button onClick={sendMessage}>发送</button>
      </div>

      <hr />
      <h2>2. 任务组</h2>
      <button onClick={createHierarchicalGroup}>创建层级组</button>
      <button onClick={createPeerGroup}>创建平级组</button>
      {groups.map((g) => (
        <div className="block" key={g.id}>
          <div>{g.name} | {g.mode} | {g.status}</div>
          <div>成员：{g.memberSeatIds.join(', ')}</div>
          <div>leader：{g.leaderSeatId ?? '-'}</div>
          {!workflows.some((w) => w.groupId === g.id) &&
            <button onClick={() => createWorkflow(g.id)}>创建标准工作流</button>}
        </div>
      ))}

      <hr />
      <h2>3. 工作流</h2>
      {workflows.map((w) => (
        <div className="block" key={w.id}>
          <div>Workflow {w.id} | {w.status}</div>
          {w.steps.map((s, i) => (
            <div key={s.id}>{i + 1}. [{s.status}] {s.name} ({s.actorRule})</div>
          ))}
          {w.status !== 'completed' &&
            <button onClick={() => advanceWorkflow(w.id)}>完成当前步骤</button>}
        </div>
      ))}

      <hr />
      <h2>4. 方案 / 仿真状态</h2>
      {plans.length === 0 ? <div>暂无方案版本</div> : plans.map((p) => (
        <div className="block" key={p.id}>
          {p.name} v{p.version} | {p.status} | group={p.groupId}
        </div>
      ))}

      <hr />
      <h2>5. 审计</h2>
      {audit.length === 0 ? <div>当前席位无审计查看权限或暂无记录</div> :
        audit.map((a) => (
          <div key={a.id}>[{fmtTime(a.at)}] {a.action} | {a.result} | {a.seatId ?? '-'}</div>
        ))}

      <hr />
      <button onClick={loadBusiness}>刷新全部</button>
    </main>
  );
}
