// components/website/src/lib/dense-embedding-guard.test.ts
//
// Gate-Verhalten mit pg-mem: aktive Gemma-Generation passiert, laufende
// Migration scheitert explizit, unbekannter/alte Raeume sind Profilfehler.
// withDenseWrite prueft in derselben Transaktion wie der Write.
import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import {
  assertActiveDenseProfile,
  assertCollectionProfile,
  DenseMigrationInProgressError,
  DenseProfileError,
  withDenseWrite,
} from './dense-embedding-guard';

const DDL = `
  CREATE TABLE public.dense_embedding_migrations (
    run_id TEXT PRIMARY KEY,
    source_profile TEXT NOT NULL,
    target_profile TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'prepared',
    writer_locked BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT false,
    source_fingerprint TEXT,
    counters JSONB NOT NULL DEFAULT '{}',
    manifest JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE t (id INT PRIMARY KEY, v TEXT);
`;

function memPool(seed?: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.none(DDL);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  if (seed) return seed((sql, params) => pool.query(sql, params)).then(() => pool);
  return Promise.resolve(pool);
}

const GEMMA_ROW = [
  'run1', 'bge-m3:1024:Q8_0:v1', 'embeddinggemma-300m:768:Q8_0:v1', 'active', false, true, 'fp', '{}', '{}',
];

describe('assertActiveDenseProfile', () => {
  it('wirft Profilfehler ohne Tracking-Tabelle', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await expect(assertActiveDenseProfile(pool)).rejects.toThrow(DenseProfileError);
  });

  it('gibt das aktive Gemma-Profil zurueck', async () => {
    const pool = await memPool((q) =>
      q(`INSERT INTO public.dense_embedding_migrations
         (run_id, source_profile, target_profile, phase, writer_locked, active, source_fingerprint, counters, manifest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`, GEMMA_ROW),
    );
    const active = await assertActiveDenseProfile(pool);
    expect(active.model).toBe('embeddinggemma-300m');
    expect(active.profile).toBe('embeddinggemma-300m:768:Q8_0:v1');
    expect(active.dimensions).toBe(768);
    await pool.end();
  });

  it('meldet laufende Migration explizit', async () => {
    for (const [phase, locked] of [['prepared', true], ['indexing', true], ['verifying', true]] as const) {
      const pool = await memPool((q) =>
        q(`INSERT INTO public.dense_embedding_migrations
           (run_id, source_profile, target_profile, phase, writer_locked, active, source_fingerprint, counters, manifest)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
          ['run1', 'bge-m3:1024:Q8_0:v1', 'embeddinggemma-300m:768:Q8_0:v1', phase, locked, false, 'fp', '{}', '{}']),
      );
      await expect(assertActiveDenseProfile(pool)).rejects.toThrow(DenseMigrationInProgressError);
      await pool.end();
    }
  });

  it('lehnt fremde aktive Profile ab', async () => {
    const pool = await memPool((q) =>
      q(`INSERT INTO public.dense_embedding_migrations
         (run_id, source_profile, target_profile, phase, writer_locked, active, source_fingerprint, counters, manifest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
        ['run1', 'bge-m3:1024:Q8_0:v1', 'bge-m3:1024:Q8_0:v1', 'active', false, true, 'fp', '{}', '{}']),
    );
    await expect(assertActiveDenseProfile(pool)).rejects.toThrow(DenseProfileError);
    await pool.end();
  });
});

describe('assertCollectionProfile', () => {
  it('akzeptiert nur das aktive Modell', () => {
    expect(() => assertCollectionProfile('embeddinggemma-300m')).not.toThrow();
    expect(() => assertCollectionProfile('bge-m3')).toThrow(DenseProfileError);
    expect(() => assertCollectionProfile(null)).toThrow(DenseProfileError);
  });
});

describe('withDenseWrite', () => {
  it('schreibt in einer Transaktion bei aktiver Generation', async () => {
    const pool = await memPool((q) =>
      q(`INSERT INTO public.dense_embedding_migrations
         (run_id, source_profile, target_profile, phase, writer_locked, active, source_fingerprint, counters, manifest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`, GEMMA_ROW),
    );
    const out = await withDenseWrite(pool, async (client) => {
      await client.query(`INSERT INTO t (id, v) VALUES (1, 'a')`);
      return 'done';
    });
    expect(out).toBe('done');
    const r = await pool.query(`SELECT v FROM t WHERE id = 1`);
    expect(r.rows[0].v).toBe('a');
    await pool.end();
  });

  it('rollt bei Sperre zurueck statt zu mischen', async () => {
    const pool = await memPool((q) =>
      q(`INSERT INTO public.dense_embedding_migrations
         (run_id, source_profile, target_profile, phase, writer_locked, active, source_fingerprint, counters, manifest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
        ['run1', 'bge-m3:1024:Q8_0:v1', 'embeddinggemma-300m:768:Q8_0:v1', 'indexing', true, false, 'fp', '{}', '{}']),
    );
    await expect(
      withDenseWrite(pool, async (client) => {
        await client.query(`INSERT INTO t (id, v) VALUES (1, 'a')`);
      }),
    ).rejects.toThrow(DenseMigrationInProgressError);
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM t`);
    expect(r.rows[0].n).toBe(0);
    await pool.end();
  });
});
