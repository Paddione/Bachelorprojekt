import { pool, ensureSchemaOnce } from './db-pool';
import { refFor } from './content-registry';
import { idsToPrune } from './sdlc/admin/version-prune';
import { isConflict as detectConflict, nextVersion as bumpVersion } from './sdlc/admin/conflict';
import type { Pool, PoolClient } from 'pg';

// ─── Service-page content store (per-slug) ────────────────────────────────────

async function initServicePageConfigTable(): Promise<void> {
  return ensureSchemaOnce('service_page_config', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_page_config (
        brand        TEXT NOT NULL REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        slug         TEXT NOT NULL,
        page_content JSONB,
        version      INTEGER NOT NULL DEFAULT 0,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (brand, slug)
      )
    `);
  });
}

// ─── Content-Store accessors (T000306) ────────────────────────────────────────

export interface ContentRead { value: unknown; version: number }

export class ContentConflictError extends Error {
  code = 'CONFLICT' as const;
  constructor(
    public currentVersion: number,
    public currentValue: unknown,
    public editor: string | null,
  ) {
    super('content version conflict');
  }
}

function safeJson(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

async function liveRead(
  client: Pool | PoolClient,
  brand: string,
  ref: { contentType: string; storeKey: string },
): Promise<ContentRead> {
  switch (ref.contentType) {
    case 'site_setting': {
      const r = await client.query(
        'SELECT value, version FROM site_settings WHERE brand=$1 AND key=$2',
        [brand, ref.storeKey],
      );
      return r.rows.length
        ? { value: safeJson(r.rows[0].value), version: r.rows[0].version }
        : { value: null, version: 0 };
    }
    case 'legal_page': {
      const r = await client.query(
        'SELECT content_html, version FROM legal_pages WHERE brand=$1 AND page_key=$2',
        [brand, ref.storeKey],
      );
      return r.rows.length
        ? { value: r.rows[0].content_html, version: r.rows[0].version }
        : { value: null, version: 0 };
    }
    case 'service': {
      await initServicePageConfigTable();
      const r = await client.query(
        'SELECT page_content, version FROM service_page_config WHERE brand=$1 AND slug=$2',
        [brand, ref.storeKey],
      );
      return r.rows.length
        ? { value: safeJson(r.rows[0].page_content), version: r.rows[0].version }
        : { value: null, version: 0 };
    }
    case 'leistungen': {
      const r = await client.query(
        'SELECT categories_json, version FROM leistungen_config WHERE brand=$1',
        [brand],
      );
      return r.rows.length
        ? { value: safeJson(r.rows[0].categories_json), version: r.rows[0].version }
        : { value: null, version: 0 };
    }
    default:
      throw new Error('unknown contentType ' + ref.contentType);
  }
}

async function liveWrite(
  client: Pool | PoolClient,
  brand: string,
  ref: { contentType: string; storeKey: string },
  value: unknown,
  version: number,
): Promise<void> {
  switch (ref.contentType) {
    case 'site_setting':
      await client.query(
        `INSERT INTO site_settings (brand, key, value, version) VALUES ($1,$2,$3,$4)
         ON CONFLICT (brand, key) DO UPDATE SET value=$3, version=$4`,
        [brand, ref.storeKey, JSON.stringify(value), version],
      );
      return;
    case 'legal_page':
      await client.query(
        `INSERT INTO legal_pages (brand, page_key, content_html, version) VALUES ($1,$2,$3,$4)
         ON CONFLICT (brand, page_key) DO UPDATE SET content_html=$3, version=$4`,
        [brand, ref.storeKey, String(value), version],
      );
      return;
    case 'service':
      await initServicePageConfigTable();
      await client.query(
        `INSERT INTO service_page_config (brand, slug, page_content, version, updated_at) VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (brand, slug) DO UPDATE SET page_content=$3, version=$4, updated_at=now()`,
        [brand, ref.storeKey, JSON.stringify(value), version],
      );
      return;
    case 'leistungen':
      await client.query(
        `INSERT INTO leistungen_config (brand, categories_json, version) VALUES ($1,$2,$3)
         ON CONFLICT (brand) DO UPDATE SET categories_json=$2, version=$3`,
        [brand, JSON.stringify(value), version],
      );
      return;
  }
}

export async function readContent(brand: string, contentKey: string): Promise<ContentRead> {
  const ref = refFor(contentKey);
  if (!ref) throw new Error('unknown contentKey ' + contentKey);
  return liveRead(pool, brand, ref);
}

export async function writeContent(
  brand: string,
  contentKey: string,
  value: unknown,
  baseVersion: number,
  editor: string,
): Promise<{ version: number }> {
  const ref = refFor(contentKey);
  if (!ref) throw new Error('unknown contentKey ' + contentKey);
  const client = await pool.connect();
  let released = false;
  try {
    await client.query('BEGIN');
    const cur = await liveRead(client, brand, ref);
    if (detectConflict(cur.version === 0 ? null : cur.version, baseVersion)) {
      const err = new ContentConflictError(cur.version, cur.value, null);
      await client.query('ROLLBACK').catch(() => {});
      released = true;
      client.release();
      throw err;
    }
    if (cur.value !== null) {
      await client.query(
        `INSERT INTO content_versions (brand, content_key, content_type, snapshot, editor)
         VALUES ($1,$2,$3,$4,$5)`,
        [brand, contentKey, ref.contentType, JSON.stringify({ value: cur.value, version: cur.version }), editor],
      );
    }
    const ver = bumpVersion(cur.version === 0 ? null : cur.version);
    await liveWrite(client, brand, ref, value, ver);
    const ids = await client.query(
      `SELECT id FROM content_versions WHERE brand=$1 AND content_key=$2 ORDER BY created_at DESC`,
      [brand, contentKey],
    );
    const prune = idsToPrune(ids.rows.map((r: Record<string, unknown>) => Number(r.id)));
    if (prune.length) {
      await client.query(`DELETE FROM content_versions WHERE id = ANY($1)`, [prune]);
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

export async function listVersions(brand: string, contentKey: string) {
  const r = await pool.query(
    `SELECT id, editor, created_at, snapshot
     FROM content_versions
     WHERE brand=$1 AND content_key=$2
     ORDER BY created_at DESC`,
    [brand, contentKey],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    editor: row.editor,
    createdAt: row.created_at,
    snapshot: safeJson(row.snapshot),
  }));
}
