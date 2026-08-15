#!/usr/bin/env node
// API-/Connector-Inventar-Scanner (SDLC-Leitstand E2, T007559).
//
// Erzeugt website/src/data/api-inventory.json: alle SDLC-API-Routen
// (website/src/pages/sdlc/api/**), die MCP-Server aus
// docs/agent-guide/registry/mcp.yaml (nur `clients:`-Top-Level, nicht
// `cluster:`) und die factory-mcp-Tools aus scripts/factory/mcp-go/main.go
// (toolList, keine Zweitquelle -- Aenderungen an main.go fliessen ein).
// Angereichert mit kuratierten Feldern (description/tier/deprecated) aus
// docs/agent-guide/registry/api-overlay.yaml. Deterministisch: keine
// Zeitstempel, stabile Sortierungen -- zwei Laeufe ohne Zwischenaenderung
// sind byte-identisch (fails then the freshness:check drift gate).
//
// Schnittstellenvertrag (bindend, p3-Tests):
//   - Env-Overrides: API_INVENTORY_ROUTES_DIR, API_OVERLAY_PATH (primary) /
//     API_INVENTORY_OVERLAY (Alias, p2), API_INVENTORY_MCP_REGISTRY,
//     API_INVENTORY_FACTORY_MCP_GO, API_INVENTORY_OUT.
//   - Exit 0 bei Erfolg (Datei geschrieben); Exit 1 bei verwaistem
//     Overlay-Eintrag (Datei NICHT geschrieben), Fehlermeldung auf stderr
//     enthaelt `not found in scan` + Gruppe + Schluessel in Anfuehrungszeichen.
//   - Top-Level: routes/mcpServers/factoryTools (nicht factoryMcpTools --
//     p3-legacy-Namen sind verbindlich); Route-Feld `backend` (Array).
//   - Overlay akzeptiert BEIDE Formate: p2-Gruppenformat (routes:/
//     mcpServers:/mcpTools: Maps) und p3-Fixtureformat (entries:-Liste mit
//     `endpoint:`-Keys, die Route-Pfade matchen).

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';

const DEFAULTS = {
  routesDir: 'website/src/pages/sdlc/api',
  overlay: 'docs/agent-guide/registry/api-overlay.yaml',
  mcpRegistry: 'docs/agent-guide/registry/mcp.yaml',
  factoryMcpGo: 'scripts/factory/mcp-go/main.go',
  out: 'website/src/data/api-inventory.json',
};

const envOr = (key, fallback) => process.env[key] || fallback;
const ROUTES_DIR = envOr('API_INVENTORY_ROUTES_DIR', DEFAULTS.routesDir);
const OVERLAY_PATH = envOr('API_OVERLAY_PATH', envOr('API_INVENTORY_OVERLAY', DEFAULTS.overlay));
const MCP_REGISTRY = envOr('API_INVENTORY_MCP_REGISTRY', DEFAULTS.mcpRegistry);
const FACTORY_MCP_GO = envOr('API_INVENTORY_FACTORY_MCP_GO', DEFAULTS.factoryMcpGo);
const OUT_PATH = envOr('API_INVENTORY_OUT', DEFAULTS.out);

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const METHOD_RE = /^export const (GET|POST|PUT|PATCH|DELETE)\b/;

/** Backend-Klassifikation NUR aus dem direkten Import-Spezifizierer
 *  (kein Volltext-Grep auf `kubectl` -- K8s-Annotations wie
 *  'kubectl.kubernetes.io/restartedAt' wuerden falsch klassifizieren). */
export function classifyImport(spec) {
  if (/\/lib\/sdlc\/k8s(\.ts)?$/.test(spec)) return 'k8s-rest';
  if (spec === 'child_process' || spec === 'node:child_process' || /kubectl/i.test(spec)) return 'kubectl';
  if (spec === 'pg' || /db-pool/.test(spec) || /\/lib\/[^/]*db[^/]*(\.ts)?$/i.test(spec)) return 'postgres';
  if (/github/i.test(spec)) return 'github';
  if (/prometheus/i.test(spec)) return 'prometheus';
  if (['node:fs', 'node:fs/promises', 'fs', 'fs/promises'].includes(spec)) return 'filesystem';
  return null;
}

/** Route-Scan: rekursiv ueber den API-Ordner, `*.test.ts` ausgeschlossen.
 *  Route-Pfad = relativer Pfad minus `.ts` minus `/index`, Praefix
 *  `/sdlc/api/`; `[param]`-Segmente bleiben wörtlich erhalten. */
