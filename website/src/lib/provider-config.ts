import { pool } from './website-db';
import type { Pool } from 'pg';
import { logger } from './logger';

export interface ProviderChoice {
  provider: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string;
  contextWindow: number | null;
  contextBudget: number | null;
}

const OPUS_MODEL = 'claude-opus-4-6';
const FALLBACK: Omit<ProviderChoice, 'apiKey'> = {
  provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null,
  contextWindow: null, contextBudget: null,
};

export class DisabledProviderError extends Error {
  constructor(providerName: string) {
    super(`Provider '${providerName}' is not enabled in provider_config`);
    this.name = 'DisabledProviderError';
  }
}

export function apiKeyForProvider(provider: string): string {
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY || '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || '';
  if (provider === 'opencode-zen') return process.env.OPENCODE_API_KEY || '';
  if (provider === 'google-gemini') return process.env.GEMINI_API_KEY || '';
  if (provider === 'github-models') return process.env.GITHUB_MODELS_TOKEN || '';
  // local-cluster, local-lmstudio, local-ollama, local-qwen35: no key needed
  return 'not-required';
}

export async function getProviderConfig(source: string, tier: 'sonnet' | 'haiku' | 'opus'): Promise<ProviderChoice> {
  if (tier === 'opus') {
    return {
      provider: 'anthropic', modelId: OPUS_MODEL, baseUrl: null,
      apiKey: process.env.ANTHROPIC_API_KEY || '', contextWindow: null, contextBudget: null,
    };
  }
  try {
    const { rows } = await pool.query(
      `SELECT pc.provider, pc.model_id, pc.base_url, pc.api_key, pc.context_window, pc.context_budget
         FROM tickets.provider_config pc
         LEFT JOIN tickets.provider_health ph ON ph.provider = pc.provider
        WHERE (pc.source = $1 OR pc.source = '*') AND pc.tier = $2 AND pc.enabled = true
          AND (ph.cooldown_until IS NULL OR ph.cooldown_until <= now())
        ORDER BY (pc.source = $1) DESC, pc.priority ASC
        LIMIT 1`,
      [source, tier],
    );
    if (rows.length) {
      const { provider, model_id, base_url, api_key, context_window, context_budget } = rows[0];
      const apiKey = (typeof api_key === 'string' && api_key) ? api_key : apiKeyForProvider(provider);
      return {
        provider, modelId: model_id, baseUrl: base_url ?? null, apiKey,
        contextWindow: context_window ?? null, contextBudget: context_budget ?? null,
      };
    }
  } catch (err) {
    logger.error({ err }, '[provider-config] DB lookup failed, falling back to anthropic');
  }
  return { ...FALLBACK, apiKey: process.env.ANTHROPIC_API_KEY || '' };
}

export async function getProviderByName(providerName: string, _brand?: string): Promise<ProviderChoice> {
  const { rows } = await pool.query(
    `SELECT provider, model_id, base_url, api_key, context_window, context_budget
       FROM tickets.provider_config
      WHERE provider = $1 AND enabled = true
      LIMIT 1`,
    [providerName],
  );
  if (!rows.length) {
    throw new DisabledProviderError(providerName);
  }
  const { provider, model_id, base_url, api_key, context_window, context_budget } = rows[0];
  const apiKey = (typeof api_key === 'string' && api_key) ? api_key : apiKeyForProvider(provider);
  return {
    provider, modelId: model_id, baseUrl: base_url ?? null, apiKey,
    contextWindow: context_window ?? null, contextBudget: context_budget ?? null,
  };
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
    logger.warn({ source, provider, minutes }, `[provider-config] provider '${provider}' put on cooldown for ${minutes}m`);
  } catch (err) {
    logger.error({ err }, '[provider-config] setProviderCooldown failed (non-fatal)');
  }
}
