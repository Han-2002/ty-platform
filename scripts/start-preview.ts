/**
 * Local preview launcher.
 *
 * Boots the API and seeds the default approval account in the SAME process, so
 * the in-memory PostgreSQL (PG_MEM=1, see src/persistence/postgres.ts) is
 * shared between seeding and serving — the standalone `bootstrap-admin.ts`
 * cannot do this because a separate process gets its own memory database.
 *
 * With a real PostgreSQL running, omit PG_MEM and this behaves like
 * migrate + bootstrap-admin + main in one shot.
 */
import { buildServerContext } from '../src/server/context.js';
import { startApiServer } from '../src/server/app.js';

const ctx = await buildServerContext();

const approvalSeat = ctx.org.allSeats().find((s) => s.can_approve);
const activity = ctx.org.allActivities()[0];
if (approvalSeat === undefined) throw new Error('配置中不存在 can_approve=true 的审批席位');
if (activity === undefined) throw new Error('配置中不存在活动');

const occupied = ctx.identities
  .assignmentsForActivity(activity.id)
  .find((a) => a.active && a.seatId === approvalSeat.id);

let userId: string;
if (occupied !== undefined) {
  userId = occupied.userId;
} else {
  userId = process.env.TY_ADMIN_USER ?? 'admin';
  if (!ctx.identities.allUsers().some((u) => u.id === userId)) {
    await ctx.persistentIdentities.createUser(userId, '系统管理员');
  }
  await ctx.persistentIdentities.assign(approvalSeat.id, userId, approvalSeat.id, activity.id);
}
await ctx.auth.setPassword(userId, process.env.TY_ADMIN_PASSWORD ?? 'Admin123456!');

console.log(`[preview] account ready: ${userId} / seat ${approvalSeat.id} / activity ${activity.id}`);

const server = await startApiServer(ctx, {
  host: process.env.API_HOST ?? '0.0.0.0',
  port: Number(process.env.API_PORT ?? 8787),
});

console.log(`ty-platform API listening on ${server.baseUrl}`);
console.log(`WebSocket: ws://localhost:${server.port}/ws`);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
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
