import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      nom text PRIMARY KEY,
      applique_le timestamptz NOT NULL DEFAULT now()
    )`);

  const applied = new Set(
    (await pool.query<{ nom: string }>('SELECT nom FROM _migrations')).rows.map((r) => r.nom),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (nom) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`migration appliquée : ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`échec de la migration ${file} : ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}

// Exécution directe : `npm run migrate`
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
