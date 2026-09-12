import { Pool, type PoolClient } from 'pg';

export interface PostgresOptions {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  statementTimeoutMillis?: number;
}

export class PostgresDatabase {
  readonly pool: Pool;

  constructor(options: PostgresOptions) {
    this.pool = new Pool({
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
