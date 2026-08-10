// scripts/llm-proxy/bge-routes.mjs
// T003205 — Rollenaufloesung und Failover-Kette fuer die bge-Routen des
// llm-proxys. GETRENNT von der Chat-Modellaufloesung (discovery.mjs): die
// Rolle kommt aus dem PFAD, nie aus dem model-Feld. Kaeme ein Embedding-Modell
// in die Chat-Aufloesung, koennte ein Client, der sich das erste Modell der
// Liste greift, bge-m3 eine Chat-Completion schicken — exakt die Fehlerklasse,
// die T003203 behebt.
//
// Das Modul kennt den HTTP-Server nicht: es bekommt Konfiguration und einen
// Request-Body herein und liefert ein Ergebnis heraus. Diese Grenze ist der
// Grund, warum die Failover-Semantik gegen Stubs pruefbar ist
// (scripts/llm-proxy/bge-routes.test.mjs).
//
// FAILOVER IST ANFRAGE-GETRIEBEN, NICHT HEALTH-GETRIEBEN (T002838):
// Am 2026-08-09 hing bge_embed ueber 60 s am Cluster-Endpoint, WAEHREND DESSEN
// /health weiter 200 lieferte (scripts/bge-mcp/server.mjs:105-111). Ein
// Health-Endpunkt beantwortet "lebt der Prozess", nicht "kann er meine Anfrage
// bedienen". Die Auswahl geschieht deshalb NUR ueber den Ausgang der
// weitergeleiteten Anfrage: Verbindungsfehler/Timeout/5xx -> naechstes Glied,
// 4xx -> durchreichen, Kette erschoepft -> 503 mit Grund JE Glied.
import { findLoadout, isLoadoutActive } from './loadouts.mjs';
import { unitStatus, startUnit } from './runner.mjs';
import { resolveModelPath } from './models.mjs';
import { join } from 'node:path';

// Versionsneutraler Symlink wie in server.mjs (T002536): 'opt/llama-current'
// zeigt auf den aktuellen llama.cpp-Build.
const LLAMA_BIN = process.env.LLAMA_SERVER_BIN
  || join(process.env.HOME, 'opt/llama-current/bin/llama-server');

// Default-Timeout je Glied: 30000 ms, gleich BGE_MCP_UPSTREAM_TIMEOUT_MS im
// Shim, damit die beiden Zeitschranken nicht gegeneinander laufen.
export const ROLE_TIMEOUT_MS = Number(process.env.BGE_ROUTE_TIMEOUT_MS || 30_000);
// Start-Budget fuer Loadout-Glieder: Start PLUS Cluster-Rueckfall muessen
// zusammen unter der 30-s-Schranke des Shims bleiben.
export const LOADOUT_START_BUDGET_MS = Number(process.env.BGE_LOADOUT_START_BUDGET_MS || 20_000);

const ROLE_PATHS = new Map([
  ['/v1/embeddings', 'embed'],
  ['/v1/rerank', 'rerank'],
]);

/** Rolle aus dem PFAD ableiten — bewusst nicht aus dem model-Feld. */
export function roleForPath(path) {
  return ROLE_PATHS.get(path) ?? null;
}

/**
 * Liest die Rollen-Ketten aus dem bereits geparsten loadouts.json-Dokument.
 * Ein Eintrag ist entweder {kind:'loadout', slug} (Praefix 'loadout:') oder
 * {kind:'url', baseUrl}. Unbekannte Praefixe und leere Ketten werfen mit
 * nennendem Text, damit ein Konfigurationsfehler beim Start auffaellt und
 * nicht beim ersten Request.
 *
 * @param {object} doc geparstes loadouts.json-Dokument
 * @returns {Map<string, Array<{kind:'loadout'|'url', slug?:string, baseUrl?:string}>>}
 */
export function loadRoles(doc) {
  const roles = doc?.roles;
  if (typeof roles !== 'object' || roles === null || Array.isArray(roles)) {
    throw new Error('loadouts.json: Top-Level-Schluessel "roles" fehlt — bge-Routen nicht konfiguriert');
  }
  const out = new Map();
  for (const [role, cfg] of Object.entries(roles)) {
    if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
      throw new Error(`roles.${role}: kein Objekt`);
    }
    if (!Array.isArray(cfg.chain) || cfg.chain.length === 0) {
      throw new Error(`roles.${role}: chain muss ein nicht-leeres Array sein`);
    }
    const chain = cfg.chain.map((entry) => {
      if (typeof entry !== 'string' || entry === '') {
        throw new Error(`roles.${role}: Ketten-Eintrag muss ein nicht-leerer String sein`);
      }
      if (entry.startsWith('loadout:')) {
        return { kind: 'loadout', slug: entry.slice('loadout:'.length) };
      }
      if (/^https?:\/\//.test(entry)) {
        return { kind: 'url', baseUrl: entry };
      }
      throw new Error(`roles.${role}: unbekannter Ketten-Eintrag '${entry}' — erwartet 'loadout:<slug>' oder eine http(s)-URL`);
    });
    out.set(role, chain);
  }
  return out;
}

