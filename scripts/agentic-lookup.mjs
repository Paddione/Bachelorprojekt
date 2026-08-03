#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

const argv = process.argv.slice(2);
const verb = argv[0];
if (!verb) {
  console.error('Usage: agentic-lookup.mjs <find|inspect|record> [args...]');
  process.exit(1);
}

const REGISTRY_BASE = process.env.AGENTIC_REGISTRY_BASE || 'https://registry.modelcontextprotocol.io';
const FIXTURE_DIR = process.env.AGENTIC_REGISTRY_FIXTURE_DIR || null;
const TOOLS_FIXTURE = process.env.AGENTIC_TOOLS_FIXTURE || null;
const REGISTRY_PATH = process.env.TOOLSET_REGISTRY || path.join(process.cwd(), 'docs', 'agent-guide', 'registry', 'capabilities.yaml');
const TIMEOUT_MS = 10_000;

const VALID_STATES = new Set(['canonical', 'suppressed', 'unreviewed']);
const VALID_KINDS = new Set(['mcp', 'plugin', 'skill', 'cli', 'agent']);
const KNOWN_PREFIXES = ['cli:', 'mcp:', 'skill:', 'agent:', 'plugin:'];

function splitArgs(args) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      opts[key] = val;
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, opts };
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function registrySearch(query) {
  if (FIXTURE_DIR) {
    const fxPath = path.join(FIXTURE_DIR, 'registry-search.json');
    if (fs.existsSync(fxPath)) {
      return JSON.parse(fs.readFileSync(fxPath, 'utf8'));
    }
    return [];
  }
  const url = `${REGISTRY_BASE}/v0/servers?search=${encodeURIComponent(query)}`;
  return await fetchWithTimeout(url, TIMEOUT_MS);
}

async function registryGet(name) {
  if (FIXTURE_DIR) {
    const safeName = name.replace(/[/@:]/g, '_');
    const fxPath = path.join(FIXTURE_DIR, `server-${safeName}.json`);
    if (fs.existsSync(fxPath)) {
      return JSON.parse(fs.readFileSync(fxPath, 'utf8'));
    }
    throw new Error(`Fixture not found for server: ${name}`);
  }
  const url = `${REGISTRY_BASE}/v0/servers/${encodeURIComponent(name)}`;
  return await fetchWithTimeout(url, TIMEOUT_MS);
}

function loadCapabilities(filePath) {
  if (!fs.existsSync(filePath)) return { capabilities: {} };
  const content = fs.readFileSync(filePath, 'utf8');
  const data = yaml.load(content);
  if (!data || !data.capabilities) throw new Error(`Invalid registry file: ${filePath}`);
  return data;
}

function loadKnownMarketplaces() {
  const kp = path.join(os.homedir(), '.claude', 'plugins', 'known_marketplaces.json');
  if (!fs.existsSync(kp)) return [];
  try {
    return JSON.parse(fs.readFileSync(kp, 'utf8'));
  } catch {
    return [];
  }
}

function matchQuery(text, query) {
  if (!text || !query) return false;
  const lower = text.toLowerCase();
  for (const term of query.toLowerCase().split(/\s+/)) {
    if (lower.includes(term)) return true;
  }
  return false;
}

function serverNameFromInstanceKey(key) {
  for (const prefix of KNOWN_PREFIXES) {
    if (key.startsWith(prefix)) return key.slice(prefix.length);
  }
  return key;
}

function instanceKind(key) {
  const idx = key.indexOf(':');
  return idx >= 0 ? key.slice(0, idx) : 'unknown';
}

