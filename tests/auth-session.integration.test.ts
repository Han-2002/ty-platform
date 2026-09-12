import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServerContext, type ServerContext } from '../src/server/context.js';
import { startApiServer, type RunningApiServer } from '../src/server/app.js';

const databaseUrl = process.env.DATABASE_URL;
const test = databaseUrl ? it : it.skip;
const USER_ID = 'auth-v1-test-user';
const PASSWORD = 'AuthTest123!';

let ctx: ServerContext | undefined;
let api: RunningApiServer | undefined;

async function cleanup() {
  if (!databaseUrl) return;
  const temp = await buildServerContext({
    rootDir: process.cwd(),
    databaseUrl,
  });
  try {
    await temp.db.pool.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [USER_ID]);
    await temp.db.pool.query(`DELETE FROM auth_accounts WHERE user_id=$1`, [USER_ID]);
    await temp.db.pool.query(`DELETE FROM seat_assignments WHERE user_id=$1`, [USER_ID]);
    await temp.db.pool.query(`DELETE FROM users WHERE id=$1`, [USER_ID]);
  } finally {
    await temp.db.close();
  }
}

beforeEach(cleanup);

afterEach(async () => {
  if (api) await api.close();
  if (ctx) await ctx.db.close();
  api = undefined;
  ctx = undefined;
  await cleanup();
});

describe('auth-session-v1', () => {
  test('未登录拒绝、登录成功、Bearer Token 可访问受保护 API、logout 后失效', async () => {
    ctx = await buildServerContext({
      rootDir: process.cwd(),
      databaseUrl: databaseUrl!,
    });

    await ctx.persistentIdentities.createUser(USER_ID, '认证测试用户');
    await ctx.auth.setPassword(USER_ID, PASSWORD);

    api = await startApiServer(ctx, { host: '127.0.0.1', port: 0 });

    const unauth = await fetch(`${api.baseUrl}/api/users`);
    expect(unauth.status).toBe(401);

    const login = await fetch(`${api.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, password: PASSWORD }),
    });
    expect(login.status).toBe(200);

    const loginJson = await login.json() as {
      token: string;
      userId: string;
      userName: string;
    };
    expect(loginJson.userId).toBe(USER_ID);
    expect(loginJson.token.length).toBeGreaterThan(20);

    const me = await fetch(`${api.baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${loginJson.token}` },
    });
    expect(me.status).toBe(200);
    const meJson = await me.json() as { userId: string };
    expect(meJson.userId).toBe(USER_ID);

    // 即使客户端伪造 x-user-id，服务器也只认 Session。
    const forged = await fetch(`${api.baseUrl}/api/me`, {
      headers: {
        authorization: `Bearer ${loginJson.token}`,
        'x-user-id': 'forged-director',
      },
    });
    const forgedJson = await forged.json() as { userId: string };
    expect(forgedJson.userId).toBe(USER_ID);

    const wsEvent = await new Promise<{ type: string }>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${api!.port}/ws?token=${encodeURIComponent(loginJson.token)}`,
      );
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket timeout'));
      }, 3000);
      ws.on('message', (raw) => {
        clearTimeout(timer);
        const event = JSON.parse(raw.toString()) as { type: string };
        ws.close();
        resolve(event);
      });
      ws.on('error', reject);
    });
    expect(wsEvent.type).toBe('system.connected');

    const logout = await fetch(`${api.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${loginJson.token}` },
    });
    expect(logout.status).toBe(200);

    const afterLogout = await fetch(`${api.baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${loginJson.token}` },
    });
    expect(afterLogout.status).toBe(401);
  });
});
