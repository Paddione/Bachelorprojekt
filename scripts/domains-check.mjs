#!/usr/bin/env node
// scripts/domains-check.mjs
//
// Fail-closed Guard ueber das Frontend-Domain-Register
// (docs/agent-guide/registry/domains.yaml, SSOT).
//
//   node scripts/domains-check.mjs                    # pruefen (task domains:check)
//   node scripts/domains-check.mjs --emit-map         # Karte schreiben (task domains:map)
//   node scripts/domains-check.mjs --registry <pfad>  # gegen eine Fixture laufen
//   --skip-manifest-scan: Manifest-Abgleich ueberspringen (fuer synthetische Fixtures)
//
// Geprueft wird:
//   1. jedes Pflichtfeld ist gesetzt (id, host, cluster, namespace, paths,
//      service, auth, owner_frontend, functions, status, manifest_source),
//   2. jede id ist eindeutig,
//   3. status und auth und cluster liegen in der erlaubten Menge,
//   4. jede manifest_source-Datei existiert,
//   5. jeder Manifest-Host aus prod-fleet/ und dev-local/ (kind: Ingress ueber
//      spec.rules[].host, kind: IngressRoute ueber Host() in spec.routes[].match)
//      steht im Register — sonst Exit != 0,
//   6. Funktions-Matrix: zwei status:live-Eintraege desselben Clusters mit
//      demselben Funktions-String brauchen mindestens auf einer Seite ein
//      decision-Feld, das den Split/Redirect erklaert.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = join(REPO, 'docs/agent-guide/registry/domains.yaml');
const DEFAULT_MAP = join(REPO, 'docs/agent-guide/maps/domains-map.md');

const REQUIRED_FIELDS = ['id', 'host', 'cluster', 'namespace', 'paths', 'service', 'auth', 'owner_frontend', 'functions', 'status', 'manifest_source'];
const ALLOWED_STATUS = new Set(['live', 'frozen', 'retired']);
const ALLOWED_AUTH = new Set(['oidc', 'open', 'basic', 'token']);
const ALLOWED_CLUSTER = new Set(['fleet', 'devmesh']);

// ── Manifest-Scan ────────────────────────────────────────────────────────────

function yamlFiles(dir) {
  const out = [];
  let dirents;
  try {
    dirents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of dirents) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...yamlFiles(full));
    else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) out.push(full);
  }
  return out;
}

function parseDocs(path) {
  try {
    const text = readFileSync(path, 'utf8');
    const docs = [];
    for (const chunk of text.split(/^---[ \t]*$/m)) {
      if (!chunk.trim()) continue;
      try {
        const doc = parseYaml(chunk);
        if (doc && typeof doc === 'object') docs.push(doc);
      } catch {
        // defektes Einzeldokument ueberspringen
      }
    }
    return docs;
  } catch {
    return [];
  }
}

function collectManifestHosts() {
  const hosts = new Map();
  for (const base of ['prod-fleet', 'dev-local']) {
    for (const file of yamlFiles(join(REPO, base))) {
      for (const doc of parseDocs(file)) {
        const kind = String(doc.kind ?? '');
        if (kind === 'Ingress') {
          const rules = doc.spec?.rules ?? [];
          for (const rule of rules) {
            if (rule?.host) {
              const h = String(rule.host);
              if (!hosts.has(h)) hosts.set(h, []);
              hosts.get(h).push(file);
            }
          }
        } else if (kind === 'IngressRoute') {
          const routes = doc.spec?.routes ?? [];
          for (const route of routes) {
            const match = String(route?.match ?? '');
            const m = match.match(/Host\(([^)]*)\)/);
            if (!m) continue;
            for (const part of m[1].split(',')) {
              const h = part.trim().replace(/^`/, '').replace(/`$/, '').trim();
              if (!h) continue;
              if (!hosts.has(h)) hosts.set(h, []);
              hosts.get(h).push(file);
            }
          }
        }
      }
    }
  }
  return hosts;
}

// ── Registry laden und pruefen ──────────────────────────────────────────────

