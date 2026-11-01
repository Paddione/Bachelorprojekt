#!/usr/bin/env node
// scripts/domains-probe.mjs
//
// Live-Host-E2E-Probe ueber die Frontend-Domain-Registry
// (docs/agent-guide/registry/domains.yaml, SSOT).
//
//   node scripts/domains-probe.mjs                        # beide Cluster pruefen
//   node scripts/domains-probe.mjs --cluster fleet        # nur fleet
//   node scripts/domains-probe.mjs --validate-only        # nur Schema +
//     Platzhalter-Aufloesung, kein Netzwerk (CI-sicher)
//   node scripts/domains-probe.mjs --registry <pfad> ...  # gegen Fixture laufen
//
// Je status:live-Eintrag: ${VAR}-Platzhalter aus der festen Env-Datei je
// Cluster aufloesen (fleet -> environments/fleet-korczewski.yaml, devmesh ->
// environments/dev.yaml, jeweils env_vars-Sektion; unaufloesbar -> FAIL),
// dann DNS -> TLS (Port 443, rejectUnauthorized) -> HTTP-Status/Redirect
// (immer GET https://<host>/, Redirects folgen NICHT, Timeout 15 s).
// Der Status muss in expect.status enthalten sein; bei 3xx muss der
// Location-Header expect.redirect_to_contains enthalten (wenn gesetzt).
// Hybrid-Semantik: ENOTFOUND bei cluster devmesh -> SKIP (no-tailnet);
// bei fleet -> FAIL. Jede andere Abweichung failt.
// status frozen|retired -> SKIP. Exit 0 nur bei 0 FAIL.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve4, resolve6 } from 'node:dns/promises';
import { connect } from 'node:tls';
import { parse as parseYaml } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REGISTRY = join(REPO, 'docs/agent-guide/registry/domains.yaml');
const CLUSTER_ENV_FILE = {
  fleet: 'environments/fleet-korczewski.yaml',
  devmesh: 'environments/dev.yaml',
};
const ALLOWED_CLUSTER = new Set(['fleet', 'devmesh', 'both']);
const HTTP_TIMEOUT_MS = 15000;
const TLS_WARN_DAYS = 14;

// ── Registry + Env-Dateien ───────────────────────────────────────────────────

function loadRegistry(path) {
  const doc = parseYaml(readFileSync(path, 'utf8'));
  const list = doc?.domains;
  if (!Array.isArray(list)) throw new Error(`kein Listen-Schluessel 'domains': ${path}`);
  return list;
}

const envCache = new Map();
function loadEnvVars(cluster) {
  if (envCache.has(cluster)) return envCache.get(cluster);
  const file = CLUSTER_ENV_FILE[cluster];
  if (!file) throw new Error(`unbekannter Cluster '${cluster}'`);
  const doc = parseYaml(readFileSync(join(REPO, file), 'utf8'));
  const vars = doc?.env_vars ?? {};
  envCache.set(cluster, vars);
  return vars;
}

function resolveHost(template, cluster) {
  const vars = loadEnvVars(cluster);
  const missing = [];
  const resolved = String(template).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) => {
    const value = vars[name];
    if (value === undefined || value === null || value === '') {
      missing.push(name);
      return m;
    }
    return String(value);
  });
  return { resolved, missing };
}

// ── Validierung (offline) ────────────────────────────────────────────────────

function validateEntry(entry) {
  const label = entry?.id ?? '(ohne id)';
  const problems = [];
  if (entry?.status === 'live') {
    const status = entry?.expect?.status;
    if (!Array.isArray(status) || status.length === 0) {
      problems.push(`${label}: live ohne expect.status`);
    } else {
      for (const code of status) {
        if (!Number.isInteger(code) || code < 100 || code > 499) {
          problems.push(`${label}: expect.status enthaelt ungueltigen Code '${code}'`);
        }
      }
    }
    const { missing } = resolveHost(entry?.host ?? '', entry?.cluster);
    for (const name of missing) {
      problems.push(`${label}: Platzhalter \${${name}} nicht in ${CLUSTER_ENV_FILE[entry?.cluster] ?? '(unbekannte Env-Datei)'} aufloesbar`);
    }
  }
  return problems;
}

// ── Netzwerk: DNS → TLS → HTTP ───────────────────────────────────────────────

function isNotFound(error) {
  return error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN';
}

async function checkDns(host) {
  try {
    await resolve4(host);
    return null;
  } catch (error4) {
    if (!isNotFound(error4)) return error4;
    try {
      await resolve6(host);
      return null;
    } catch (error6) {
      return isNotFound(error6) ? error6 : error6;
    }
  }
}

