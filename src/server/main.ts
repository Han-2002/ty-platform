import { buildServerContext } from './context.js';
import { startApiServer } from './app.js';

const ctx = await buildServerContext();

const server = await startApiServer(ctx, {
  host: process.env.API_HOST ?? '0.0.0.0',
  port: Number(process.env.API_PORT ?? 8787),
});

console.log(`ty-platform API listening on ${server.baseUrl}`);
console.log(`WebSocket: ws://localhost:${server.port}/ws`);

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);
  try {
    await ctx.persistentAudit.flush();
    await server.close();
    await ctx.db.close();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
