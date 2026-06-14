import { pool } from './website-db';
import type { Pool } from 'pg';

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

function apiKeyForProvider(provider: string): string {
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY || '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
  // local-cluster, local-lmstudio, local-ollama: no key needed
  return 'not-required';
}

export async function getProviderConfig(source: string, tier: 'sonnet' | 'haiku' | 'opus'): Promise<ProviderChoice> {
  if (tier === 'opus') {
    return { provider: 'anthropic', modelId: OPUS_MODEL, baseUrl: null, apiKey: process.env.ANTHROPIC_API_KEY || '' };
  }
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
      const { provider, model_id, base_url } = rows[0];
      return { provider, modelId: model_id, baseUrl: base_url ?? null, apiKey: apiKeyForProvider(provider) };
    }
  } catch (err) {
    console.error('[provider-config] DB lookup failed, falling back to anthropic:', err);
  }
  return { ...FALLBACK, apiKey: process.env.ANTHROPIC_API_KEY || '' };
}

/**
 * Record a provider failure. Sets cooldown_until = now() + minutesFromNow minutes.
 * The next call to getProviderConfig will skip this provider until the cooldown expires,
 * automatically falling through to the next priority row.
 */
export async function setProviderCooldown(
  dbPool: Pool,
  source: string,
  provider: string,
  minutesFromNow: number,
): Promise<void> {
  const minutes = Number.isFinite(minutesFromNow) && minutesFromNow > 0
    ? Math.floor(minutesFromNow)
    : 5;
  try {
    await dbPool.query(
      `INSERT INTO tickets.provider_health (provider, failure_count, last_failure, cooldown_until)
       VALUES ($1, 1, now(), now() + ($2 || ' minutes')::interval)
       ON CONFLICT (provider) DO UPDATE
         SET failure_count  = tickets.provider_health.failure_count + 1,
             last_failure   = now(),
             cooldown_until = now() + ($2 || ' minutes')::interval`,
      [provider, minutes],
    );
    console.warn(`[provider-config] ${source}: provider '${provider}' put on cooldown for ${minutes}m`);
  } catch (err) {
    console.error('[provider-config] setProviderCooldown failed (non-fatal):', err);
  }
}
