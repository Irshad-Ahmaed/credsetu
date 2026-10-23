import { readFile, readdir } from 'node:fs/promises';
import { pool } from './pool.js';

try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('miniledger_migrations'))");
    const directory = new URL('../../migrations/', import.meta.url);
    const migrations = (await readdir(directory)).filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
    let applied = 0;
    for (const name of migrations) {
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
      if (exists.rowCount) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      console.log(`Applied ${name}.`);
      applied += 1;
    }
    if (!applied) console.log('Database is up to date.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
