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
// [T900107] Kein Import aus runner.mjs/models.mjs mehr: die Ketten bestehen
// ausschliesslich aus URLs. Ein 'loadout:'-Glied haette eine llama.cpp-Instanz
// als systemd-User-Unit gestartet — den WSL-Host, der das trug, gibt es seit
// ADR-007 nicht mehr, und im Cluster steht keine GPU zur Verfuegung.

// Default-Timeout je Glied: 30000 ms, gleich BGE_MCP_UPSTREAM_TIMEOUT_MS im
// Shim, damit die beiden Zeitschranken nicht gegeneinander laufen.
export const ROLE_TIMEOUT_MS = Number(process.env.BGE_ROUTE_TIMEOUT_MS || 60_000);

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
 * Ein Eintrag ist {kind:'url', baseUrl}. Unbekannte Praefixe und leere Ketten werfen mit
 * nennendem Text, damit ein Konfigurationsfehler beim Start auffaellt und
 * nicht beim ersten Request.
 *
 * @param {object} doc geparstes loadouts.json-Dokument
 * @returns {Map<string, Array<{kind:'url', baseUrl:string}>>}
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
      if (/^https?:\/\//.test(entry)) {
        return { kind: 'url', baseUrl: entry };
      }
      // [T900107] 'loadout:<slug>' faellt bewusst in diesen Zweig: der Eintrag
      // wird nicht still ignoriert, sondern nennt beim Start den Grund.
      throw new Error(`roles.${role}: unbekannter Ketten-Eintrag '${entry}' — erwartet eine http(s)-URL (lokale Loadouts entfallen, T900107)`);
    });
    out.set(role, chain);
  }
  return out;
}

/**
 * Baut die Rollen-Ketten aus der Backend-Registry (tickets.llm_proxy_backends).
 * - Zeilen mit enabled === false werden verworfen
 * - Sortierung nach priority aufsteigend
 * - jede Zeile wird zu { kind: 'url', baseUrl } — loadout_slug wird nicht mehr
 *   ausgewertet (T900107)
 *
 * @param {Array<object>} backends
 * @returns {Map<string, Array<{kind:'url', baseUrl:string}>>}
 */
export function rolesFromRegistry(backends) {
  const out = new Map();
  if (!Array.isArray(backends)) return out;

  const valid = backends
    .filter((b) => b && b.enabled !== false)
    .slice()
    .sort((a, b) => (Number(a.priority) || 100) - (Number(b.priority) || 100));

  for (const b of valid) {
    const roles = Array.isArray(b.roles) ? b.roles : [];
    const entry = { kind: 'url', baseUrl: b.baseUrl || b.base_url };

    for (const r of roles) {
      if (typeof r !== 'string' || !r) continue;
      if (!out.has(r)) out.set(r, []);
      out.get(r).push(entry);
    }
  }
  return out;
}

let lastFallbackLogState = false;

/**
 * Loest die Kette fuer eine Rolle auf: zunaechst ueber die Registry, bei Fehler
 * oder leerer Kette ueber den Rueckfall in loadouts.json (E3).
 * Loggt genau eine Warnung pro Zustandswechsel.
 *
 * @param {string} role 'embed' | 'rerank'
 * @param {Array<object>} backends Registry-Array (getBackends())
 * @param {object} doc geparstes loadouts.json-Dokument
 * @returns {Array<{kind:'url', baseUrl:string}>}
 */
export function resolveRoleChain(role, backends, doc) {
  try {
    const fromReg = rolesFromRegistry(backends);
    const chain = fromReg.get(role);
    if (Array.isArray(chain) && chain.length > 0) {
      if (lastFallbackLogState) {
        console.info(`[bge-routes] registry chain restored for role "${role}"`);
        lastFallbackLogState = false;
      }
      return chain;
    }
  } catch {
    // Registry-Auswertung fehlgeschlagen -> Fallback unten
  }

  if (!lastFallbackLogState) {
    console.warn(`[bge-routes] registry chain empty or unavailable for role "${role}", falling back to loadouts.json`);
    lastFallbackLogState = true;
  }
  return loadRoles(doc).get(role) || [];
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
  role, path, body, chain,
  timeoutMs = ROLE_TIMEOUT_MS,
}) {
  const failures = [];
  for (const entry of chain) {
    const name = entry.baseUrl;
    const baseUrl = entry.baseUrl;

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
