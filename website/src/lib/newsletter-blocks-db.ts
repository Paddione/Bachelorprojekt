import { Pool } from 'pg';
import { resolve4 } from 'dns';

const DB_URL =
  process.env.SESSIONS_DATABASE_URL ||
  'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const defaultPool = new Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig,
);

export type NewsletterBlockType = 'header' | 'angebot' | 'cta' | 'text' | 'footer';

export interface NewsletterContentBlock {
  id: string;
  title: string;
  block_type: NewsletterBlockType;
  html_body: string;
  created_at: Date;
  updated_at: Date;
}

async function ensureTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_content_blocks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT NOT NULL,
      block_type  TEXT NOT NULL DEFAULT 'text',
      html_body   TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function listContentBlocks(
  pool: Pool = defaultPool,
): Promise<NewsletterContentBlock[]> {
  await ensureTable(pool);
  const result = await pool.query(
    `SELECT id, title, block_type, html_body, created_at, updated_at
     FROM newsletter_content_blocks
     ORDER BY created_at DESC`,
  );
  return result.rows;
}

export async function getContentBlock(
  id: string,
  pool: Pool = defaultPool,
): Promise<NewsletterContentBlock | null> {
  await ensureTable(pool);
  const result = await pool.query(
    `SELECT id, title, block_type, html_body, created_at, updated_at
     FROM newsletter_content_blocks WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function createContentBlock(
  params: { title: string; block_type: NewsletterBlockType; html_body: string },
  pool: Pool = defaultPool,
): Promise<NewsletterContentBlock> {
  await ensureTable(pool);
  const result = await pool.query(
    `INSERT INTO newsletter_content_blocks (title, block_type, html_body)
     VALUES ($1, $2, $3)
     RETURNING id, title, block_type, html_body, created_at, updated_at`,
    [params.title, params.block_type, params.html_body],
  );
  return result.rows[0];
}

export async function updateContentBlock(
  id: string,
  params: { title?: string; block_type?: NewsletterBlockType; html_body?: string },
  pool: Pool = defaultPool,
): Promise<NewsletterContentBlock | null> {
  await ensureTable(pool);
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  if (params.title !== undefined) {
    values.push(params.title);
    sets.push(`title = $${values.length}`);
  }
  if (params.block_type !== undefined) {
    values.push(params.block_type);
    sets.push(`block_type = $${values.length}`);
  }
  if (params.html_body !== undefined) {
    values.push(params.html_body);
    sets.push(`html_body = $${values.length}`);
  }
  if (sets.length === 1) return getContentBlock(id, pool); // only updated_at — no real change
  values.push(id);
  const result = await pool.query(
    `UPDATE newsletter_content_blocks SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, title, block_type, html_body, created_at, updated_at`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function deleteContentBlock(
  id: string,
  pool: Pool = defaultPool,
): Promise<void> {
  await ensureTable(pool);
  await pool.query(`DELETE FROM newsletter_content_blocks WHERE id = $1`, [id]);
}
