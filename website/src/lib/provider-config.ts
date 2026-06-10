import { pool } from './website-db';

export interface ProviderChoice {
  provider: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string;
}

const OPUS_MODEL = 'claude-opus-4-6';
const FALLBACK: Omit<ProviderChoice, 'apiKey'> = {
  provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null,
};

export async function getProviderConfig(source: string, tier: 'sonnet' | 'haiku' | 'opus'): Promise<ProviderChoice> {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (tier === 'opus') return { provider: 'anthropic', modelId: OPUS_MODEL, baseUrl: null, apiKey };
  try {
    const { rows } = await pool.query(
      `SELECT pc.provider, pc.model_id, pc.base_url
         FROM tickets.provider_config pc
         LEFT JOIN tickets.provider_health ph ON ph.provider = pc.provider
        WHERE (pc.source = $1 OR pc.source = '*') AND pc.tier = $2 AND pc.enabled = true
          AND (ph.cooldown_until IS NULL OR ph.cooldown_until <= now())
        ORDER BY (pc.source = $1) DESC, pc.priority ASC
        LIMIT 1`,
      [source, tier],
    );
    if (rows.length) {
      return { provider: rows[0].provider, modelId: rows[0].model_id, baseUrl: rows[0].base_url ?? null, apiKey };
    }
  } catch (err) {
    console.error('[provider-config] DB lookup failed, falling back to anthropic:', err);
  }
  return { ...FALLBACK, apiKey };
}
