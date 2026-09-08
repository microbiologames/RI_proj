import pg from 'pg';

// Les montants (numeric) arrivent en string par défaut : on les veut en number
// côté JSON. Les dates (date) restent en string 'YYYY-MM-DD' pour éviter les
// décalages de fuseau à la sérialisation.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://ri:ri@localhost:5432/ri_proj';

// Azure Database for PostgreSQL impose TLS ; en local on ne le veut pas.
const needsSsl = /sslmode=require/.test(connectionString) || process.env.PGSSL === 'true';

export const pool = new pg.Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as any[]);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Exécute `fn` dans une transaction, rollback automatique en cas d'erreur. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
