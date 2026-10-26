// components/website/src/lib/dense-embedding-guard.ts
//
// DB-Profil-/Writer-Gate fuer den Dense-Vektorraum (Blattmodul: keine
// Rueckimporte auf Website-Client- oder Knowledge-Schicht).
// Aktiver Raum ist das Gemma-Profil aus scripts/lib/dense-embedding.mjs.
// Laufende Migration: expliziter voruebergehender Fehler. Unbekannter oder
// alter aktiver Vektorraum: Profilfehler. Niemals still umetikettieren.

import type { Pool, PoolClient } from 'pg';
import {
  DENSE_DIMENSIONS,
  DENSE_MODEL,
  DENSE_PROFILE,
} from '../../../../scripts/lib/dense-embedding.mjs';

export const ACTIVE_DENSE_MODEL = DENSE_MODEL;
export const ACTIVE_DENSE_PROFILE = DENSE_PROFILE;
export const ACTIVE_DENSE_DIMENSIONS = DENSE_DIMENSIONS;

export class DenseProfileError extends Error {
  constructor(msg: string) {
    super(`DenseProfileError: ${msg}`);
    this.name = 'DenseProfileError';
  }
}

export class DenseMigrationInProgressError extends Error {
  constructor(msg: string) {
    super(`DenseMigrationInProgressError: ${msg}`);
    this.name = 'DenseMigrationInProgressError';
  }
}

export interface DenseGatePool {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

interface MigrationRow {
  writer_locked: boolean;
  phase: string;
  target_profile: string;
}

function isUndefinedTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (code === '42P01') return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist|42P01/i.test(msg);
}

/** Aktives Profil aus der Migrationstabelle; wirft bei Sperre/leerem Raum. */
export async function assertActiveDenseProfile(pool: DenseGatePool): Promise<{
  model: typeof DENSE_MODEL;
  profile: typeof DENSE_PROFILE;
  dimensions: typeof DENSE_DIMENSIONS;
}> {
  let rows: MigrationRow[];
  try {
    // Gesperrte Runs zuerst: eine laufende Migration pausiert, auch wenn sie
    // (noch) nicht die aktive Generation ist.
    const r = await pool.query<MigrationRow>(
      `SELECT writer_locked, phase, target_profile
         FROM public.dense_embedding_migrations
        WHERE active = true OR writer_locked = true
        ORDER BY active DESC
        LIMIT 1`,
    );
    rows = r.rows;
  } catch (err) {
    // Kein Tracking, kein aktiver Raum: nichts Glaubwuerdiges zum Pruefen.
    throw new DenseProfileError(
      `no active dense generation (${isUndefinedTable(err) ? 'migration table missing' : 'lookup failed'}); run dense-migration prepare/cutover`,
    );
  }
  const active = rows[0];
  if (!active) {
    throw new DenseProfileError('no active dense generation; run dense-migration prepare/cutover');
  }
  if (active.writer_locked || active.phase === 'prepared' || active.phase === 'indexing' || active.phase === 'verifying') {
    throw new DenseMigrationInProgressError(`migration running (phase=${active.phase}); reads/writes paused`);
  }
  if (active.phase !== 'active' || active.target_profile !== DENSE_PROFILE) {
    throw new DenseProfileError(`unexpected generation (phase=${active.phase}, profile=${active.target_profile})`);
  }
  return { model: DENSE_MODEL, profile: DENSE_PROFILE, dimensions: DENSE_DIMENSIONS };
}

/** Collection-Modell gegen das aktive Profil; alte/gemischte Raeume scheitern. */
export function assertCollectionProfile(model: string | null): void {
  if (model !== DENSE_MODEL) {
    throw new DenseProfileError(`collection uses '${model ?? 'null'}', active is '${DENSE_MODEL}'; migrate first`);
  }
}

/**
 * Writer-Gate in derselben Transaktion wie der Write: prueft die
 * Migrationssperre ueber denselben Client, dann laeuft work(client).
 * Sperre oder fehlender aktiver Raum rollt zurueck statt zu mischen.
 */
export async function withDenseWrite<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await assertActiveDenseProfile({
        query: (text: string, params?: unknown[]) =>
          client.query(text, params as unknown[]).then((r) => ({ rows: r.rows, rowCount: r.rowCount })),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    try {
      const out = await work(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}