function loadRegistry(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Registry nicht lesbar: ${path}`);
  }
  const doc = parseYaml(text);
  const list = doc?.domains;
  if (!Array.isArray(list)) {
    throw new Error(`Registry hat keinen Listen-Schluessel 'domains': ${path}`);
  }
  return list;
}

function check(entries, { skipManifestScan }) {
  const problems = [];
  const seen = new Map();

  entries.forEach((entry, index) => {
    const label = entry?.id ?? `Eintrag #${index + 1}`;

    for (const field of REQUIRED_FIELDS) {
      const value = entry?.[field];
      if (value === undefined || value === null || value === '') {
        problems.push(`${label}: Pflichtfeld '${field}' fehlt`);
      }
    }
    for (const listField of ['paths', 'functions']) {
      const value = entry?.[listField];
      if (value !== undefined && (!Array.isArray(value) || value.length === 0)) {
        problems.push(`${label}: '${listField}' muss eine nicht-leere Liste sein`);
      }
    }
    if (entry?.status !== undefined && !ALLOWED_STATUS.has(entry.status)) {
      problems.push(`${label}: status '${entry.status}' ist weder 'live' noch 'frozen' noch 'retired'`);
    }
    if (entry?.auth !== undefined && !ALLOWED_AUTH.has(entry.auth)) {
      problems.push(`${label}: auth '${entry.auth}' ist weder 'oidc' noch 'open' noch 'basic' noch 'token'`);
    }
    if (entry?.cluster !== undefined && !ALLOWED_CLUSTER.has(entry.cluster)) {
      problems.push(`${label}: cluster '${entry.cluster}' ist weder 'fleet' noch 'devmesh'`);
    }
    if (entry?.id !== undefined) {
      if (seen.has(entry.id)) {
        problems.push(`${label}: doppelte id '${entry.id}'`);
      } else {
        seen.set(entry.id, index);
      }
    }
    if (typeof entry?.manifest_source === 'string' && entry.manifest_source !== '') {
      if (!existsSync(join(REPO, entry.manifest_source))) {
        problems.push(`${label}: manifest_source fehlt auf Platte: ${entry.manifest_source}`);
      }
    }
  });

  if (!skipManifestScan) {
    const manifestHosts = collectManifestHosts();
    const registered = new Set(entries.map((e) => e?.host).filter((h) => typeof h === 'string'));
    for (const host of [...manifestHosts.keys()].sort()) {
      if (!registered.has(host)) {
        problems.push(`Manifest-Host fehlt im Register: '${host}' (z. B. ${manifestHosts.get(host)[0]})`);
      }
    }
  }

  // Funktions-Matrix: gleicher Cluster + gleiche Funktion + beide live ohne
  // decision auf BEIDEN Seiten -> Fehler. Traegt eine Seite ein decision,
  // erklaert das den Split.
  for (const [id, index] of seen) {
    const entry = entries[index];
    if (entry?.status !== 'live' || !Array.isArray(entry?.functions)) continue;
    for (const [otherId, otherIndex] of seen) {
      if (otherIndex >= index) continue;
      const other = entries[otherIndex];
      if (other?.status !== 'live' || !Array.isArray(other?.functions)) continue;
      if (other?.cluster !== entry.cluster) continue;
      const overlap = entry.functions.filter((f) => other.functions.includes(f));
      if (overlap.length === 0) continue;
      if (entry?.decision || other?.decision) continue;
      problems.push(
        `Funktions-Matrix: '${id}' und '${otherId}' beanspruchen live im Cluster '${entry.cluster}' beide '${overlap[0]}' ohne decision`,
      );
    }
  }

  return problems;
}

// ── Karte ────────────────────────────────────────────────────────────────────

