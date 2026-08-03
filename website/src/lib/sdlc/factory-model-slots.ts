import { pool } from './db-pool';

export const PHASES = ['scout', 'plan', 'implement', 'verify', 'deploy'] as const;
export type FactoryPhase = typeof PHASES[number];

export interface ModelSlot {
  phase: FactoryPhase;
  provider: string;
  modelId: string;
  baseUrl: string | null;
}

export function isPhase(x: unknown): x is FactoryPhase {
  return typeof x === 'string' && (PHASES as readonly string[]).includes(x);
}

export async function readAllSlots(): Promise<ModelSlot[]> {
  const res = await pool.query(
    'SELECT phase, provider, model_id, base_url FROM tickets.factory_model_slots'
  );
  return res.rows.map(row => ({
    phase: row.phase as FactoryPhase,
    provider: row.provider,
    modelId: row.model_id,
    baseUrl: row.base_url,
  }));
}

export async function writeSlot(
  phase: FactoryPhase,
  provider: string,
  modelId: string,
  baseUrl: string | null,
  setBy: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO tickets.factory_model_slots (phase, provider, model_id, base_url, set_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (phase) DO UPDATE SET
       provider = EXCLUDED.provider,
       model_id = EXCLUDED.model_id,
       base_url = EXCLUDED.base_url,
       set_by = EXCLUDED.set_by,
       updated_at = now()`,
    [phase, provider, modelId, baseUrl, setBy]
  );
}

export async function modelCatalog(): Promise<{ provider: string; modelId: string }[]> {
  const res = await pool.query(
    'SELECT DISTINCT provider, model_id FROM tickets.provider_config WHERE enabled = true ORDER BY provider, model_id'
  );
  return res.rows.map(row => ({
    provider: row.provider,
    modelId: row.model_id,
  }));
}
