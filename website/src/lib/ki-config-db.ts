// Pure DB access for the KI-Konfiguration admin UI.
// Reads/writes tickets.provider_config, tickets.provider_health and the
// embedding keys in site_settings. No imports of API/route modules (S2-safe).
import { pool } from './website-db';

export const EMBED_PRIMARY_KEY = 'ki_embed_primary';
export const EMBED_FALLBACK_KEY = 'ki_embed_fallback';

export type Tier = 'sonnet' | 'haiku';

export interface ProviderConfigEntry {
  id: number;
  source: string;
  tier: Tier;
  priority: number;
  provider: string;
  model_id: string;
  base_url: string | null;
  max_concurrent: number;
  enabled: boolean;
  updated_at: string | null;
}

export interface ProviderHealth {
  provider: string;
  failure_count: number;
  last_failure: string | null;
  cooldown_until: string | null;
  active_agents: number;
}

export interface NewProvider {
  source: string;
  tier: Tier;
  priority: number;
  provider: string;
  model_id: string;
  base_url: string | null;
  max_concurrent: number;
  enabled: boolean;
}

const COLS =
  'id, source, tier, priority, provider, model_id, base_url, max_concurrent, enabled, updated_at';

export async function listProviders(): Promise<ProviderConfigEntry[]> {
  // Coaching-Rows (source='coaching') leben im selben Store, werden aber über die
  // Coaching-UI/-Endpoints verwaltet — hier ausschließen, damit die Routing-Karten sauber bleiben.
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM tickets.provider_config WHERE source <> 'coaching' ORDER BY source, tier, priority`,
  );
  return rows.map(mapRow);
}

export async function listHealth(): Promise<ProviderHealth[]> {
  const { rows } = await pool.query(
    `SELECT provider, failure_count, last_failure, cooldown_until, active_agents
       FROM tickets.provider_health`,
  );
  return rows.map((r) => ({
    provider: r.provider,
    failure_count: Number(r.failure_count),
    last_failure: r.last_failure ? new Date(r.last_failure).toISOString() : null,
    cooldown_until: r.cooldown_until ? new Date(r.cooldown_until).toISOString() : null,
    active_agents: Number(r.active_agents),
  }));
}

/**
 * Count enabled providers for a (source, tier) pair, optionally excluding one id.
 * Used to refuse deleting/disabling the last enabled provider of an action.
 */
export async function countEnabledForSource(
  source: string,
  tier: Tier,
  excludeId?: number,
): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM tickets.provider_config
       WHERE source = $1 AND tier = $2 AND enabled = true
         AND ($3::bigint IS NULL OR id <> $3)`,
    [source, tier, excludeId ?? null],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function createProvider(p: NewProvider): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO tickets.provider_config
       (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     RETURNING id`,
    [p.source, p.tier, p.priority, p.provider, p.model_id, p.base_url, p.max_concurrent, p.enabled],
  );
  return Number(rows[0].id);
}

const UPDATABLE = [
  'source', 'tier', 'priority', 'provider', 'model_id', 'base_url', 'max_concurrent', 'enabled',
] as const;
type Updatable = (typeof UPDATABLE)[number];

export async function updateProvider(
  id: number,
  patch: Partial<Record<Updatable, unknown>>,
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const col of UPDATABLE) {
    if (col in patch) {
      vals.push(patch[col]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return false;
  vals.push(id);
  const r = await pool.query(
    `UPDATE tickets.provider_config SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${vals.length}`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function deleteProvider(id: number): Promise<boolean> {
  const r = await pool.query('DELETE FROM tickets.provider_config WHERE id = $1', [id]);
  return (r.rowCount ?? 0) > 0;
}

/** Fetch one entry (for last-provider checks on delete). */
export async function getProvider(id: number): Promise<ProviderConfigEntry | null> {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM tickets.provider_config WHERE id = $1`,
    [id],
  );
  return rows.length ? mapRow(rows[0]) : null;
}

function mapRow(r: Record<string, unknown>): ProviderConfigEntry {
  return {
    id: Number(r.id),
    source: String(r.source),
    tier: r.tier as Tier,
    priority: Number(r.priority),
    provider: String(r.provider),
    model_id: String(r.model_id),
    base_url: (r.base_url as string | null) ?? null,
    max_concurrent: Number(r.max_concurrent),
    enabled: Boolean(r.enabled),
    updated_at: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
  };
}
