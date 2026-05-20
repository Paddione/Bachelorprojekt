import { pool } from './website-db';

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

export async function listSoftwareAssets(): Promise<SoftwareAsset[]> {
  const result = await pool.query(
    'SELECT * FROM platform.software_assets ORDER BY sort_order ASC, name ASC'
  );
  return result.rows;
}

export async function listHardwareAssets(): Promise<HardwareAsset[]> {
  const result = await pool.query(
    'SELECT * FROM platform.hardware_assets ORDER BY sort_order ASC, name ASC'
  );
  return result.rows;
}

export async function upsertSoftwareAsset(asset: Partial<SoftwareAsset>): Promise<SoftwareAsset> {
  const result = await pool.query(
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
  await pool.query('DELETE FROM platform.software_assets WHERE id = $1', [id]);
}

export async function getTicketsByAsset(slug: string) {
  const result = await pool.query(`
    SELECT t.id, t.external_id, t.title, t.status, t.created_at
    FROM tickets.tickets t
    JOIN tickets.ticket_tags tt ON tt.ticket_id = t.id
    JOIN tickets.tags tg ON tg.id = tt.tag_id
    WHERE tg.name = $1
    ORDER BY t.created_at DESC
  `, [`component:${slug}`]);
  return result.rows;
}
