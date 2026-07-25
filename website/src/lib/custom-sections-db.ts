import { pool } from './db-pool';

// ── Custom Website Sections ────────────────────────────────────────────────

export interface CustomSectionField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'url';
  required: boolean;
}

export interface CustomSection {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  fields: CustomSectionField[];
  content: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

let customSectionsReady = false;
// NOTE: Custom sections are not brand-scoped (unlike other content tables).
// This is intentional for the current single-brand deployment. If multi-brand
// support is needed, add a brand TEXT column and filter all queries accordingly.
async function initCustomSectionsTable(): Promise<void> {
  if (customSectionsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_custom_sections (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        TEXT        UNIQUE NOT NULL,
      title       TEXT        NOT NULL,
      sort_order  INT         NOT NULL DEFAULT 0,
      fields      JSONB       NOT NULL DEFAULT '[]',
      content     JSONB       NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  customSectionsReady = true;
}

export async function listCustomSections(): Promise<CustomSection[]> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `SELECT id, slug, title, sort_order, fields, content, created_at, updated_at
     FROM website_custom_sections ORDER BY sort_order ASC, created_at ASC`
  );
  return r.rows;
}

export async function getCustomSection(slug: string): Promise<CustomSection | null> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `SELECT id, slug, title, sort_order, fields, content, created_at, updated_at
     FROM website_custom_sections WHERE slug = $1`,
    [slug]
  );
  return r.rows[0] ?? null;
}

export async function createCustomSection(params: {
  slug: string;
  title: string;
  fields: CustomSectionField[];
}): Promise<CustomSection> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `INSERT INTO website_custom_sections (slug, title, fields)
     VALUES ($1, $2, $3)
     RETURNING id, slug, title, sort_order, fields, content, created_at, updated_at`,
    [params.slug, params.title, JSON.stringify(params.fields)]
  );
  return r.rows[0];
}

export async function updateCustomSection(slug: string, params: {
  title?: string;
  fields?: CustomSectionField[];
  content?: Record<string, string>;
  sort_order?: number;
}): Promise<CustomSection | null> {
  await initCustomSectionsTable();
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  if (params.title !== undefined) { vals.push(params.title); sets.push(`title = $${vals.length}`); }
  if (params.fields !== undefined) { vals.push(JSON.stringify(params.fields)); sets.push(`fields = $${vals.length}`); }
  if (params.content !== undefined) { vals.push(JSON.stringify(params.content)); sets.push(`content = $${vals.length}`); }
  if (params.sort_order !== undefined) { vals.push(params.sort_order); sets.push(`sort_order = $${vals.length}`); }
  if (vals.length === 0) return getCustomSection(slug);
  vals.push(slug);
  const r = await pool.query<CustomSection>(
    `UPDATE website_custom_sections SET ${sets.join(', ')}
     WHERE slug = $${vals.length}
     RETURNING id, slug, title, sort_order, fields, content, created_at, updated_at`,
    vals
  );
  return r.rows[0] ?? null;
}

export async function deleteCustomSection(slug: string): Promise<void> {
  await initCustomSectionsTable();
  await pool.query('DELETE FROM website_custom_sections WHERE slug = $1', [slug]);
}
