// Versioned store for the React homepage block document.
//
// Mirrors the optimistic-concurrency semantics of the website content store
// (writeContent/listVersions/ContentConflictError in website-db.ts) but in an
// ISOLATED pair of tables so the React homepage document is independent of the
// Astro site's content_versions. Brand-scoped (one live document per brand).
//
// Tables (created lazily here, and by scripts/migrate-homepage-blocks.mjs):
//   homepage_block_documents(brand PK, document JSONB, version INT, updated_at)
//   homepage_block_versions(id BIGSERIAL PK, brand, snapshot JSONB, editor, created_at)
//
// The server zod schema (homepage-blocks-schema.ts) is the source of truth for
// what may be persisted — save() validates fail-closed before writing.
import pg from 'pg';
import { isConflict, nextVersion } from './admin/conflict';
import { idsToPrune } from './admin/version-prune';
import {
  validateHomepageDocument,
  type HomepageBlocksDocumentType,
  type HomepageFieldError,
} from './homepage-blocks-schema';

export type { HomepageBlocksDocumentType };

const pool = new pg.Pool({
  connectionString:
    process.env.SESSIONS_DATABASE_URL ||
    'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website',
});

let tablesReady: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS homepage_block_documents (
          brand      TEXT        PRIMARY KEY,
          document   JSONB       NOT NULL,
          version    INTEGER     NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS homepage_block_versions (
          id         BIGSERIAL   PRIMARY KEY,
          brand      TEXT        NOT NULL,
          snapshot   JSONB       NOT NULL,
          editor     TEXT        NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS homepage_block_versions_brand_idx
          ON homepage_block_versions (brand, created_at DESC)
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

/** Test-only: mark tables ready (skip DDL) so query mocks see only real I/O. */
export function __setTablesReadyForTests(): void {
  tablesReady = Promise.resolve();
}
/** Test-only: reset the run-once table cache. */
export function __resetForTests(): void {
  tablesReady = null;
}

export class HomepageConflictError extends Error {
  code = 'CONFLICT' as const;
  constructor(public currentVersion: number, public currentValue: HomepageBlocksDocumentType | null) {
    super('homepage block version conflict');
  }
}

export class HomepageValidationError extends Error {
  code = 'INVALID' as const;
  constructor(public errors: HomepageFieldError[]) {
    super('homepage block document failed validation');
  }
}

function safeJson<T>(v: unknown): T {
  if (v != null && typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return v as T; }
  }
  return v as T;
}

export interface HomepageReadResult {
  document: HomepageBlocksDocumentType | null;
  version: number;
}

export async function readCurrent(brand: string): Promise<HomepageReadResult> {
  await ensureTables();
  const r = await pool.query('SELECT document, version FROM homepage_block_documents WHERE brand=$1', [brand]);
  if (!r.rows.length) return { document: null, version: 0 };
  return { document: safeJson<HomepageBlocksDocumentType>(r.rows[0].document), version: r.rows[0].version };
}

/**
 * Persist a new homepage document with optimistic concurrency.
 * Validates fail-closed (HomepageValidationError) before any DB write;
 * throws HomepageConflictError when `baseVersion` is stale.
 */
export async function save(
  brand: string,
  payload: unknown,
  baseVersion: number,
  editor: string,
): Promise<{ version: number }> {
  const validation = validateHomepageDocument(payload);
  if (!validation.ok) throw new HomepageValidationError(validation.errors);
  const document = validation.document;

  await ensureTables();
  const client = await pool.connect();
  let released = false;
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT document, version FROM homepage_block_documents WHERE brand=$1', [brand]);
    const curVersion: number = cur.rows.length ? cur.rows[0].version : 0;
    const curValue = cur.rows.length ? safeJson<HomepageBlocksDocumentType>(cur.rows[0].document) : null;

    if (isConflict(curVersion === 0 ? null : curVersion, baseVersion)) {
      await client.query('ROLLBACK').catch(() => {});
      released = true;
      client.release();
      throw new HomepageConflictError(curVersion, curValue);
    }

    if (curValue !== null) {
      await client.query(
        `INSERT INTO homepage_block_versions (brand, snapshot, editor) VALUES ($1, $2, $3)`,
        [brand, JSON.stringify({ document: curValue, version: curVersion }), editor],
      );
    }

    const ver = nextVersion(curVersion === 0 ? null : curVersion);
    await client.query(
      `INSERT INTO homepage_block_documents (brand, document, version, updated_at)
         VALUES ($1, $2, $3, now())
       ON CONFLICT (brand) DO UPDATE SET document = $2, version = $3, updated_at = now()`,
      [brand, JSON.stringify(document), ver],
    );

    const ids = await client.query(
      `SELECT id FROM homepage_block_versions WHERE brand=$1 ORDER BY created_at DESC`,
      [brand],
    );
    const prune = idsToPrune(ids.rows.map((row: { id: number | string }) => Number(row.id)));
    if (prune.length) {
      await client.query(`DELETE FROM homepage_block_versions WHERE id = ANY($1)`, [prune]);
    }

    await client.query('COMMIT');
    return { version: ver };
  } catch (e) {
    if (!released) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw e;
  } finally {
    if (!released) {
      client.release();
    }
  }
}

export async function listVersions(brand: string): Promise<Array<{ id: number; editor: string; createdAt: Date }>> {
  await ensureTables();
  const r = await pool.query(
    `SELECT id, editor, created_at FROM homepage_block_versions WHERE brand=$1 ORDER BY created_at DESC`,
    [brand],
  );
  return r.rows.map((row: { id: number | string; editor: string; created_at: Date }) => ({ id: Number(row.id), editor: row.editor, createdAt: row.created_at }));
}

/**
 * Restore a historical version as a new live version (no destructive
 * overwrite — the current doc is snapshotted by the save() it delegates to).
 */
export async function restore(brand: string, versionId: number, editor: string): Promise<{ version: number }> {
  await ensureTables();
  const snap = await pool.query(
    `SELECT snapshot FROM homepage_block_versions WHERE brand=$1 AND id=$2`,
    [brand, versionId],
  );
  if (!snap.rows.length) throw new Error('version not found');
  const snapshot = safeJson<{ document: HomepageBlocksDocumentType; version: number }>(snap.rows[0].snapshot);
  const cur = await readCurrent(brand);
  return save(brand, snapshot.document, cur.version, editor);
}
