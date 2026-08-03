// Pure DB access for the LLM-Proxy backend registry admin UI.
// Reads/writes tickets.llm_proxy_backends. No imports of API/route modules (S2-safe).
import { pool } from './website-db';

export type BackendKind = 'llamacpp' | 'lmstudio' | 'openai-remote';
export const LLM_PROXY_KINDS: readonly BackendKind[] = ['llamacpp', 'lmstudio', 'openai-remote'] as const;

/** Named request transformations implemented inside the proxy (design §1 Fixups).
 *  Whitelist — the API never accepts a fixup outside this set. */
export const LLM_PROXY_FIXUPS = ['bonsai-system-role-fixup'] as const;
export type Fixup = (typeof LLM_PROXY_FIXUPS)[number];

export interface LlmProxyBackend {
  id: number;
  name: string;
  kind: BackendKind;
  base_url: string;
  /** Name of the env var holding the API key (never the key itself). */
  api_key_env: string | null;
  enabled: boolean;
  priority: number;
  fixups: Fixup[];
  model_aliases: Record<string, string>;
  updated_at: string | null;
}

export interface NewBackend {
  name: string;
  kind: BackendKind;
  base_url: string;
  api_key_env: string | null;
  enabled: boolean;
  priority: number;
  fixups: Fixup[];
  model_aliases: Record<string, string>;
}

const COLS =
  'id, name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, updated_at';

export async function listBackends(): Promise<LlmProxyBackend[]> {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM tickets.llm_proxy_backends ORDER BY priority, name`,
  );
  return rows.map(mapRow);
}

export async function getBackend(id: number): Promise<LlmProxyBackend | null> {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM tickets.llm_proxy_backends WHERE id = $1`,
    [id],
  );
  return rows.length ? mapRow(rows[0]) : null;
}

/**
 * Count enabled *local* backends (kind <> 'openai-remote'), optionally excluding one id.
 * Used to refuse deleting/disabling the last enabled local backend (design §4) — the remote
 * backends (DeepSeek/opencode-zen) are a paid last resort and must never be the sole route.
 */
export async function countEnabledLocal(excludeId?: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM tickets.llm_proxy_backends
       WHERE enabled = true AND kind <> 'openai-remote'
         AND ($1::bigint IS NULL OR id <> $1)`,
    [excludeId ?? null],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function createBackend(b: NewBackend): Promise<number> {
  if (!(LLM_PROXY_KINDS as readonly string[]).includes(b.kind)) {
    throw new Error(`Invalid backend kind: ${b.kind}`);
  }
  for (const f of b.fixups) {
    if (!(LLM_PROXY_FIXUPS as readonly string[]).includes(f)) {
      throw new Error(`Invalid fixup: ${f}`);
    }
  }
  const { rows } = await pool.query(
    `INSERT INTO tickets.llm_proxy_backends
       (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb, now())
     RETURNING id`,
    [b.name, b.kind, b.base_url, b.api_key_env, b.enabled, b.priority,
     JSON.stringify(b.fixups), JSON.stringify(b.model_aliases)],
  );
  return Number(rows[0].id);
}

const UPDATABLE = [
  'name', 'kind', 'base_url', 'api_key_env', 'enabled', 'priority', 'fixups', 'model_aliases',
] as const;
type Updatable = (typeof UPDATABLE)[number];

export async function updateBackend(
  id: number,
  patch: Partial<Record<Updatable, unknown>>,
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const col of UPDATABLE) {
    if (!(col in patch)) continue;
    const jsonb = col === 'fixups' || col === 'model_aliases';
    vals.push(jsonb ? JSON.stringify(patch[col]) : patch[col]);
    sets.push(`${col} = $${vals.length}${jsonb ? '::jsonb' : ''}`);
  }
  if (sets.length === 0) return false;
  vals.push(id);
  const r = await pool.query(
    `UPDATE tickets.llm_proxy_backends SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${vals.length}`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function deleteBackend(id: number): Promise<boolean> {
  const remaining = await countEnabledLocal(id);
  if (remaining === 0) {
    throw new Error('Cannot delete the last enabled local backend');
  }
  const r = await pool.query('DELETE FROM tickets.llm_proxy_backends WHERE id = $1', [id]);
  return (r.rowCount ?? 0) > 0;
}

function mapRow(r: Record<string, unknown>): LlmProxyBackend {
  return {
    id: Number(r.id),
    name: String(r.name),
    kind: r.kind as BackendKind,
    base_url: String(r.base_url),
    api_key_env: (r.api_key_env as string | null) ?? null,
    enabled: Boolean(r.enabled),
    priority: Number(r.priority),
    fixups: Array.isArray(r.fixups) ? (r.fixups as Fixup[]) : [],
    model_aliases:
      r.model_aliases && typeof r.model_aliases === 'object'
        ? (r.model_aliases as Record<string, string>)
        : {},
    updated_at: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
  };
}
