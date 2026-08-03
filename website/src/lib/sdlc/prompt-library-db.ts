// website/src/lib/prompt-library-db.ts
// DB layer for the reusable Prompt Library (F2 — Prompt-DB).
//
// Brand-scoped, reusable canned replies / prompts that admins can insert into
// the messaging compose box for fast, consistent answers. Pattern mirrors
// messaging-db.ts (shared-db pool, dns.resolve4 lookup) and
// coaching-ki-config-db.ts (pool injected as first arg → unit-testable with
// pg-mem).
//
// EVERY exported query calls ensurePromptLibrarySchema() first. This is the
// T000406 lesson: a defensive `CREATE TABLE IF NOT EXISTS` on the query path
// means a fresh DB (or a pod whose schema-init script hasn't run yet) never
// 500s with "relation prompt_library does not exist". The DDL is idempotent.

import pg from 'pg';
import { resolve4 } from 'dns';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const pool = new pg.Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig,
);

// ── Types ───────────────────────────────────────────────────────────────────

export interface Prompt {
  id: number;
  brand: string;
  category: string;
  title: string;
  body: string;
  description: string | null;
  isActive: boolean;
  usageCount: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertPromptArgs {
  /** When provided, updates that row by id (allows renaming title). */
  id?: number;
  brand: string;
  title: string;
  body: string;
  category?: string;
  description?: string | null;
  isActive?: boolean;
  createdBy?: string | null;
}

function rowToPrompt(row: Record<string, unknown>): Prompt {
  return {
    id: row.id as number,
    brand: row.brand as string,
    category: row.category as string,
    title: row.title as string,
    body: row.body as string,
    description: (row.description as string | null) ?? null,
    isActive: row.is_active as boolean,
    usageCount: Number(row.usage_count ?? 0),
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

// ── Schema ──────────────────────────────────────────────────────────────────

/**
 * Defensive, idempotent schema creation. Mirrors the additive table defined in
 * k3d/website-schema.yaml (init + ensure scripts). Called at the top of every
 * query in this module so the table always exists before it is read/written.
 * NO foreign key to public.brands — avoids the known korczewski bootstrap gap
 * where a fresh deploy has not yet seeded the brands table.
 */
export async function ensurePromptLibrarySchema(targetPool: pg.Pool = pool): Promise<void> {
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS prompt_library (
      id          SERIAL PRIMARY KEY,
      brand       TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'canned_reply',
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      description TEXT,
      is_active   BOOLEAN DEFAULT true,
      usage_count INTEGER DEFAULT 0,
      created_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT now(),
      updated_at  TIMESTAMPTZ DEFAULT now(),
      is_test_data BOOLEAN DEFAULT false,
      UNIQUE (brand, title)
    )
  `);
  await targetPool.query(`
    CREATE INDEX IF NOT EXISTS idx_prompt_library_brand_active
      ON prompt_library (brand) WHERE is_active
  `);
}

// ── Queries ─────────────────────────────────────────────────────────────────

export async function listPrompts(
  targetPool: pg.Pool,
  brand: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Prompt[]> {
  await ensurePromptLibrarySchema(targetPool);
  const where = opts.activeOnly
    ? 'WHERE brand = $1 AND is_active = true'
    : 'WHERE brand = $1';
  const { rows } = await targetPool.query(
    `SELECT * FROM prompt_library ${where}
     ORDER BY usage_count DESC, title ASC`,
    [brand],
  );
  return rows.map(rowToPrompt);
}

export async function getPrompt(targetPool: pg.Pool, id: number): Promise<Prompt | null> {
  await ensurePromptLibrarySchema(targetPool);
  const { rows } = await targetPool.query(
    'SELECT * FROM prompt_library WHERE id = $1',
    [id],
  );
  return rows[0] ? rowToPrompt(rows[0]) : null;
}

export async function upsertPrompt(targetPool: pg.Pool, args: UpsertPromptArgs): Promise<Prompt> {
  await ensurePromptLibrarySchema(targetPool);
  const category = args.category ?? 'canned_reply';
  const description = args.description ?? null;
  const isActive = args.isActive ?? true;

  if (args.id !== undefined) {
    // Update an existing row by id (supports renaming the title).
    const { rows } = await targetPool.query(
      `UPDATE prompt_library
         SET brand = $2, title = $3, body = $4, category = $5,
             description = $6, is_active = $7, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [args.id, args.brand, args.title, args.body, category, description, isActive],
    );
    if (!rows[0]) throw new Error(`Prompt ${args.id} not found`);
    return rowToPrompt(rows[0]);
  }

  // Insert, or update in place on (brand, title) conflict.
  const { rows } = await targetPool.query(
    `INSERT INTO prompt_library (brand, category, title, body, description, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (brand, title) DO UPDATE
       SET body = EXCLUDED.body,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           is_active = EXCLUDED.is_active,
           updated_at = now()
     RETURNING *`,
    [args.brand, category, args.title, args.body, description, isActive, args.createdBy ?? null],
  );
  return rowToPrompt(rows[0]);
}

export async function deletePrompt(targetPool: pg.Pool, id: number): Promise<number> {
  await ensurePromptLibrarySchema(targetPool);
  const r = await targetPool.query('DELETE FROM prompt_library WHERE id = $1', [id]);
  return r.rowCount ?? 0;
}

/**
 * Atomically bump usage_count for a prompt. Returns the new count, or null if
 * the id was unknown. Called when an admin inserts a prompt into a message.
 */
export async function incrementUsage(targetPool: pg.Pool, id: number): Promise<number | null> {
  await ensurePromptLibrarySchema(targetPool);
  const { rows } = await targetPool.query(
    `UPDATE prompt_library
       SET usage_count = usage_count + 1
     WHERE id = $1
     RETURNING usage_count`,
    [id],
  );
  return rows[0] ? Number(rows[0].usage_count) : null;
}
