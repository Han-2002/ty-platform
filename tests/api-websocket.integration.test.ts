import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServerContext, type ServerContext } from '../src/server/context.js';
import { startApiServer, type RunningApiServer } from '../src/server/app.js';

const databaseUrl = process.env.DATABASE_URL;
const test = databaseUrl ? it : it.skip;

let ctx: ServerContext | undefined;
let api: RunningApiServer | undefined;

afterEach(async () => {
  if (api) await api.close();
  if (ctx) await ctx.db.close();
  api = undefined;
  ctx = undefined;
});

describe('api-websocket-v1', () => {
  test('HTTP health / activities 可用，WebSocket 可以建立连接', async () => {
    ctx = await buildServerContext({
      rootDir: process.cwd(),
      databaseUrl: databaseUrl!,
    });
    api = await startApiServer(ctx, { host: '127.0.0.1', port: 0 });

    const health = await fetch(`${api.baseUrl}/api/health`);
    expect(health.status).toBe(200);
    const healthJson = await health.json() as { status: string; database: string };
    expect(healthJson.status).toBe('ok');
    expect(healthJson.database).toBe('connected');

    const activities = await fetch(`${api.baseUrl}/api/activities`);
    expect(activities.status).toBe(200);
    const list = await activities.json() as Array<{ id: string; name: string }>;
    expect(list.length).toBeGreaterThan(0);

    const event = await new Promise<{ type: string }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${api!.port}/ws`);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket timeout'));
      }, 3000);

      ws.on('message', (raw) => {
        clearTimeout(timer);
        const parsed = JSON.parse(raw.toString()) as { type: string };
        ws.close();
        resolve(parsed);
      });
      ws.on('error', reject);
    });

    expect(event.type).toBe('system.connected');
  });
});
