import pg from 'pg';

const { Client } = pg;

const databaseUrl =
  process.env.DATABASE_URL
  ?? 'postgres://ty_platform:ty_platform_dev@localhost:5432/ty_platform';

const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query('BEGIN');

  const before = await client.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM audit_records',
  );
  const count = Number(before.rows[0]?.count ?? 0);

  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_records_legacy_v1
    (LIKE audit_records INCLUDING ALL)
  `);

  await client.query(`
    INSERT INTO audit_records_legacy_v1
    SELECT * FROM audit_records
    ON CONFLICT (id) DO NOTHING
  `);

  await client.query('TRUNCATE TABLE audit_records');

  await client.query('COMMIT');

  console.log('Audit chain repair completed.');
  console.log(`Backed up legacy records: ${count}`);
  console.log('Backup table: audit_records_legacy_v1');
  console.log('audit_records is now empty and the next record will start at sequence=1 / GENESIS.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
