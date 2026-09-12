import { describe, expect, it } from 'vitest';
import { PostgresDatabase } from '../src/persistence/postgres.js';
import { PostgresRepositories } from '../src/persistence/postgresRepositories.js';

const databaseUrl = process.env.DATABASE_URL;
const test = databaseUrl ? it : it.skip;

describe('persistence-postgres-integration', () => {
  test('PostgreSQL 可连接，并能保存/读取用户', async () => {
    const db = new PostgresDatabase({ connectionString: databaseUrl! });
    try {
      await db.ping();
      const repos = new PostgresRepositories(db.pool);

      const id = `test-user-${Date.now()}`;
      await repos.saveUser({
        id,
        name: '持久化测试用户',
        status: 'active',
        createdAt: Date.now(),
      });

      const loaded = await repos.getUser(id);
      expect(loaded?.id).toBe(id);
      expect(loaded?.name).toBe('持久化测试用户');
    } finally {
      await db.close();
    }
  });
});
