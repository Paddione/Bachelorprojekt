// scripts/toolset/probe.mjs — misst tools/list je MCP-Server und schreibt toolset.lock.yaml (T900983).
//
//   node scripts/toolset/probe.mjs [--server <name>]... [--ack <name>]... [--dry-run]
//
// Quelle der Server: docs/agent-guide/registry/mcp.yaml (`clients`), überschreibbar per
// TOOLSET_MCP_REGISTRY. Lock: TOOLSET_LOCK oder docs/agent-guide/registry/toolset.lock.yaml.
//
// Lock-Semantik (design.md D1/D2):
//   tools     — gemessen; schreibt jeder Lauf für jeden erreichbaren Server neu.
//   reviewed  — geprüft; schreibt nur `--ack <server>` (übernimmt den gemessenen Stand).
//   Ein unerreichbarer Server behält tools und reviewed, nur status/probed_at ändern sich.
//
// Exit 0 auch bei unerreichbaren Servern — Erreichbarkeit ist ein Messwert, kein Fehler.
// Exit 2 nur bei Aufruferfehlern (unbekannter Server, unbekanntes Argument).
import fs from 'node:fs';
import path from 'node:path';
import * as yamlPkg from 'js-yaml';
import { connectHttp, connectStdio, listTools } from './lib/mcp-client.mjs';
import { loadLock, toolHash } from './lib/tools.mjs';
const yaml = yamlPkg.default ?? yamlPkg;

const repoRoot = process.cwd();
const mcpRegistryPath = process.env.TOOLSET_MCP_REGISTRY || path.join(repoRoot, 'docs', 'agent-guide', 'registry', 'mcp.yaml');
const lockPath = process.env.TOOLSET_LOCK || path.join(repoRoot, 'docs', 'agent-guide', 'registry', 'toolset.lock.yaml');

const only = [];
const ack = [];
let dryRun = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--server') only.push(argv[++i]);
  else if (a === '--ack') ack.push(argv[++i]);
  else if (a === '--dry-run') dryRun = true;
  else { console.error(`probe: unbekanntes Argument "${a}"`); process.exit(2); }
}

const clients = (yaml.load(fs.readFileSync(mcpRegistryPath, 'utf8')) || {}).clients || {};
for (const name of [...only, ...ack]) {
  if (!clients[name]) { console.error(`probe: Server "${name}" steht nicht in ${mcpRegistryPath}`); process.exit(2); }
}

async function probeOne(name, c) {
  let conn;
  if (c.transport === 'http') {
    conn = await connectHttp({ url: c.endpoint, headers: c.headers ?? {} });
  } else {
    // Gestartet wird, was Claude Code startet — der Probe misst die Harness-Realität.
    const h = c.harness?.claude_code ?? {};
    conn = await connectStdio({ command: h.command ?? c.command, args: h.args ?? c.args ?? [], cwd: repoRoot });
  }
  try {
    return { serverInfo: conn.serverInfo, tools: await listTools(conn) };
  } finally {
    await conn.close();
  }
}

const lock = loadLock(lockPath);
const targets = Object.entries(clients).filter(([n]) => only.length === 0 || only.includes(n) || ack.includes(n));
const now = new Date().toISOString();

const results = await Promise.all(targets.map(async ([name, c]) => {
  try {
    return { name, ok: true, ...(await probeOne(name, c)) };
  } catch (e) {
    return { name, ok: false, kind: e.kind ?? 'unreachable', message: e.message };
  }
}));

for (const r of results) {
  const prev = lock.servers[r.name] ?? {};
  if (!r.ok) {
    lock.servers[r.name] = { ...prev, status: r.kind, probed_at: now, error: r.message };
    console.log(`${r.name.padEnd(22)} ${r.kind.padEnd(12)} ${r.message}`);
    continue;
  }
  const tools = {};
  for (const t of [...r.tools].sort((a, b) => a.name.localeCompare(b.name))) {
    const entry = { hash: toolHash(t) };
    // T900985: Kurzbeschreibung für devflow-mcp recommend_tools (Rerank-Dokument) — erste
    // Zeile, gekürzt; die volle Beschreibung steckt nur im Hash.
    const summary = String(t.description ?? '').split('\n')[0].trim().slice(0, 200);
    if (summary) entry.summary = summary;
    if (t.annotations?.readOnlyHint === true) entry.read_only = true;
    if (t.annotations?.destructiveHint === true) entry.destructive = true;
    tools[t.name] = entry;
  }
  const next = { status: 'ok', probed_at: now, server_info: r.serverInfo ?? null, tool_count: r.tools.length, tools };
  // Doppelte Namen sind ein Serverfehler (T900984): der Lock kann je Name nur einen Eintrag
  // halten, tool_count zählt aber jeden — die Differenz wird hier sichtbar gemacht.
  const seen = new Set();
  const dups = [...new Set(r.tools.map(t => t.name).filter(n => seen.has(n) || !seen.add(n)))].sort();
  if (dups.length > 0) next.duplicate_names = dups;
  if (prev.reviewed) next.reviewed = prev.reviewed;
  if (ack.includes(r.name)) next.reviewed = Object.fromEntries(Object.entries(tools).map(([n, e]) => [n, e.hash]));
  lock.servers[r.name] = next;
  console.log(`${r.name.padEnd(22)} ${'ok'.padEnd(12)} ${r.tools.length} tools${ack.includes(r.name) ? ' (acked)' : ''}`);
}

for (const name of ack) {
  if (lock.servers[name]?.status !== 'ok') console.error(`probe: --ack ${name} übersprungen — Server nicht erreichbar`);
}

// Server sortiert, damit der Lock diff-stabil bleibt.
lock.servers = Object.fromEntries(Object.entries(lock.servers).sort(([a], [b]) => a.localeCompare(b)));

const header = `# docs/agent-guide/registry/toolset.lock.yaml — gemessene Tools je MCP-Server (T900983)
# Geschrieben von: node scripts/toolset/probe.mjs   (gemessen: status, tools)
# Geprüft per:     node scripts/toolset/probe.mjs --ack <server>   (reviewed)
# Gelesen von check.mjs (Tool-Drift, tool_tiers-Gate) und toolset-context.sh (Rendering).
# Erreichbarkeit pro Harness kuratiert mcp.yaml; dieser Lock hält nur Messwerte.
`;
const body = yaml.dump({ lock_version: 2, servers: lock.servers }, { lineWidth: 200, sortKeys: false });
if (dryRun) {
  console.log('probe: --dry-run, Lock nicht geschrieben');
} else {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, header + body);
  console.log(`probe: Lock geschrieben — ${lockPath}`);
}

// Gekillte stdio-Kinder halten sonst gelegentlich die Event-Loop offen.
process.exit(0);