async function findVerb(args) {
  const { positional } = splitArgs(args);
  const query = positional[0] || '';
  const results = new Map();

  // Source 1: capabilities.yaml
  try {
    const registry = loadCapabilities(REGISTRY_PATH);
    for (const [capName, instances] of Object.entries(registry.capabilities)) {
      for (const [instKey, cfg] of Object.entries(instances)) {
        const name = serverNameFromInstanceKey(instKey);
        if (!name) continue;
        if (query && !matchQuery(name, query) && !matchQuery(capName, query) && !matchQuery(cfg.reason, query) && !matchQuery(cfg.use_when, query)) continue;
        const source = cfg.source || instKey;
        results.set(name, {
          name,
          source,
          state: cfg.state || 'unreviewed',
          description: cfg.reason || cfg.use_when || cfg.fallback || '',
          kind: instanceKind(instKey),
          capability: capName,
          local: true,
        });
      }
    }
  } catch (e) {
    console.error(`capabilities.yaml: ${e.message}`);
  }

  // Source 2: known_marketplaces.json
  try {
    const marketplaces = loadKnownMarketplaces();
    for (const mp of marketplaces) {
      if (!mp.installLocation) continue;
      const mpFile = path.join(mp.installLocation, '.claude-plugin', 'marketplace.json');
      if (!fs.existsSync(mpFile)) continue;
      try {
        const mpData = JSON.parse(fs.readFileSync(mpFile, 'utf8'));
        const plugins = mpData.plugins || [];
        for (const plugin of plugins) {
          const name = plugin.name || '';
          if (query && !matchQuery(name, query) && !matchQuery(plugin.description, query)) continue;
          if (!results.has(name)) {
            results.set(name, {
              name,
              source: `marketplace:${mp.name || mp.installLocation}`,
              state: 'unreviewed',
              description: plugin.description || '',
              kind: 'plugin',
              local: true,
            });
          }
        }
      } catch { /* skip unreadable marketplace */ }
    }
  } catch (e) {
    console.error(`known_marketplaces.json: ${e.message}`);
  }

  // Source 3: MCP registry
  try {
    const servers = await registrySearch(query);
    if (Array.isArray(servers)) {
      for (const server of servers) {
        const name = server.name || server.id || '';
        if (!name) continue;
        if (!results.has(name)) {
          const pkg = (server.packages && server.packages[0]) || {};
          const src = pkg.type === 'npm' ? `npm:${pkg.id}` : pkg.type === 'oci' ? `oci:${pkg.ref || pkg.id}` : server.url || server.source || '';
          results.set(name, {
            name,
            source: src || 'registry',
            state: 'unreviewed',
            description: server.description || '',
            kind: 'mcp',
            local: false,
          });
        }
      }
    }
  } catch (e) {
    console.error(`registry.modelcontextprotocol.io: ${e.message}`);
  }

  // Output: local entries first, then remote
  const sorted = [...results.values()].sort((a, b) => {
    if (a.local && !b.local) return -1;
    if (!a.local && b.local) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const r of sorted) {
    console.log(`${r.name} | ${r.source} | ${r.state} | ${r.description}`);
  }
}

async function mcpToolsList(url) {
  if (TOOLS_FIXTURE && fs.existsSync(TOOLS_FIXTURE)) {
    return JSON.parse(fs.readFileSync(TOOLS_FIXTURE, 'utf8'));
  }
  const headers = { 'Content-Type': 'application/json' };
  const initReq = {
    jsonrpc: '2.0', id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'agentic-lookup', version: '1.0' } },
  };
  const initRes = await fetchJsonRpc(url, initReq, headers);
  if (!initRes) return null;

  const toolsReq = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
  return await fetchJsonRpc(url, toolsReq, headers);
}

