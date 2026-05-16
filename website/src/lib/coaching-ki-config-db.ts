import type { Pool } from 'pg';

const KNOWN_PROVIDERS = new Set(['claude', 'openai', 'mistral', 'lumo']);

export interface KiConfig {
  id: number;
  brand: string;
  provider: string;
  isActive: boolean;
  modelName: string | null;
  displayName: string;
  createdAt: Date;
  // Verbindung
  apiKey: string | null;
  apiEndpoint: string | null;
  // Verhalten (gemeinsam)
  temperature: number | null;
  maxTokens: number | null;
  topP: number | null;
  systemPrompt: string | null;
  notes: string | null;
  // Anbieterspezifisch
  topK: number | null;
  thinkingMode: boolean;
  presencePenalty: number | null;
  frequencyPenalty: number | null;
  safePrompt: boolean;
  randomSeed: number | null;
  organizationId: string | null;
  euEndpoint: boolean;
  // Custom-Provider
  enabledFields: string[] | null;
}

export type UpdateKiProviderFields = Partial<Omit<KiConfig, 'id' | 'brand' | 'provider' | 'isActive' | 'createdAt' | 'enabledFields'>>;

function rowToKiConfig(row: Record<string, unknown>): KiConfig {
  return {
    id: row.id as number,
    brand: row.brand as string,
    provider: row.provider as string,
    isActive: row.is_active as boolean,
    modelName: (row.model_name as string | null) ?? null,
    displayName: row.display_name as string,
    createdAt: row.created_at as Date,
    apiKey: (row.api_key as string | null) ?? null,
    apiEndpoint: (row.api_endpoint as string | null) ?? null,
    temperature: row.temperature != null ? Number(row.temperature) : null,
    maxTokens: (row.max_tokens as number | null) ?? null,
    topP: row.top_p != null ? Number(row.top_p) : null,
    systemPrompt: (row.system_prompt as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    topK: (row.top_k as number | null) ?? null,
    thinkingMode: (row.thinking_mode as boolean) ?? false,
    presencePenalty: row.presence_penalty != null ? Number(row.presence_penalty) : null,
    frequencyPenalty: row.frequency_penalty != null ? Number(row.frequency_penalty) : null,
    safePrompt: (row.safe_prompt as boolean) ?? false,
    randomSeed: (row.random_seed as number | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    euEndpoint: (row.eu_endpoint as boolean) ?? false,
    enabledFields: Array.isArray(row.enabled_fields)
      ? (row.enabled_fields as string[])
      : row.enabled_fields != null
        ? (JSON.parse(row.enabled_fields as string) as string[])
        : null,
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

export async function getKiProviderById(pool: Pool, id: number): Promise<KiConfig | null> {
  const r = await pool.query(`SELECT * FROM coaching.ki_config WHERE id = $1`, [id]);
  return r.rows[0] ? rowToKiConfig(r.rows[0]) : null;
}

export async function setActiveProvider(pool: Pool, brand: string, provider: string): Promise<void> {
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
    await client.query(`UPDATE coaching.ki_config SET is_active = false WHERE brand = $1`, [brand]);
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

const COLUMN_MAP: Record<string, string> = {
  modelName: 'model_name', displayName: 'display_name',
  apiKey: 'api_key', apiEndpoint: 'api_endpoint',
  temperature: 'temperature', maxTokens: 'max_tokens', topP: 'top_p',
  systemPrompt: 'system_prompt', notes: 'notes',
  topK: 'top_k', thinkingMode: 'thinking_mode',
  presencePenalty: 'presence_penalty', frequencyPenalty: 'frequency_penalty',
  safePrompt: 'safe_prompt', randomSeed: 'random_seed',
  organizationId: 'organization_id', euEndpoint: 'eu_endpoint',
};

export async function updateKiProvider(
  pool: Pool,
  id: number,
  fields: UpdateKiProviderFields,
): Promise<KiConfig> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    const col = COLUMN_MAP[k];
    if (!col) continue;
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0) {
    const r = await pool.query(`SELECT * FROM coaching.ki_config WHERE id = $1`, [id]);
    if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
    return rowToKiConfig(r.rows[0]);
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE coaching.ki_config SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
  return rowToKiConfig(r.rows[0]);
}

export async function createKiProvider(
  pool: Pool,
  brand: string,
  data: { displayName: string; provider: string; enabledFields: string[] },
): Promise<KiConfig> {
  const r = await pool.query(
    `INSERT INTO coaching.ki_config (brand, provider, display_name, is_active, enabled_fields)
     VALUES ($1, $2, $3, false, $4)
     RETURNING *`,
    [brand, data.provider, data.displayName, JSON.stringify(data.enabledFields)],
  );
  return rowToKiConfig(r.rows[0]);
}

export async function deleteKiProvider(pool: Pool, id: number): Promise<void> {
  const r = await pool.query(`SELECT provider FROM coaching.ki_config WHERE id = $1`, [id]);
  if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
  const provider = r.rows[0].provider as string;
  if (KNOWN_PROVIDERS.has(provider)) {
    throw new Error('Nur Custom-Provider können gelöscht werden');
  }
  await pool.query(`DELETE FROM coaching.ki_config WHERE id = $1`, [id]);
}