function cell(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

function nodeId(id) {
  return String(id).replace(/[^A-Za-z0-9_]/g, '_');
}

function renderMap(entries, registryPath) {
  // Der relative Pfad entsteht per slice() auf dem absoluten Pfad und erbt
  // dessen Trenner — normalisieren.
  const rel = (registryPath.startsWith(REPO)
    ? registryPath.slice(REPO.length + 1)
    : registryPath).split(sep).join('/');
  const live = entries.filter((e) => e?.status === 'live');
  const lines = [
    '# Domains-Map',
    '',
    `<!-- GENERIERT aus ${rel} — nicht von Hand editieren.`,
    '     Neu erzeugen: task domains:map · Pruefen: task domains:check -->',
    '',
    'Jeder oeffentlich erreichbare Host, gruppiert nach Cluster und Frontend-Team.',
    '',
    '```mermaid',
    'flowchart LR',
  ];
  for (const cluster of ['fleet', 'devmesh']) {
    lines.push(`    subgraph ${cluster}["${cluster}"]`);
    for (const entry of live.filter((e) => e?.cluster === cluster)) {
      lines.push(`        ${nodeId(entry.id)}["${cell(entry.host)}"]`);
    }
    lines.push('    end');
  }
  const owners = [...new Set(live.map((e) => e?.owner_frontend ?? 'unbekannt'))].sort();
  for (const owner of owners) {
    lines.push(`    ${nodeId(`owner_${owner}`)}["${cell(owner)}"]`);
    for (const entry of live.filter((e) => (e?.owner_frontend ?? 'unbekannt') === owner)) {
      lines.push(`    ${nodeId(entry.id)} --> ${nodeId(`owner_${owner}`)}`);
    }
  }
  lines.push('```', '');

  lines.push('## Funktion x Frontend', '');
  lines.push('| Funktion | Frontend | Hosts | Status |');
  lines.push('|---|---|---|---|');
  const funcRows = new Map();
  for (const entry of entries) {
    for (const fn of entry?.functions ?? []) {
      const key = `${fn}::${entry?.owner_frontend ?? ''}`;
      if (!funcRows.has(key)) funcRows.set(key, { fn, owner: entry?.owner_frontend ?? '', hosts: [], statuses: new Set() });
      funcRows.get(key).hosts.push(entry?.host);
      funcRows.get(key).statuses.add(entry?.status);
    }
  }
  for (const row of [...funcRows.values()].sort((a, b) => String(a.fn).localeCompare(String(b.fn)))) {
    lines.push(`| ${cell(row.fn)} | ${cell(row.owner)} | ${row.hosts.map((h) => `\`${cell(h)}\``).join('<br>')} | ${cell([...row.statuses].sort().join('/'))} |`);
  }
  lines.push('');

  lines.push('## Entscheidungen (D1-D3)', '');
  lines.push('| Key | Entscheidung |');
  lines.push('|---|---|');
  lines.push('| D1 | web.mentolder.de (Astro) ist die kanonische oeffentliche Seite; react.mentolder.de ist sekundaer/Redirect. |');
  lines.push('| D2 | agent-board ist das kanonische devmesh-Ops-Cockpit; web.devmesh/sdlc sind Tickets/Pipeline. |');
  lines.push('| D3 | board.mentolder.de ist Excalidraw/Whiteboard und eigenstaendig gegenueber agent-board/brett. |');
  lines.push('');
  const withDecision = entries.filter((e) => e?.decision);
  if (withDecision.length > 0) {
    lines.push('### Begruendete Splits im Register', '');
    for (const entry of withDecision) {
      lines.push(`- **\`${cell(entry.id)}\`** (${cell(entry.host)}) — ${cell(entry.decision)}`);
    }
    lines.push('');
  }

  lines.push('## Host-Inventar', '');
  lines.push('| Host | Cluster | Namespace | Service | Auth | Frontend | Funktionen | Status | Quelle |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const entry of [...entries].sort((a, b) => String(a?.host).localeCompare(String(b?.host)))) {
    lines.push(
      `| \`${cell(entry?.host)}\` | ${cell(entry?.cluster)} | ${cell(entry?.namespace)} ` +
      `| ${cell(entry?.service)} | ${cell(entry?.auth)} | ${cell(entry?.owner_frontend)} ` +
      `| ${cell((entry?.functions ?? []).join(', '))} | ${cell(entry?.status)} | ${cell(entry?.manifest_source)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

// ── Einstieg ─────────────────────────────────────────────────────────────────

function main(argv) {
  const emitMap = argv.includes('--emit-map');
  const skipManifestScan = argv.includes('--skip-manifest-scan');
  const registryFlag = argv.indexOf('--registry');
  const registryPath = registryFlag === -1 ? DEFAULT_REGISTRY : argv[registryFlag + 1];
  if (registryFlag !== -1 && !registryPath) {
    console.error('domains-check: --registry braucht einen Pfad');
    return 2;
  }

  let entries;
  try {
    entries = loadRegistry(registryPath);
  } catch (error) {
    console.error(`domains-check: ${error.message}`);
    return 2;
  }

  const problems = check(entries, { skipManifestScan });
  if (problems.length > 0) {
    console.error(`domains-check: ${problems.length} Verstoss/Verstoesse in ${registryPath}`);
    for (const problem of problems) console.error(`  X ${problem}`);
    return 1;
  }

  if (emitMap) {
    writeFileSync(DEFAULT_MAP, renderMap(entries, registryPath), 'utf8');
    console.log(`domains-check: Karte geschrieben — ${DEFAULT_MAP}`);
    return 0;
  }

  console.log(`domains-check: OK — ${entries.length} Domains, Matrix sauber`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
