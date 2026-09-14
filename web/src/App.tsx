/**
 * Platform entry: sign in against the backend, then hand the whole surface to
 * the wargaming console ported from the deepseek-harness `ui-wargame` plugin.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, type Me } from './api';
import { ConsoleProvider, useConsole } from './console/store';
import { ConsoleShell } from './console/ConsoleShell';
import { loadConsoleData } from './console/dataLoader';
import './app.css';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ty.token') ?? '');
  const [me, setMe] = useState<Me | null>(null);
  const [seatId, setSeatId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [userId, setUserId] = useState('admin');
  const [password, setPassword] = useState('Admin123456!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadMe = useCallback(async (t: string) => {
    try {
      const r = await api<Me>('/api/me', {}, t);
      setMe(r);
      const first = r.assignments.find((a) => a.active) ?? r.assignments[0];
      if (first) {
        setSeatId(first.seatId);
        setActivityId(first.activityId);
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setToken('');
      localStorage.removeItem('ty.token');
    }
  }, []);

  useEffect(() => {
    if (token !== '') void loadMe(token);
  }, [token, loadMe]);

  async function login() {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId, password }),
      });
      localStorage.setItem('ty.token', r.token);
      setToken(r.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' }, token);
    } catch { /* a failed logout still clears the local session */ }
    localStorage.removeItem('ty.token');
    setToken('');
    setMe(null);
    setSeatId('');
    setActivityId('');
  }

  if (me === null) {
    return (
      <LoginView
        userId={userId}
        password={password}
        busy={busy}
        error={error}
        onUserId={setUserId}
        onPassword={setPassword}
        onSubmit={() => { void login(); }}
      />
    );
  }

  return (
    <ConsoleProvider>
      <ConsoleBridge token={token} seatId={seatId} activityId={activityId} />
      <ConsoleShell userName={me.userName} onLogout={() => { void logout(); }} />
    </ConsoleProvider>
  );
}

/** Feeds backend data into the console store once a business context exists. */
function ConsoleBridge({
  token, seatId, activityId,
}: { token: string; seatId: string; activityId: string }) {
  const { actions } = useConsole();
  useEffect(() => {
    if (token === '' || seatId === '' || activityId === '') return;
    void loadConsoleData(actions, { token, seatId, activityId });
  }, [actions, token, seatId, activityId]);
  return null;
}

interface LoginViewProps {
  userId: string
  password: string
  busy: boolean
  error: string
  onUserId: (v: string) => void
  onPassword: (v: string) => void
  onSubmit: () => void
}

function LoginView({
  userId, password, busy, error, onUserId, onPassword, onSubmit,
}: LoginViewProps) {
  return (
    <div className="loginPage">
      <form
        className="loginCard"
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      >
        <h1 className="loginTitle">智能推演平台</h1>
        <p className="loginHint">导演部多席位智能体集群 · 推演控制台</p>
        <label className="loginField">
          <span>用户 ID</span>
          <input
            value={userId}
            onChange={(e) => { onUserId(e.target.value) }}
            autoComplete="username"
          />
        </label>
        <label className="loginField">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => { onPassword(e.target.value) }}
            autoComplete="current-password"
          />
        </label>
        {error !== '' && <p className="loginError">{error}</p>}
        <button className="loginSubmit" type="submit" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
