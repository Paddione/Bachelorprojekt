import { platformPool } from './website-db';
import { ensureSchemaOnce } from './website-db';
import platformDescriptions from './platform-descriptions.generated.json';

export interface SoftwareAsset {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  emoji: string;
  clusters: string[];
  namespace: string | null;
  deployment_name: string | null;
  image_tag: string | null;
  url: string | null;
  base_status: string;
  sort_order: number;
}

export interface HardwareAsset {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  role: string;
  cluster: string;
  location: string | null;
  ip: string | null;
  os: string | null;
  k8s_node_name: string;
  sort_order: number;
}

// Idempotent platform-schema bootstrap + guarded German description seed.
// DDL mirrors website/src/db/migrations/20260521_create_platform_assets.sql so the
// tables are reproducible on a fresh DB. Descriptions are set ONLY where still NULL
// or the known English placeholder — never overwriting an admin edit. Wrapped in
// ensureSchemaOnce so it runs at most once per process (see website-db.ts T000304).
export async function runPlatformSchema(db: { query: typeof platformPool.query } = platformPool): Promise<void> {
  await db.query(`CREATE SCHEMA IF NOT EXISTS platform`);
  await db.query(`CREATE TABLE IF NOT EXISTS platform.software_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    description TEXT, category TEXT NOT NULL DEFAULT 'other', emoji TEXT NOT NULL DEFAULT '📦',
    clusters TEXT[] NOT NULL DEFAULT '{}', namespace TEXT, deployment_name TEXT, image_tag TEXT,
    url TEXT, base_status TEXT NOT NULL DEFAULT 'live', sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS platform.hardware_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    description TEXT, role TEXT NOT NULL DEFAULT 'unknown', cluster TEXT NOT NULL DEFAULT 'both',
    location TEXT, ip TEXT, os TEXT, k8s_node_name TEXT NOT NULL DEFAULT '', sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  for (const [slug, { de, en }] of Object.entries(platformDescriptions.software)) {
    await db.query(
      `UPDATE platform.software_assets SET description = $1, updated_at = now()
       WHERE slug = $2 AND (description IS NULL OR description = $3)`,
      [de, slug, en],
    );
  }
  for (const [slug, { de, en }] of Object.entries(platformDescriptions.hardware)) {
    await db.query(
      `UPDATE platform.hardware_assets SET description = $1
       WHERE slug = $2 AND (description IS NULL OR description = $3)`,
      [de, slug, en],
    );
  }
}

export function ensurePlatformSchema(): Promise<void> {
  return ensureSchemaOnce('platform-schema', () => runPlatformSchema(platformPool));
}

export async function listSoftwareAssets(): Promise<SoftwareAsset[]> {
  await ensurePlatformSchema();
  const result = await platformPool.query(
    'SELECT * FROM platform.software_assets ORDER BY sort_order ASC, name ASC'
  );
  return result.rows;
}

export async function listHardwareAssets(): Promise<HardwareAsset[]> {
  await ensurePlatformSchema();
  const result = await platformPool.query(
    'SELECT * FROM platform.hardware_assets ORDER BY sort_order ASC, name ASC'
  );
  return result.rows;
}

export async function upsertSoftwareAsset(asset: Partial<SoftwareAsset>): Promise<SoftwareAsset> {
  const result = await platformPool.query(
    `INSERT INTO platform.software_assets
      (slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, url, base_status, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       emoji = EXCLUDED.emoji,
       clusters = EXCLUDED.clusters,
       namespace = EXCLUDED.namespace,
       deployment_name = EXCLUDED.deployment_name,
       image_tag = EXCLUDED.image_tag,
       url = EXCLUDED.url,
       base_status = EXCLUDED.base_status,
       sort_order = EXCLUDED.sort_order,
       updated_at = now()
     RETURNING *`,
    [
      asset.slug, asset.name, asset.description, asset.category, asset.emoji,
      asset.clusters, asset.namespace, asset.deployment_name, asset.image_tag,
      asset.url, asset.base_status, asset.sort_order || 0
    ]
  );
  return result.rows[0];
}

export async function deleteSoftwareAsset(id: string): Promise<void> {
  await platformPool.query('DELETE FROM platform.software_assets WHERE id = $1', [id]);
}

export async function getTicketsByAsset(slug: string) {
  const result = await platformPool.query(`
    SELECT t.id, t.external_id, t.title, t.status, t.created_at
    FROM tickets.tickets t
    JOIN tickets.ticket_tags tt ON tt.ticket_id = t.id
    JOIN tickets.tags tg ON tg.id = tt.tag_id
    WHERE tg.name = $1
    ORDER BY t.created_at DESC
  `, [`component:${slug}`]);
  return result.rows;
}