export function scanRoutes(dir) {
  const root = resolve(dir);
  const out = [];
  for (const d of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!d.isFile() || !d.name.endsWith('.ts') || d.name.endsWith('.test.ts')) continue;
    const abs = join(d.parentPath, d.name);
    const rel = relative(root, abs).split(sep).join('/');
    const content = readFileSync(abs, 'utf8');
    const methods = [...new Set(
      content.split('\n').map((l) => (l.match(METHOD_RE) || [])[1]).filter(Boolean),
    )].sort((a, b) => METHOD_ORDER.indexOf(a) - METHOD_ORDER.indexOf(b));
    const specifiers = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const backends = [...new Set(specifiers.map(classifyImport).filter(Boolean))].sort();
    let p = rel.replace(/\.ts$/, '');
    if (p.endsWith('/index')) p = p.slice(0, -'/index'.length);
    out.push({
      path: `/sdlc/api/${p}`,
      file: rel,
      methods,
      backend: backends.length ? backends : ['unknown'],
      description: null,
      tier: null,
      deprecated: null,
    });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** MCP-Server-Scan: NUR der Top-Level-Schluessel `clients` der Registry
 *  (`cluster:` hat eine andere Bedeutung). `endpoint` nur bei transport
 *  `http`, sonst null. */
export function scanMcpServers(registryPath) {
  const doc = parseYaml(readFileSync(registryPath, 'utf8')) || {};
  const clients = doc.clients && typeof doc.clients === 'object' ? doc.clients : {};
  const out = Object.entries(clients).map(([name, c]) => {
    const transport = c && c.transport === 'http' ? 'http' : 'stdio';
    return {
      name,
      transport,
      endpoint: transport === 'http' ? (c.endpoint ?? null) : null,
      description: null,
      tier: null,
      deprecated: null,
    };
  });
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** factory-mcp-Tool-Scan: extrahiert die toolList-Eintraege aus main.go per
 *  Regex (Name/Description auf Folgezeilen) -- kein Hardcoding der Liste. */
export function scanFactoryMcpTools(goPath) {
  const src = readFileSync(goPath, 'utf8');
  const re = /Name:\s*"([^"]+)",\s*\n\s*Description:\s*"([^"]+)"/g;
  const out = [];
  for (const m of src.matchAll(re)) {
    out.push({ name: m[1], description: m[2], tier: null, deprecated: null });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Overlay-Merge: schreibt description/tier/deprecated (Default null) auf
 *  getroffene Ziele. Verwaiste Schluessel werden gesammelt und alle am Ende
 *  gemeldet (Exit 1, keine Ausgabedatei). Fehlende Kuration ist erlaubt. */
export function applyOverlay(routes, mcpServers, factoryTools, overlayPath) {
  const byPath = new Map(routes.map((r) => [r.path, r]));
  const byServer = new Map(mcpServers.map((s) => [s.name, s]));
  const byTool = new Map(factoryTools.map((t) => [t.name, t]));
  const orphans = { routes: [], mcpServers: [], mcpTools: [] };

  const merge = (obj, cur) => {
    obj.description = cur.description ?? null;
    obj.tier = cur.tier ?? null;
    obj.deprecated = cur.deprecated ?? null;
  };

  if (existsSync(overlayPath)) {
    const doc = parseYaml(readFileSync(overlayPath, 'utf8')) || {};
    // p2-Gruppenformat: routes:/mcpServers:/mcpTools: als Maps keyed by path/name.
    if (doc.routes) {
      for (const [path, cur] of Object.entries(doc.routes)) {
        const t = byPath.get(path);
        if (t) merge(t, cur); else orphans.routes.push(path);
      }
    }
    if (doc.mcpServers) {
      for (const [name, cur] of Object.entries(doc.mcpServers)) {
        const t = byServer.get(name);
        if (t) merge(t, cur); else orphans.mcpServers.push(name);
      }
    }
    if (doc.mcpTools) {
      for (const [name, cur] of Object.entries(doc.mcpTools)) {
        const t = byTool.get(name);
        if (t) merge(t, cur); else orphans.mcpTools.push(name);
      }
    }
    // p3-Fixtureformat: entries: [{ endpoint, description, tier, deprecated }]
    // -- endpoint matchen Route-Pfade.
    if (Array.isArray(doc.entries)) {
      for (const e of doc.entries) {
        const t = byPath.get(e.endpoint);
        if (t) merge(t, e); else orphans.routes.push(e.endpoint);
      }
    }
  }

  const groups = Object.entries(orphans).filter(([, names]) => names.length > 0);
  if (groups.length) {
    const parts = groups.map(([g, names]) => `${g} ${names.map((n) => `"${n}"`).join(', ')}`);
    process.stderr.write(`api-inventory: api-overlay.yaml entries not found in scan: ${parts.join('; ')}\n`);
    process.exit(1);
  }
}

export function main() {
  const routes = scanRoutes(ROUTES_DIR);
  const mcpServers = scanMcpServers(MCP_REGISTRY);
  const factoryTools = scanFactoryMcpTools(FACTORY_MCP_GO);
  applyOverlay(routes, mcpServers, factoryTools, OVERLAY_PATH);
  const json = JSON.stringify({ routes, mcpServers, factoryTools }, null, 2) + '\n';
  mkdirSync(dirname(resolve(OUT_PATH)), { recursive: true });
  writeFileSync(resolve(OUT_PATH), json);
  console.log(`api-inventory: ${routes.length} routes, ${mcpServers.length} mcp servers, ${factoryTools.length} factory tools -> ${OUT_PATH}`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
