import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Organization } from '../src/org/organization.js';
import { UserSeatManager } from '../src/identity/userSeatManager.js';
import { PersistentIdentityService } from '../src/identity/persistentIdentityService.js';
import { PostgresDatabase } from '../src/persistence/postgres.js';
import { PostgresRepositories } from '../src/persistence/postgresRepositories.js';
import { role, seat } from './helpers.js';
import type { SeatsConfig } from '../src/types.js';

const databaseUrl = process.env.DATABASE_URL;
const test = databaseUrl ? it : it.skip;

function makeOrg() {
  const cfg: SeatsConfig = {
    roles: [
      role({ id: 'director', clearance: 5, can_dispatch: true, can_approve: true, packs: [] }),
      role({ id: 'staff', clearance: 3, can_dispatch: false, can_approve: false, packs: [] }),
    ],
    seats: [
      seat({ id: 'd1', role: 'director', parent: null }),
      seat({ id: 's1', role: 'staff', parent: 'd1' }),
    ],
    activities: [{ id: 'act-a', name: '洪兰对抗' }],
  };
  return new Organization(cfg);
}

async function cleanupTestRows(): Promise<void> {
  if (!databaseUrl) return;
  const db = new PostgresDatabase({ connectionString: databaseUrl });
  try {
    // 先删席位编配，再删用户，避免外键约束。
    // 只清理本测试使用的 persist-* 数据，不碰真实业务数据。
    await db.pool.query(`
      DELETE FROM seat_assignments
      WHERE user_id LIKE 'persist-%'
    `);
    await db.pool.query(`
      DELETE FROM users
      WHERE id LIKE 'persist-%'
    `);
  } finally {
    await db.close();
  }
}

describe('persistent-identity-v1', () => {
  beforeEach(async () => {
    await cleanupTestRows();
  });

  afterEach(async () => {
    await cleanupTestRows();
  });

  test('创建用户和席位编配后，重建 Manager 仍可从 PostgreSQL 恢复', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      const repos = new PostgresRepositories(db.pool);
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const userId = `persist-u-${suffix}`;

      const manager1 = new UserSeatManager(makeOrg());
      const service1 = new PersistentIdentityService(manager1, repos);

      const user = await service1.createUser(userId, '持久化用户');
      const assignment = await service1.assign('d1', user.id, 's1', 'act-a');

      expect(manager1.context(user.id, 's1', 'act-a').userName).toBe('持久化用户');

      // 模拟应用重启：全新 Manager，不共享任何 Map。
      const manager2 = new UserSeatManager(makeOrg());
      const service2 = new PersistentIdentityService(manager2, repos);
      await service2.hydrate();

      expect(manager2.getUser(user.id).name).toBe('持久化用户');
      expect(manager2.getAssignment(assignment.id).active).toBe(true);
      expect(manager2.context(user.id, 's1', 'act-a').seatId).toBe('s1');
    } finally {
      await db.close();
    }
  });

  test('release 写入数据库后，重启恢复仍保持已释放状态', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      const repos = new PostgresRepositories(db.pool);
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const userId = `persist-r-${suffix}`;

      const manager1 = new UserSeatManager(makeOrg());
      const service1 = new PersistentIdentityService(manager1, repos);
      await service1.createUser(userId, '释放测试用户');
      const assignment = await service1.assign('d1', userId, 's1', 'act-a');
      await service1.release('d1', assignment.id);

      const manager2 = new UserSeatManager(makeOrg());
      const service2 = new PersistentIdentityService(manager2, repos);
      await service2.hydrate();

      expect(manager2.getAssignment(assignment.id).active).toBe(false);
      expect(manager2.activeAssignment(userId, 's1', 'act-a')).toBeUndefined();
    } finally {
      await db.close();
    }
  });
});
