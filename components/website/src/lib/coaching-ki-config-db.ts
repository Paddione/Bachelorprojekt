import type { Pool } from 'pg';

// ADAPTER über den vereinheitlichten Store tickets.provider_config (source='coaching').
// Der öffentliche Vertrag (KiConfig-Typ + Funktionssignaturen) bleibt identisch, damit die
// Coaching-Consumer (coaching-session-db, session-agent-factory, generate.ts, die
// /api/admin/coaching/ki-config-Endpoints, CoachingSettings.svelte) unverändert weiterlaufen.
// Speicherung ist physisch fusioniert: nach der Datenmigration (2026-06-14) und der
// Phase-2-Bereinigung (2026-07-09-coaching-phase2-drop-legacy.sql) sind die Legacy-Tabellen
// `coaching.ki_config` und `coaching.ki_config_id_map` weg; das Adapter-Modul liest
// und schreibt ausschließlich `tickets.provider_config`. Die Spalte
// `coaching.sessions.ki_config_id` und ihr FK auf `tickets.provider_config` bleiben
// erhalten und sind die einzige Brücke zwischen Coaching-Sessions und KI-Provider.

const COACHING_SOURCE = 'coaching';
const COACHING_TIER = 'coaching';
const KNOWN_PROVIDERS = new Set([
  'openai', 'mistral', 'lumo', 'claude', 'custom_lmstudio',
  'deepseek', 'anthropic', 'local-cluster', 'local-lmstudio', 'local-ollama',
]);

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
  const modelId = (row.model_id as string | null) ?? null;
  return {
    id: row.id as number,
    brand: row.brand as string,
    provider: row.provider as string,
    isActive: (row.is_active as boolean) ?? false,
    // model_id ist NOT NULL im Routing-Schema; Coaching speichert '' statt NULL → zurück auf null.
    modelName: modelId === '' ? null : modelId,
    displayName: (row.display_name as string | null) ?? (row.provider as string),
    createdAt: (row.updated_at as Date) ?? new Date(0),
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
    `SELECT * FROM tickets.provider_config WHERE source = $1 AND brand = $2 ORDER BY id`,
    [COACHING_SOURCE, brand],
  );
  return r.rows.map(rowToKiConfig);
}

export async function getActiveProvider(pool: Pool, brand: string): Promise<KiConfig | null> {
  const r = await pool.query(
    `SELECT * FROM tickets.provider_config WHERE source = $1 AND brand = $2 AND is_active = true LIMIT 1`,
    [COACHING_SOURCE, brand],
  );
  return r.rows[0] ? rowToKiConfig(r.rows[0]) : null;
}

export async function getKiProviderById(pool: Pool, id: number): Promise<KiConfig | null> {
  const r = await pool.query(
    `SELECT * FROM tickets.provider_config WHERE id = $1 AND source = $2`,
    [id, COACHING_SOURCE],
  );
  return r.rows[0] ? rowToKiConfig(r.rows[0]) : null;
}

export async function setActiveProvider(pool: Pool, brand: string, provider: string): Promise<void> {
  const exists = await pool.query(
    `SELECT id FROM tickets.provider_config WHERE source = $1 AND brand = $2 AND provider = $3`,
    [COACHING_SOURCE, brand, provider],
  );
  if (exists.rows.length === 0) {
    throw new Error(`Provider '${provider}' not found for brand '${brand}'`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE tickets.provider_config SET is_active = false WHERE source = $1 AND brand = $2`,
      [COACHING_SOURCE, brand],
    );
    await client.query(
      `UPDATE tickets.provider_config SET is_active = true WHERE source = $1 AND brand = $2 AND provider = $3`,
      [COACHING_SOURCE, brand, provider],
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
  modelName: 'model_id', displayName: 'display_name',
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
    // model_id ist NOT NULL: modelName=null wird als '' gespeichert (Lesen mappt zurück).
    vals.push(k === 'modelName' ? (v ?? '') : v);
  }
  if (sets.length === 0) {
    const r = await pool.query(`SELECT * FROM tickets.provider_config WHERE id = $1 AND source = $2`, [id, COACHING_SOURCE]);
    if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
    return rowToKiConfig(r.rows[0]);
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE tickets.provider_config SET ${sets.join(', ')} WHERE id = $${i} AND source = '${COACHING_SOURCE}' RETURNING *`,
    vals,
  );
  if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
  return rowToKiConfig(r.rows[0]);
}

export async function createKiProvider(
  pool: Pool,
  brand: string,
  data: { displayName: string; provider: string; enabledFields: string[] | null },
): Promise<KiConfig> {
  // Explizite Eindeutigkeits-Prüfung (brand, provider) — robust unabhängig von Index-Enforcement.
  const dup = await pool.query(
    `SELECT 1 FROM tickets.provider_config WHERE source = $1 AND brand = $2 AND provider = $3`,
    [COACHING_SOURCE, brand, data.provider],
  );
  if (dup.rows.length > 0) {
    throw new Error(`Provider '${data.provider}' existiert bereits für Brand '${brand}'`);
  }
  // priority muss unter UNIQUE(source,tier,priority) eindeutig sein → max+1 über alle Coaching-Rows.
  const next = await pool.query(
    `SELECT COALESCE(MAX(priority), 0) + 1 AS p FROM tickets.provider_config WHERE source = $1 AND tier = $2`,
    [COACHING_SOURCE, COACHING_TIER],
  );
  const priority = next.rows[0].p as number;
  const r = await pool.query(
    `INSERT INTO tickets.provider_config
       (brand, source, tier, priority, provider, model_id, enabled, is_active, display_name, enabled_fields)
     VALUES ($1, $2, $3, $4, $5, '', true, false, $6, $7)
     RETURNING *`,
    [brand, COACHING_SOURCE, COACHING_TIER, priority, data.provider, data.displayName,
      data.enabledFields !== null ? JSON.stringify(data.enabledFields) : null],
  );
  return rowToKiConfig(r.rows[0]);
}

export async function deleteKiProvider(pool: Pool, id: number): Promise<void> {
  const r = await pool.query(
    `SELECT provider FROM tickets.provider_config WHERE id = $1 AND source = $2`,
    [id, COACHING_SOURCE],
  );
  if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
  const provider = r.rows[0].provider as string;
  if (KNOWN_PROVIDERS.has(provider)) {
    throw new Error('Nur Custom-Provider können gelöscht werden');
  }
  await pool.query(`DELETE FROM tickets.provider_config WHERE id = $1 AND source = $2`, [id, COACHING_SOURCE]);
}
