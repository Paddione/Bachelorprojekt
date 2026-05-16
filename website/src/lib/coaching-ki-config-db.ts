import type { Pool } from 'pg';

export interface KiConfig {
  id: number;
  brand: string;
  provider: 'claude' | 'openai' | 'mistral' | 'lumo';
  isActive: boolean;
  modelName: string | null;
  displayName: string;
  createdAt: Date;
}

function rowToKiConfig(row: Record<string, unknown>): KiConfig {
  return {
    id: row.id as number,
    brand: row.brand as string,
    provider: row.provider as KiConfig['provider'],
    isActive: row.is_active as boolean,
    modelName: (row.model_name as string | null) ?? null,
    displayName: row.display_name as string,
    createdAt: row.created_at as Date,
  };
}

export async function listKiProviders(pool: Pool, brand: string): Promise<KiConfig[]> {
  const r = await pool.query(
    `SELECT * FROM coaching.ki_config WHERE brand = $1 ORDER BY id`,
    [brand],
  );
  return r.rows.map(rowToKiConfig);
}

export async function getActiveProvider(pool: Pool, brand: string): Promise<KiConfig | null> {
  const r = await pool.query(
    `SELECT * FROM coaching.ki_config WHERE brand = $1 AND is_active = true LIMIT 1`,
    [brand],
  );
  return r.rows[0] ? rowToKiConfig(r.rows[0]) : null;
}

export async function setActiveProvider(pool: Pool, brand: string, provider: KiConfig['provider']): Promise<void> {
  const exists = await pool.query(
    `SELECT id FROM coaching.ki_config WHERE brand = $1 AND provider = $2`,
    [brand, provider],
  );
  if (exists.rows.length === 0) {
    throw new Error(`Provider '${provider}' not found for brand '${brand}'`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE coaching.ki_config SET is_active = false WHERE brand = $1`,
      [brand],
    );
    await client.query(
      `UPDATE coaching.ki_config SET is_active = true WHERE brand = $1 AND provider = $2`,
      [brand, provider],
    );
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function updateKiProvider(
  pool: Pool,
  id: number,
  fields: { modelName: string | null; displayName: string },
): Promise<KiConfig> {
  const r = await pool.query(
    `UPDATE coaching.ki_config
     SET model_name = $1, display_name = $2
     WHERE id = $3
     RETURNING *`,
    [fields.modelName, fields.displayName, id],
  );
  if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
  return rowToKiConfig(r.rows[0]);
}
