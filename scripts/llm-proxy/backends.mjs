// scripts/llm-proxy/backends.mjs
import { execFileSync } from 'node:child_process';

/** @typedef {{ name:string, kind:'llamacpp'|'lmstudio'|'openai-remote',
 *   baseUrl:string, apiKeyEnv:string|null, enabled:boolean, priority:number,
 *   fixups:string[], modelAliases:Record<string,string> }} Backend */

const SQL = `SELECT name||E'\\t'||kind||E'\\t'||base_url||E'\\t'||COALESCE(api_key_env,'')
  ||E'\\t'||enabled||E'\\t'||priority||E'\\t'||fixups::text||E'\\t'||model_aliases::text
  FROM tickets.llm_proxy_backends WHERE enabled ORDER BY priority ASC;`;

/** @returns {Backend[]} */
export function loadBackendsOnce() {
  if (process.env.LLM_PROXY_BACKENDS_JSON) {
    return JSON.parse(process.env.LLM_PROXY_BACKENDS_JSON);
  }
  const script = 'source scripts/factory/lib.sh; factory_resolve; factory_psql';
  const out = execFileSync('bash', ['-c', script], {
    input: SQL, encoding: 'utf8',
    env: { ...process.env, BRAND: process.env.BRAND || 'mentolder' },
  });
  return out.split('\n').filter(Boolean).map((line) => {
    const [name, kind, baseUrl, apiKeyEnv, enabled, priority, fixups, aliases] = line.split('\t');
    return {
      name, kind, baseUrl,
      apiKeyEnv: apiKeyEnv || null,
      enabled: enabled === 't',
      priority: Number(priority),
      fixups: JSON.parse(fixups || '[]'),
      modelAliases: JSON.parse(aliases || '{}'),
    };
  });
}

let cache = [];
export function getBackends() { return cache; }
export function resolveApiKey(backend) {
  return backend.apiKeyEnv ? (process.env[backend.apiKeyEnv] || null) : null;
}

export function startRegistryPoll(intervalMs, onUpdate) {
  const tick = () => {
    try { cache = loadBackendsOnce(); onUpdate?.(cache); }
    catch (err) { console.warn('[backends] registry poll failed, keeping last state:', err.message); }
  };
  tick();
  const t = setInterval(tick, intervalMs);
  t.unref?.();
  return t;
}
