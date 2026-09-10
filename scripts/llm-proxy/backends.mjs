// scripts/llm-proxy/backends.mjs
import { execFileSync } from 'node:child_process';

// [T900107] loadout_slug faellt weg: der Proxy laeuft als Container des dev-pod
// und bedient ausschliesslich Remote-Backends. Es gibt kein lokales Loadout mehr,
// auf das eine Registry-Zeile zeigen koennte — die Spalte bleibt in der Tabelle
// (historische Zeilen), wird hier aber nicht mehr gelesen.
/** @typedef {{ name:string, kind:'llamacpp'|'lmstudio'|'openai-remote',
 *   baseUrl:string, apiKeyEnv:string|null, enabled:boolean, priority:number,
 *   fixups:string[], modelAliases:Record<string,string>, maxInflight:number,
 *   roles:string[] }} Backend */

const SQL = `SELECT name||E'\\t'||kind||E'\\t'||base_url||E'\\t'||COALESCE(api_key_env,'')
  ||E'\\t'||enabled||E'\\t'||priority||E'\\t'||fixups::text||E'\\t'||model_aliases::text
  ||E'\\t'||max_inflight||E'\\t'||roles::text
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
    const [name, kind, baseUrl, apiKeyEnv, enabled, priority, fixups, aliases, maxInflight, roles] = line.split('\t');
    return {
      name, kind, baseUrl,
      apiKeyEnv: apiKeyEnv || null,
      enabled: enabled === 't',
      priority: Number(priority),
      fixups: JSON.parse(fixups || '[]'),
      modelAliases: JSON.parse(aliases || '{}'),
      maxInflight: Number(maxInflight) || 1,
      roles: JSON.parse(roles || '[]'),
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
