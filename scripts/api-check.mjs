#!/usr/bin/env node
// scripts/api-check.mjs
//
// Fail-closed Guard über das API-Endpoint-Register
// (docs/agent-guide/registry/api.yaml — Plan registry-ssot-gates P5).
//
//   node scripts/api-check.mjs                    # prüfen (task api:check)
//   node scripts/api-check.mjs --emit-map         # Karte schreiben (task api:map)
//   node scripts/api-check.mjs --registry <pfad> --inventory <pfad>
//
// Geprüft wird:
//   1. jede Route aus api-inventory.json (de-facto-SSOT der Endpunkt-MENGE,
//      generiert von scripts/sdlc/api-inventory.mjs) ist in api.yaml mit einer
//      gültigen Auth-Klasse kuratiert (neuer/unklassifizierter Endpoint → Exit ≠ 0),
//   2. jeder api.yaml-Eintrag existiert im Inventar (Orphan → Exit ≠ 0),
//   3. gleiches für MCP-Server (Inventar vs. api.yaml),
//   4. tier in api.yaml stimmt mit dem Inventar (Overlay-Merge) überein.
//
// Aufbauend, nicht ersetzend (Gegenbeleg, eingebunden statt dupliziert):
//   - scripts/sdlc/api-inventory.mjs (Scan + Orphan-Guard, Taskfile.quality.yml:13),
//   - scripts/api-auth-check.mjs (Auth-Gate über docs/generated/api-map.json,
//     Taskfile.test.yml:518).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = join(REPO, 'docs/agent-guide/registry/api.yaml');
const DEFAULT_INVENTORY = join(REPO, 'components/website/src/data/api-inventory.json');
const DEFAULT_MAP = join(REPO, 'docs/agent-guide/maps/api-map.md');

function loadRegistry(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Registry nicht lesbar: ${path}`);
  }
  const doc = parseYaml(text);
  if (!doc || typeof doc.routes !== 'object' || typeof doc.mcpServers !== 'object') {
    throw new Error(`Registry braucht 'routes'- und 'mcpServers'-Maps: ${path}`);
  }
  return doc;
}

function loadInventory(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Inventar nicht lesbar (erst 'task api:inventory' laufen lassen): ${path}`);
  }
  const doc = JSON.parse(text);
  if (!Array.isArray(doc?.routes) || !Array.isArray(doc?.mcpServers)) {
    throw new Error(`Inventar braucht 'routes'- und 'mcpServers'-Listen: ${path}`);
  }
  return doc;
}

function check(registry, inventory) {
  const problems = [];
  const allowed = new Set(registry.auth_classes ?? []);
  const regRoutes = registry.routes ?? {};
  const invByPath = new Map(inventory.routes.map((r) => [r.path, r]));

  for (const route of inventory.routes) {
    const curated = regRoutes[route.path];
    if (!curated) {
      problems.push(`neue/unklassifizierte Route '${route.path}' ohne api.yaml-Eintrag`);
      continue;
    }
    if (!allowed.has(curated.auth)) {
      problems.push(`Route '${route.path}': Auth-Klasse '${curated.auth}' nicht in auth_classes`);
    }
    if ((curated.tier ?? null) !== (route.tier ?? null)) {
      problems.push(
        `Route '${route.path}': tier-Drift (api.yaml '${curated.tier}' vs Inventar '${route.tier}')`,
      );
    }
    if (curated.auth === 'public' && !curated.note) {
      problems.push(`Route '${route.path}': public ohne 'note'-Begründung`);
    }
  }
  for (const path of Object.keys(regRoutes)) {
    if (!invByPath.has(path)) {
      problems.push(`Orphan: api.yaml-Route '${path}' nicht im Scan-Inventar`);
    }
  }

  const regServers = registry.mcpServers ?? {};
  const invServers = new Map(inventory.mcpServers.map((s) => [s.name, s]));
  for (const server of inventory.mcpServers) {
    const curated = regServers[server.name];
    if (!curated) {
      problems.push(`neuer/unklassifizierter MCP-Server '${server.name}' ohne api.yaml-Eintrag`);
      continue;
    }
    if ((curated.tier ?? null) !== (server.tier ?? null)) {
      problems.push(
        `MCP-Server '${server.name}': tier-Drift (api.yaml '${curated.tier}' vs Inventar '${server.tier}')`,
      );
    }
  }
  for (const name of Object.keys(regServers)) {
    if (!invServers.has(name)) {
      problems.push(`Orphan: api.yaml-Server '${name}' nicht im Scan-Inventar`);
    }
  }

  return problems;
}

