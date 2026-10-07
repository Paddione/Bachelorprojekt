// scripts/toolset/lib/tools.mjs — Tool-Ebene der Toolset-Kette (T900983).
//
// Gemeinsame Logik für probe.mjs (schreibt den Lock), check.mjs (Drift + Schema) und
// toolset-context.sh (Rendering). Entscheidungen D1–D6: .agents/plans/toolset-tool-level/design.md.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as yamlPkg from 'js-yaml';
const yaml = yamlPkg.default ?? yamlPkg;

export const VALID_TIERS = ['safe', 'caution', 'assisted', 'dangerous'];
// Reihenfolge = Risiko, wie in VALID_TIERS. Rendering nennt alles ab `caution` einzeln.
const TIER_RANK = { safe: 0, caution: 1, assisted: 2, dangerous: 3 };
export const tierRank = (t) => TIER_RANK[t] ?? 0;

// D6: Ohne TOOLSET_LOCK liegt der Lock neben der Registry. Fixture-Registries lesen damit nie
// den echten Lock des Repos.
export function defaultLockPath(registryPath, env = process.env) {
  if (env.TOOLSET_LOCK) return env.TOOLSET_LOCK;
  return path.join(path.dirname(registryPath), 'toolset.lock.yaml');
}

export function loadLock(lockPath) {
  if (!fs.existsSync(lockPath)) return { lock_version: 2, servers: {} };
  const data = yaml.load(fs.readFileSync(lockPath, 'utf8')) || {};
  return { lock_version: data.lock_version ?? 2, servers: data.servers ?? {} };
}

// Hash über das, was ein Agent vom Tool sieht. Ändert sich Beschreibung oder Schema, muss
// die Kuration erneut hinschauen — der Name allein reicht dafür nicht.
export function toolHash(tool) {
  const payload = `${tool.description ?? ''}\n${JSON.stringify(tool.inputSchema ?? {})}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

// Glob mit `*` (beliebig viele Zeichen) und `?` (genau eins); sonst wörtlich.
export function globMatch(pattern, name) {
  const re = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(re).test(name);
}

// D3: erste passende tool_tiers-Zeile gewinnt, sonst Instanz-Tier, sonst safe.
export function resolveToolTier(name, instCfg) {
  for (const [pattern, tier] of Object.entries(instCfg?.tool_tiers ?? {})) {
    if (globMatch(pattern, name)) return tier;
  }
  return instCfg?.tier ?? 'safe';
}

// Abweichung zwischen gemessenem (`tools`) und geprüftem (`reviewed`) Stand eines Servers.
export function toolDrift(entry) {
  const tools = entry?.tools ?? {};
  const reviewed = entry?.reviewed ?? {};
  const added = Object.keys(tools).filter(n => !(n in reviewed)).sort();
  const removed = Object.keys(reviewed).filter(n => !(n in tools)).sort();
  const changed = Object.keys(tools).filter(n => n in reviewed && reviewed[n] !== tools[n]?.hash).sort();
  return { added, removed, changed };
}

// T900985 D6: Ist ein Tool per tools_suppressed (Globs) unterdrückt?
export function isToolSuppressed(name, instCfg) {
  return (instCfg?.tools_suppressed ?? []).some(p => globMatch(p, name));
}

// T900985 D6: unterdrückte Tools einer mcp-Instanz als Claude-Permission-Namen. Globs werden gegen
// den Lock expandiert; ein Muster ohne Wildcard gilt auch ohne Lock-Eintrag.
export function denyRulesForInstance(instKey, instCfg, lock) {
  if (!instKey.startsWith('mcp:') || !instCfg?.tools_suppressed?.length) return [];
  const server = instKey.slice(4);
  const known = Object.keys(lock.servers?.[server]?.tools ?? {});
  const names = new Set();
  for (const p of instCfg.tools_suppressed) {
    if (!/[*?]/.test(p)) names.add(p);
    for (const n of known) if (globMatch(p, n)) names.add(n);
  }
  return [...names].sort().map(n => `mcp__${server}__${n}`);
}

// Alle deny-Regeln der Registry (sync.mjs, check.mjs). Unterdrückte Instanzen fehlen: dort ist
// der ganze Server über disabledMcpjsonServers abgeschaltet.
export function denyRulesForRegistry(registry, lock) {
  const rules = new Set();
  for (const instances of Object.values(registry.capabilities)) {
    for (const [instKey, cfg] of Object.entries(instances)) {
      if (cfg.state === 'suppressed') continue;
      for (const r of denyRulesForInstance(instKey, cfg, lock)) rules.add(r);
    }
  }
  return rules;
}

// Tools einer mcp-Instanz mit aufgelöstem Tier, riskanteste zuerst. Unterdrückte Tools fehlen.
// Leeres Array ohne Lock-Eintrag.
export function toolsForInstance(instKey, instCfg, lock) {
  if (!instKey.startsWith('mcp:')) return [];
  const entry = lock.servers?.[instKey.slice(4)];
  if (!entry?.tools) return [];
  return Object.keys(entry.tools)
    .filter(name => !isToolSuppressed(name, instCfg))
    .map(name => ({ name, tier: resolveToolTier(name, instCfg), summary: entry.tools[name]?.summary ?? null }))
    .sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || a.name.localeCompare(b.name));
}
