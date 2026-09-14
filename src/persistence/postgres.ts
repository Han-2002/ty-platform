import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';

export interface PostgresOptions {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  statementTimeoutMillis?: number;
}

/**
 * In-memory PostgreSQL used when `PG_MEM=1`. The local preview machine has no
 * server, so the same migration files are applied to pg-mem and every
 * repository then runs against it unchanged. Data lives only for the process
 * lifetime — this is a preview seam, never a production path.
 */
function createMemoryPool(): Pool {
  const require = createRequire(import.meta.url);
  const { newDb, DataType } = require('pg-mem') as {
    newDb: (options?: unknown) => {
      public: {
        none: (sql: string) => void
        registerFunction: (options: unknown) => void
      }
      adapters: { createPg: () => { Pool: new () => Pool } }
    }
    DataType: { text: unknown; jsonb: unknown }
  };
  const db = newDb({ autoCreateForeignKeyIndices: true });
  // pg-mem ships very few native functions; the repositories build jsonb rows
  // with jsonb_build_object, so register the arities those queries use.
  for (const arity of [2, 4, 6, 8, 10, 12, 14, 16]) {
    db.public.registerFunction({
      name: 'jsonb_build_object',
      args: Array.from({ length: arity }, () => DataType.text),
      returns: DataType.jsonb,
      implementation: (...args: unknown[]): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (let i = 0; i + 1 < args.length; i += 2) out[String(args[i])] = args[i + 1];
        return out;
      },
    });
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (const file of ['001_core', '002_auth', '003_chat']) {
    db.public.none(readFileSync(join(root, 'db', 'migrations', `${file}.sql`), 'utf8'));
  }
  const { Pool: MemoryPool } = db.adapters.createPg();
  return new MemoryPool() as unknown as Pool;
}

export class PostgresDatabase {
  readonly pool: Pool;

  constructor(options: PostgresOptions) {
    this.pool = process.env.PG_MEM === '1'
      ? createMemoryPool()
      : new Pool({
          connectionString: options.connectionString,
          max: options.max ?? 20,
          idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
          statement_timeout: options.statementTimeoutMillis ?? 10_000,
        });
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