function cell(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || '—';
}

function renderMap(registry, inventory, registryPath) {
  const rel = (registryPath.startsWith(REPO)
    ? registryPath.slice(REPO.length + 1)
    : registryPath
  ).split(sep).join('/');
  const invByPath = new Map(inventory.routes.map((r) => [r.path, r]));
  const paths = Object.keys(registry.routes ?? {}).sort();
  const lines = [
    '# API-Endpoint-Register',
    '',
    `<!-- GENERIERT aus ${rel} — nicht von Hand editieren.`,
    '     Neu erzeugen: task api:map · Prüfen: task api:check -->',
    '',
    'Jede SDLC-API-Route mit Auth-Klasse und Tier. Mengengerüst: `api-inventory.json`',
    '(Scan + Overlay); Kuratierung: diese Registry. Auth-Gate: `api-auth-check.mjs`.',
    '',
    '| Endpoint | Auth | Tier | Quelle |',
    '|---|---|---|---|',
  ];
  for (const path of paths) {
    const curated = registry.routes[path];
    const inv = invByPath.get(path);
    lines.push(
      `| \`${cell(path)}\` | ${cell(curated.auth)} | ${cell(curated.tier ?? inv?.tier)} | ` +
        `${cell(curated.source)} |`,
    );
  }
  const servers = Object.keys(registry.mcpServers ?? {}).sort();
  if (servers.length > 0) {
    lines.push('', '## MCP-Server', '', '| Server | Tier | Quelle |', '|---|---|---|');
    for (const name of servers) {
      const curated = registry.mcpServers[name];
      lines.push(`| \`${cell(name)}\` | ${cell(curated.tier)} | ${cell(curated.source)} |`);
    }
  }
  const publics = paths.filter((p) => registry.routes[p]?.auth === 'public');
  if (publics.length > 0) {
    lines.push('', '## Öffentliche Routen (ohne Auth-Guard)', '');
    for (const p of publics) {
      lines.push(`- \`${cell(p)}\` — ${cell(registry.routes[p]?.note)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const value = argv[i + 1];
  if (!value) {
    console.error(`api-check: ${flag} braucht einen Pfad`);
    process.exit(2);
  }
  return value;
}

function main(argv) {
  const emitMap = argv.includes('--emit-map');
  const registryPath = flagValue(argv, '--registry') ?? DEFAULT_REGISTRY;
  const inventoryPath = flagValue(argv, '--inventory') ?? DEFAULT_INVENTORY;

  let registry;
  let inventory;
  try {
    registry = loadRegistry(registryPath);
    inventory = loadInventory(inventoryPath);
  } catch (error) {
    console.error(`api-check: ${error.message}`);
    return 2;
  }

  const problems = check(registry, inventory);
  if (problems.length > 0) {
    console.error(`api-check: ${problems.length} Verstoß/Verstöße`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }

  if (emitMap) {
    writeFileSync(DEFAULT_MAP, renderMap(registry, inventory, registryPath), 'utf8');
    console.log(`api-check: Karte geschrieben — ${DEFAULT_MAP}`);
    return 0;
  }

  console.log(
    `api-check: OK — ${inventory.routes.length} Routen, ${inventory.mcpServers.length} MCP-Server klassifiziert`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
