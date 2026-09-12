import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const connectionString =
  process.env.DATABASE_URL ??
  'postgres://ty_platform:ty_platform_dev@localhost:5432/ty_platform';

const migrationsDir = resolve('db', 'migrations');
const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();

const pool = new pg.Pool({ connectionString });

try {
  await pool.query('SELECT 1');
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);
    await pool.query(sql);
  }
  console.log('Database migrations complete.');
} finally {
  await pool.end();
}
