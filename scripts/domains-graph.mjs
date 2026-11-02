#!/usr/bin/env node
// scripts/domains-graph.mjs
//
// Kopplung Subdomain-Registry <-> Repo-Graph: erzeugt je Host einen
// Abschnitt (Auth, SSO-Gate, Client, TLS-Zertifikat, Erreichbarkeit) in
//   docs/agent-guide/maps/domains-graph.md
// Der Repo-Graph (codebase-memory) indexiert jeden Abschnitt als Section-
// Knoten; der Verweis auf manifest_source verbindet ihn mit der Manifest-
// Datei (Resource/Route-Knoten). Danach: index_repository ausfuehren.
//
//   node scripts/domains-graph.mjs            # offline: nur Soll (deterministisch)
//   node scripts/domains-graph.mjs --live     # + DNS/TLS-Zertifikat/HTTP/Pocket-ID-Client-Check
//   node scripts/domains-graph.mjs --live --cluster devmesh
//
// Soll-Ist-Pruefung SSO ohne Secret: GET <auth-host>/authorize?client_id=...
// -> Redirect nach /interaction/error "does not exist" = Client fehlt.
// Exit 1 bei live-Befund FAIL (Client fehlt, TLS ungueltig/abgelaufen).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:tls';
import { parse as parseYaml } from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(REPO, 'docs/agent-guide/registry/domains.yaml');
const OUT = join(REPO, 'docs/agent-guide/maps/domains-graph.md');
const ENV_FILE = { prodmesh: 'environments/fleet-korczewski.yaml', devmesh: 'environments/dev.yaml' };
const MESH_ALIAS = { fleet: 'prodmesh' };
const TIMEOUT = 10000;
const WARN_DAYS = 14;

const args = process.argv.slice(2);
const live = args.includes('--live');
const rawClusterArg = args.indexOf('--cluster') === -1 ? 'both' : args[args.indexOf('--cluster') + 1];
const clusterArg = MESH_ALIAS[rawClusterArg] ?? rawClusterArg;

const envVars = {};
function vars(mesh) {
  if (!envVars[mesh]) {
    const doc = parseYaml(readFileSync(join(REPO, ENV_FILE[mesh]), 'utf8'));
    envVars[mesh] = doc?.env_vars ?? {};
  }
  return envVars[mesh];
}
function resolveHost(host, mesh) {
  const v = vars(mesh);
  let ok = true;
  const out = String(host).replace(/\$\{([A-Za-z_]\w*)\}/g, (m, n) => {
    if (!v[n]) { ok = false; return m; }
    return String(v[n]);
  });
  return { host: out, ok };
}

function tlsInfo(host) {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: TIMEOUT }, () => {
      const c = socket.getPeerCertificate();
      const info = {
        issuer: c?.issuer?.O ?? c?.issuer?.CN ?? '?',
        subject: c?.subject?.CN ?? '?',
        validTo: c?.valid_to ? new Date(c.valid_to).toISOString().slice(0, 10) : '?',
        daysLeft: c?.valid_to ? Math.floor((new Date(c.valid_to) - Date.now()) / 86400000) : null,
        authorized: socket.authorized,
        authError: socket.authorizationError ? String(socket.authorizationError) : null,
        protocol: socket.getProtocol(),
      };
      socket.end();
      resolve(info);
    });
    socket.on('timeout', () => { socket.destroy(); resolve({ error: 'TLS-Timeout' }); });
    socket.on('error', (e) => resolve({ error: e.code ?? e.message }));
  });
}