function checkTls(host) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.destroy(new Error('TLS-Timeout'));
    }, HTTP_TIMEOUT_MS);
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: true }, () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      socket.end();
      if (cert && cert.valid_to) {
        const daysLeft = (Date.parse(cert.valid_to) - Date.now()) / 86400000;
        if (daysLeft < TLS_WARN_DAYS) {
          resolve({ warn: `Zertifikat laeuft in ${daysLeft.toFixed(1)} Tagen ab (${cert.valid_to})` });
          return;
        }
      }
      resolve({});
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      resolve({ fail: error.message });
    });
  });
}

async function checkHttp(host, expect) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('HTTP-Timeout 15 s')), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(`https://${host}/`, { redirect: 'manual', signal: controller.signal });
    const status = response.status;
    await response.arrayBuffer().catch(() => null);
    if (!expect.status.includes(status)) {
      return { fail: `Status ${status} nicht in expect [${expect.status.join(', ')}]` };
    }
    if (status >= 300 && status < 400 && expect.redirect_to_contains) {
      const location = response.headers.get('location') ?? '';
      if (!location.includes(expect.redirect_to_contains)) {
        return { fail: `Redirect ${status} Location '${location}' enthaelt '${expect.redirect_to_contains}' nicht` };
      }
      return { detail: `${status} -> ${location}` };
    }
    return { detail: `${status}` };
  } catch (error) {
    return { fail: error.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Einstieg ─────────────────────────────────────────────────────────────────

async function probeEntry(entry) {
  const { resolved, missing } = resolveHost(entry.host, entry.cluster);
  if (missing.length > 0) {
    return { kind: 'FAIL', host: String(entry.host), detail: `Platzhalter ${missing.map((m) => `\${${m}}`).join(', ')} nicht aufloesbar` };
  }
  const dnsError = await checkDns(resolved);
  if (dnsError) {
    if (isNotFound(dnsError) && entry.cluster === 'devmesh') {
      return { kind: 'SKIP', host: resolved, detail: `no-tailnet (${dnsError.code ?? dnsError.message})` };
    }
    return { kind: 'FAIL', host: resolved, detail: `DNS: ${dnsError.message ?? dnsError.code}` };
  }
  const tls = await checkTls(resolved);
  if (tls.fail) {
    return { kind: 'FAIL', host: resolved, detail: `TLS: ${tls.fail}` };
  }
  const http = await checkHttp(resolved, entry.expect);
  if (http.fail) {
    return { kind: 'FAIL', host: resolved, detail: http.fail };
  }
  const detail = tls.warn ? `${http.detail} (WARN ${tls.warn})` : http.detail;
  return { kind: 'PASS', host: resolved, detail };
}

async function main(argv) {
  const registryFlag = argv.indexOf('--registry');
  const registryPath = registryFlag === -1 ? DEFAULT_REGISTRY : argv[registryFlag + 1];
  if (registryFlag !== -1 && !registryPath) {
    console.error('domains-probe: --registry braucht einen Pfad');
    return 2;
  }
  const clusterFlag = argv.indexOf('--cluster');
  const cluster = clusterFlag === -1 ? 'both' : argv[clusterFlag + 1];
  if (!ALLOWED_CLUSTER.has(cluster)) {
    console.error(`domains-probe: --cluster muss fleet|devmesh|both sein (war '${cluster}')`);
    return 2;
  }
  const validateOnly = argv.includes('--validate-only');

  let entries;
  try {
    entries = loadRegistry(registryPath);
  } catch (error) {
    console.error(`domains-probe: ${error.message}`);
    return 2;
  }

  const selected = entries.filter((e) => cluster === 'both' || e?.cluster === cluster);
  let pass = 0;
  let skip = 0;
  let fail = 0;

  for (const entry of selected) {
    const label = entry?.id ?? '(ohne id)';
    if (entry?.status !== 'live') {
      console.log(`SKIP ${label} (${entry?.status ?? 'ohne status'})`);
      skip += 1;
      continue;
    }
    const problems = validateEntry(entry);
    if (problems.length > 0) {
      for (const problem of problems) console.log(`FAIL ${entry?.host ?? label} (${problem})`);
      fail += problems.length;
      continue;
    }
    if (validateOnly) {
      const { resolved } = resolveHost(entry.host, entry.cluster);
      console.log(`PASS ${resolved} (validate-only)`);
      pass += 1;
      continue;
    }
    const result = await probeEntry(entry);
    console.log(`${result.kind} ${result.host} (${result.detail})`);
    if (result.kind === 'PASS') pass += 1;
    else if (result.kind === 'SKIP') skip += 1;
    else fail += 1;
  }

  console.log(`domains-probe: ${pass} PASS, ${skip} SKIP, ${fail} FAIL`);
  return fail === 0 ? 0 : 1;
}

process.exit(await main(process.argv.slice(2)));
