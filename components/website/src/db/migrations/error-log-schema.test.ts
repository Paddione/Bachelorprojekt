import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { persistError, __setPoolForTesting } from '../../lib/logging/error-log-store';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  const migrationSql = readFileSync(join(__dirname, '20260703_create_error_log.sql'), 'utf-8')
    // pg-mem doesn't support ALTER TABLE ... OWNER TO / GRANT — strip the
    // ops-only statements and keep the schema-defining ones.
    .split('\n')
    .filter((line) => !/^ALTER TABLE .* OWNER TO|^GRANT /.test(line.trim()))
    .join('\n');
  db.public.none(migrationSql);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
  __setPoolForTesting(pool);
});
afterAll(() => {
  __setPoolForTesting(null);
});

describe('error_log schema', () => {
  it('accepts a row with the documented columns and defaults ts/meta', async () => {
    await persistError({ source: 'server', message: 'boot ok' });

    const { rows } = await pool.query('SELECT * FROM error_log WHERE message = $1', ['boot ok']);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('server');
    expect(rows[0].ts).toBeTruthy();
    expect(rows[0].meta).toEqual({});
  });

  it('rejects a source outside the CHECK constraint', async () => {
    await expect(
      pool.query(
        `INSERT INTO error_log (source, message) VALUES ($1, $2)`,
        ['bogus', 'should fail'],
      ),
    ).rejects.toThrow();
  });
});