function parseBody(text) {
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * Spricht EINEN Upstream an und klassifiziert das Ergebnis in genau vier
 * Faelle plus Timeout — "nicht erreichbar" und "hat angenommen, aber nicht
 * geantwortet" sind verschiedene Diagnosen (dasselbe Argument wie
 * scripts/bge-mcp/server.mjs:128-130).
 *
 * @returns {Promise<{kind:'ok', status:number, body:object|string, contentType:string}
 *                  |{kind:'client_error', status:number, body:object|string, contentType:string}
 *                  |{kind:'server_error', status:number, reason:string}
 *                  |{kind:'timeout', reason:string}
 *                  |{kind:'unreachable', reason:string}>}
 */
export async function callEntry(baseUrl, path, body, timeoutMs) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    if (res.status >= 200 && res.status < 300) {
      return { kind: 'ok', status: res.status, body: parseBody(text), contentType };
    }
    if (res.status >= 400 && res.status < 500) {
      // 4xx ist ein Fehler des AUFRUFERS: durchreichen, kein Failover.
      return { kind: 'client_error', status: res.status, body: parseBody(text), contentType };
    }
    return { kind: 'server_error', status: res.status, reason: `HTTP ${res.status} vom Upstream` };
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { kind: 'timeout', reason: `keine Antwort innerhalb von ${timeoutMs} ms` };
    }
    return { kind: 'unreachable', reason: err?.message ?? String(err) };
  }
}

/**
 * Startet ein Loadout-Glied bei Bedarf ueber die vorhandene Start-Maschinerie
 * (models.mjs + runner.mjs) und wartet hoechstens startBudgetMs auf
 * Bereitschaft. Scheitert Start oder Wartezeit, wird geworfen — der Aufrufer
 * behandelt den Eintrag dann als gescheitert, ein nicht startendes Loadout
 * darf den Request nicht verschlucken.
 */
export async function defaultStartLoadout(slug, doc, startBudgetMs = LOADOUT_START_BUDGET_MS) {
  const loadout = findLoadout(doc, slug);
  if (!loadout) throw new Error(`loadout:${slug} nicht in loadouts.json`);
  const modelPath = resolveModelPath(doc, loadout);
  if (!modelPath) throw new Error(`Modell ${loadout.model} in keiner modelRoot gefunden`);
  startUnit(loadout, modelPath, doc.defaults, LLAMA_BIN);
  const deadline = Date.now() + startBudgetMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${loadout.port}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch { /* noch nicht bereit */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`loadout:${slug} wurde nicht innerhalb von ${startBudgetMs} ms bereit`);
}

async function ensureLoadoutUrl(slug, doc, startLoadout, startBudgetMs, statusFn = unitStatus) {
  const loadout = findLoadout(doc, slug);
  if (!loadout) throw new Error(`loadout:${slug} nicht in loadouts.json`);
  if (!isLoadoutActive(loadout, statusFn(slug))) {
    await startLoadout(slug, doc, startBudgetMs);
  }
  return `http://127.0.0.1:${loadout.port}`;
}

/**
 * Arbeitet die Kette der Reihe nach ab.
 *   ok            -> sofort zurueck, mit dem Namen des Eintrags
 *   client_error  -> sofort zurueck, OHNE weiteren Eintrag (durchreichen)
 *   server_error  -> naechster Eintrag
 *   timeout/unreachable -> naechster Eintrag
 *   Kette erschoepft -> 503, Body nennt JE Eintrag einen Grund
 *
 * Der Rueckgabe-`body` ist die fertige Wire-Antwort als String; der Aufrufer
 * schreibt sie roh mit dem Content-Type des Upstreams.
 *
 * @returns {Promise<{status:number, body:string, upstream:string|null, contentType?:string}>}
 */
export async function routeRequest({
  role, path, body, chain, doc,
  startLoadout = defaultStartLoadout,
  timeoutMs = ROLE_TIMEOUT_MS,
  startBudgetMs = LOADOUT_START_BUDGET_MS,
  unitStatus: statusFn = unitStatus,
}) {
  const failures = [];
  for (const entry of chain) {
    let baseUrl;
    let name;
    if (entry.kind === 'loadout') {
      name = entry.slug;
      try {
        baseUrl = await ensureLoadoutUrl(entry.slug, doc, startLoadout, startBudgetMs, statusFn);
      } catch (err) {
        failures.push({ entry: name, reason: err.message });
        continue;
      }
    } else {
      name = entry.baseUrl;
      baseUrl = entry.baseUrl;
    }

    const r = await callEntry(baseUrl, path, body, timeoutMs);
    if (r.kind === 'ok' || r.kind === 'client_error') {
      return { status: r.status, body: JSON.stringify(r.body), upstream: name, contentType: r.contentType };
    }
    failures.push({ entry: name, reason: r.reason });
  }

  return {
    status: 503,
    body: JSON.stringify({
      error: {
        code: 'bge_chain_exhausted',
        message: `alle Glieder der Kette fuer Rolle '${role}' fehlgeschlagen`,
        entries: failures,
      },
    }),
    upstream: null,
  };
}