async function fetchJsonRpc(url, body, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function inspectVerb(args) {
  const { positional } = splitArgs(args);
  const name = positional[0];
  if (!name) { console.error('inspect: server name required'); process.exit(1); }

  let server;
  try {
    server = await registryGet(name);
  } catch (e) {
    console.error(`registry lookup failed for ${name}: ${e.message}`);
    process.exit(1);
  }

  if (!server) {
    console.log(`readme | no server data found for ${name}`);
    process.exit(0);
  }

  const hasRemote = server.remotes && server.remotes.length > 0 &&
    server.remotes.some(r => r.type === 'streamable-http' && r.url);

  if (hasRemote) {
    const remote = server.remotes.find(r => r.type === 'streamable-http' && r.url);
    const result = await mcpToolsList(remote.url);

    if (result && result.result && result.result.tools) {
      console.log('[schema] tools/list response:');
      for (const tool of result.result.tools) {
        const params = tool.inputSchema && tool.inputSchema.properties ?
          Object.keys(tool.inputSchema.properties).join(', ') : '';
        console.log(`  ${tool.name}${params ? ` (${params})` : ''}: ${tool.description || ''}`);
      }
      return;
    }

    // Fall through to readme if MCP call fails
  }

  // Fallback to README
  const source = server.packages && server.packages[0] ?
    `${server.packages[0].type}:${server.packages[0].id || server.packages[0].ref}` :
    (server.url || server.source || 'unknown');
  console.log(`[readme] Repository: ${server.repository || 'unknown'}`);
  console.log(`[readme] Acquisition: ${source}`);
  if (server.description) console.log(`[readme] Description: ${server.description}`);
  console.log('[readme] No live tools/list available — inspect the repository README for tool details.');
}

function recordVerb(args) {
  const { positional, opts } = splitArgs(args);
  const name = positional[0];
  if (!name) { console.error('record: server name required'); process.exit(1); }

  const state = opts.state;
  const reason = opts.reason;
  const capability = opts.capability;
  const source = opts.source || name;
  const useWhen = opts['use-when'];
  const rolesStr = opts.roles;
  const avoidWhen = opts['avoid-when'];
  const tier = opts.tier;
  const deepRef = opts['deep-ref'];
  const fallback = opts.fallback;

  if (!state || !VALID_STATES.has(state)) {
    console.error('record: --state is required (canonical | suppressed | unreviewed)');
    process.exit(1);
  }

  if (state !== 'canonical') {
    if (!reason) {
      console.error('record: --reason is required when state is not canonical');
      process.exit(1);
    }
  }

  if (state === 'canonical') {
    if (!useWhen) {
      console.error('record: --use-when is required when state is canonical');
      process.exit(1);
    }
    if (!rolesStr) {
      console.error('record: --roles is required when state is canonical');
      process.exit(1);
    }
  }

  if (!capability) {
    console.error('record: --capability is required');
    process.exit(1);
  }

  const entry = { state };
  if (reason) entry.reason = reason;
  if (state === 'canonical' && useWhen) entry.use_when = useWhen;
  if (rolesStr) {
    entry.roles = rolesStr.split(',').map(r => r.trim()).filter(Boolean);
  }
  if (avoidWhen) entry.avoid_when = avoidWhen;
  if (tier) entry.tier = tier;
  if (deepRef) entry.deep_ref = deepRef;
  if (fallback) entry.fallback = fallback;
  if (source) entry.source = source;

  let data;
  try {
    data = loadCapabilities(REGISTRY_PATH);
  } catch (e) {
    console.error(`Failed to load registry: ${e.message}`);
    process.exit(1);
  }

  if (!data.capabilities) data.capabilities = {};
  if (!data.capabilities[capability]) data.capabilities[capability] = {};

  const instKey = source.startsWith('mcp:') || source.startsWith('plugin:') ||
    source.startsWith('skill:') || source.startsWith('cli:') || source.startsWith('agent:') ?
    source : `mcp:${name}`;

  data.capabilities[capability][instKey] = entry;

  let header = '';
  if (fs.existsSync(REGISTRY_PATH)) {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const match = raw.match(/^(#.*\n)*/);
    if (match) header = match[0];
  }
  const yamlStr = yaml.dump(data, { indent: 2, lineWidth: -1, noRefs: true });
  fs.writeFileSync(REGISTRY_PATH, `${header}---\n${yamlStr}`, 'utf8');

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-record-'));
  try {
    execSync(`node ${path.join(process.cwd(), 'scripts', 'toolset', 'check.mjs')}`, {
      env: { ...process.env, TOOLSET_REGISTRY: REGISTRY_PATH, TOOLSET_OUT_DIR: outDir },
      stdio: 'inherit',
    });
  } catch (e) {
    process.exit(e.status || 1);
  } finally {
    try { fs.rmSync(outDir, { recursive: true }); } catch {}
  }
}

async function main() {
  switch (verb) {
    case 'find':
      await findVerb(argv.slice(1));
      break;
    case 'inspect':
      await inspectVerb(argv.slice(1));
      break;
    case 'record':
      recordVerb(argv.slice(1));
      break;
    default:
      console.error(`Unknown verb: ${verb}`);
      process.exit(1);
  }
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