async function httpStatus(host) {
  try {
    const r = await fetch(`https://${host}/`, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    const loc = r.headers.get('location');
    return { status: r.status, location: loc ? loc.replace(/state=[^&]*/, 'state=…').slice(0, 90) : null };
  } catch (e) {
    return { error: e.cause?.code ?? e.message };
  }
}

// Pocket-ID-Client existiert? Kein Secret noetig (oeffentlicher authorize-Endpunkt).
async function clientExists(authHost, clientId) {
  try {
    const url = `https://${authHost}/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=https%3A%2F%2Fx.invalid%2Fcb&response_type=code&scope=openid`;
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    const loc = r.headers.get('location') ?? '';
    return !/does\+not\+exist|does%20not%20exist|invalid_client/i.test(loc);
  } catch {
    return null;
  }
}

function manifestGate(path) {
  try {
    const t = readFileSync(join(REPO, path), 'utf8');
    if (/forwardAuth|oauth2-proxy/i.test(t)) return 'oauth2-proxy';
  } catch { /* fehlt -> unbekannt */ }
  return null;
}

const doc = parseYaml(readFileSync(REGISTRY, 'utf8'));
const entries = (doc?.domains ?? []).filter((e) => clusterArg === 'both' || e.mesh === clusterArg);
const authHostOf = new Map(); // mesh -> issuer host
for (const e of doc.domains) {
  if (e.sso?.gate === 'issuer' && e.status === 'live') authHostOf.set(e.mesh, resolveHost(e.host, e.mesh).host);
}

let fails = 0;
const sections = [];
for (const e of entries) {
  const { host, ok } = resolveHost(e.host, e.mesh);
  const lines = [`## ${host}`, ''];
  lines.push(`- id: \`${e.id}\` · mesh: ${e.mesh} · status: ${e.status}`);
  lines.push(`- Backend: \`${e.service}\` (ns \`${e.namespace}\`)`);
  lines.push(`- Manifest: \`${e.manifest_source}\``);
  lines.push(`- Auth: **${e.auth}**`);
  const findings = [];
  if (e.auth === 'oidc') {
    if (!e.sso) findings.push('SSO-Block fehlt in Registry');
    else {
      lines.push(`- SSO-Gate: ${e.sso.gate}${e.sso.client_id ? ` · Client \`${e.sso.client_id}\`` : ''}${e.sso.groups?.length ? ` · Gruppen ${e.sso.groups.join(', ')}` : ''}`);
      const detected = manifestGate(e.sso.gate_manifest ?? e.manifest_source);
      if (e.sso.gate === 'oauth2-proxy' && !detected) findings.push('Gate oauth2-proxy deklariert, im Manifest nicht gefunden');
      if (e.sso.gate === 'native' && detected) findings.push('Gate native deklariert, Manifest enthaelt aber oauth2-proxy/forwardAuth');
    }
  }
  if (live && e.status === 'live' && ok) {
    const tls = await tlsInfo(host);
    if (tls.error) { lines.push(`- TLS: FAIL ${tls.error}`); findings.push(`TLS ${tls.error}`); }
    else {
      lines.push(`- TLS: ${tls.protocol} · Aussteller ${tls.issuer} · gueltig bis ${tls.validTo} (${tls.daysLeft} Tage) · Kette ${tls.authorized ? 'vertraut' : `NICHT vertraut (${tls.authError})`}`);
      if (!tls.authorized) findings.push(`Zertifikat nicht vertraut: ${tls.authError}`);
      else if (tls.daysLeft !== null && tls.daysLeft < 0) findings.push('Zertifikat abgelaufen');
      else if (tls.daysLeft !== null && tls.daysLeft < WARN_DAYS) lines.push(`- WARN: Zertifikat laeuft in ${tls.daysLeft} Tagen ab`);
    }
    const h = await httpStatus(host);
    lines.push(`- HTTP: ${h.error ?? `${h.status}${h.location ? ` → ${h.location}` : ''}`}${e.expect?.status && h.status && !e.expect.status.includes(h.status) ? ` (erwartet ${e.expect.status.join('/')})` : ''}`);
    if (e.expect?.status && h.status && !e.expect.status.includes(h.status)) findings.push(`HTTP ${h.status} statt ${e.expect.status.join('/')}`);
    if (h.error) findings.push(`HTTP ${h.error}`);
    if (e.sso?.client_id) {
      const issuer = authHostOf.get(e.mesh);
      const exists = issuer ? await clientExists(issuer, e.sso.client_id) : null;
      lines.push(`- Pocket-ID-Client: ${exists === null ? 'unbekannt' : exists ? 'vorhanden' : 'FEHLT'}`);
      if (exists === false) findings.push(`OIDC-Client '${e.sso.client_id}' fehlt in Pocket ID`);
    }
  }
  if (findings.length) { lines.push(`- **Befund:** ${findings.join('; ')}`); fails += findings.length; }
  sections.push(lines.join('\n'));
}

const head = [
  '# Domains-Graph (generiert)', '',
  `Quelle: \`docs/agent-guide/registry/domains.yaml\` · Erzeugt mit \`node scripts/domains-graph.mjs${live ? ' --live' : ''}\`${live ? ` · Stand ${new Date().toISOString()}` : ''}.`,
  'Nicht von Hand editieren. Nach Aenderung den Repo-Graph neu indizieren (`index_repository`).', '',
].join('\n');
writeFileSync(OUT, `${head}\n${sections.join('\n\n')}\n`);
console.log(`domains-graph: ${entries.length} Hosts -> ${OUT.replace(`${REPO}/`, '')}${live ? `, ${fails} Befund(e)` : ''}`);
process.exit(live && fails > 0 ? 1 : 0);
