// scripts/toolset/lib/adapters/openclaw.mjs — User-Scope-Adapter (T900794).
// Verwaltet ~/.openclaw/openclaw.json (User-Scope, Doku-Befund T900791):
// lesen + validieren + `openclaw mcp doctor --probe`. Schreibt nie —
// sync.mjs/check.mjs lösen `file` gegen den Repo-Root auf, wo das Ziel nie
// existiert, und überspringen es per SKIP. CI bleibt offline-fähig;
// `probe` läuft nur dort, wo Gateway plus Token vorhanden sind (GPU-Host).
import { spawnSync } from 'node:child_process';

export const file = '~/.openclaw/openclaw.json';
export const scope = 'user';

// JSON5-light: volle `//`-Kommentarzeilen verwerfen (Format-Vertrag aus
// tests/py/spec/native_ported/spec/test_openclaw_ops_bot.py), Rest strikt parsen. `//` in Werten wie
// URLs bleibt erhalten, weil nur ganze Zeilen fallen.
export function parse(text) {
  const stripped = String(text)
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  return JSON.parse(stripped);
}

// Validiert einen User-Scope-Configtext. Rückgabe: Fehlerliste (leer = gültig).
export function validate(text) {
  let cfg;
  try {
    cfg = parse(text);
  } catch (e) {
    return [`config is not valid JSON(5): ${e.message}`];
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return ['config must be a JSON object'];
  }
  const errors = [];
  const servers = cfg?.mcp?.servers;
  if (servers !== undefined) {
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
      errors.push('mcp.servers must be an object');
    } else {
      for (const [name, entry] of Object.entries(servers)) {
        if (!entry || typeof entry !== 'object') {
          errors.push(`mcp.servers.${name} must be an object`);
        }
      }
    }
  }
  return errors;
}

// Namen der konfigurierten MCP-Server (leere Liste ohne mcp-Block).
export function serverNames(text) {
  const cfg = parse(text);
  const servers = cfg?.mcp?.servers;
  if (!servers || typeof servers !== 'object') return [];
  return Object.keys(servers).sort();
}

// sync/check-Vertrag wie claude.mjs/opencode.mjs: Text rein, Text raus.
// Der Adapter verwaltet keinen Repo-Zustand (User-Scope) und gibt den Text
// byte-identisch zurück; unparsebare Config ist Drift (wirft).
export function render(currentText, _ctx) {
  const errors = validate(currentText);
  if (errors.length > 0) {
    throw new Error(`invalid openclaw user-scope config: ${errors.join('; ')}`);
  }
  return currentText;
}

// `openclaw mcp doctor <server> --probe` für einen Server. Reine Lese-Probe;
// der Spawner ist injizierbar, damit Tests ohne Gateway/Binary auskommen.
// Rückgabe: { ok, output } bzw. { ok: false, skipped, reason } offline.
export function probe(server, opts = {}) {
  const run = opts.spawn ?? ((args) => spawnSync('openclaw', args, { encoding: 'utf8', timeout: 30000 }));
  let res;
  try {
    res = run(['mcp', 'doctor', server, '--probe']);
  } catch (e) {
    return { ok: false, skipped: true, reason: `probe spawn failed: ${e.message}` };
  }
  if (res.error) {
    return { ok: false, skipped: true, reason: `openclaw binary unavailable: ${res.error.message}` };
  }
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  return { ok: res.status === 0, output };
}
