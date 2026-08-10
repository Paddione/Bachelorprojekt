// scripts/llm-proxy/discovery.mjs
import { resolveApiKey } from './backends.mjs';
import { evaluateLock, lockFilePath } from './gpu-lock.mjs';

const PROBE_TIMEOUT_MS = 2500;
const BACKOFF_MS = 15_000;

/** @type {Map<string,{healthy:boolean,draining:boolean,models:string[],loaded:Set<string>,backoffUntil:number,lastProbe:number}>} */
const health = new Map();
/** @type {Map<string,string[]>} catalog: modelId → backend names by priority */
let catalog = new Map();
let lastProbeAt = 0;
/** @type {{held:boolean,drainingKinds:string[]}} */
let lastLock = { held: false, drainingKinds: [] };

/** @returns {Promise<{healthy:boolean,models:string[],loaded:Set<string>,reason:string|null}>} */
export async function probeBackend(backend) {
  try {
    // [T002638] Der Probe MUSS dasselbe Credential fuehren wie der Weiterleitungspfad
    // (server.mjs nutzt dafuer dieselbe resolveApiKey). Ohne den Header antwortet jede
    // API mit Pflicht-Auth 401 — gemessen an api.deepseek.com/v1/models: ohne Auth 401,
    // mit Auth 200. Das catch{} unten bildete das auf healthy:false ab, das Backend galt
    // also dauerhaft als tot, obwohl Anfragen dorthin funktioniert haetten. Folge: die
    // Fallback-Kette konnte nie auf ein Remote-Backend ausweichen.
    //
    // Backends ohne apiKeyEnv (lokale llama.cpp-Server) senden bewusst KEINEN Header:
    // ein leeres "Bearer " waere dort eine unnoetige Verhaltensaenderung.
    const key = resolveApiKey(backend);
    const res = await fetch(`${backend.baseUrl}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    const models = (body.data || []).map((m) => m.id);
    const loaded = new Set();
    if (backend.kind === 'lmstudio') {
      const host = backend.baseUrl.replace(/\/v1\/?$/, '');
      const v0 = await fetch(`${host}/api/v0/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).then((r) => r.json()).catch(() => null);
      for (const m of (v0?.data || [])) if (m.state === 'loaded') loaded.add(m.id);
    }
    return { healthy: true, models, loaded, reason: null };
  } catch (err) {
    // [T002638] Den Grund mitgeben statt verwerfen. Bisher bildete dieses catch{}
    // 401, Timeout und DNS-Fehler auf denselben stummen Zustand ab — eine
    // Auth-Fehlkonfiguration war von Unerreichbarkeit nicht unterscheidbar, und
    // genau deshalb blieb der fehlende Header lange unbemerkt. Geloggt wird der
    // Grund nur beim Zustandswechsel (startDiscovery), nicht bei jedem Durchlauf.
    return { healthy: false, models: [], loaded: new Set(), reason: err?.message || String(err) };
  }
}

export function startDiscovery(getBackends, intervalMs) {
  const tick = async () => {
    // GPU-Lock auswerten: welche Kinds sind im Draining?
    const lock = evaluateLock(lockFilePath());
    lastLock = { held: lock.held, drainingKinds: lock.drainingKinds || [] };
    const drainingKinds = new Set(lock.held ? (lock.drainingKinds || []) : []);

    const next = new Map();
    for (const b of getBackends()) {
      const prev = health.get(b.name);
      const shouldDrain = drainingKinds.has(b.kind);
      // [T002628] Draining-Logik: EINTRITT und AUSTRITT je einmal loggen.
      if (shouldDrain && (!prev || !prev.draining)) {
        console.log(`[discovery] ${b.name} draining (GPU-Lock gehalten: ${lock.reason || '?'})`);
      } else if (!shouldDrain && prev && prev.draining) {
        console.log(`[discovery] ${b.name} nicht mehr draining (Lock aufgehoben)`);
      }

      // Drainende Backends: kein Probe, kein Backoff, kein unhealthy-Log.
      if (shouldDrain) {
        health.set(b.name, { healthy: prev?.healthy ?? true, draining: true,
          models: prev?.models || [], loaded: prev?.loaded || new Set(),
          backoffUntil: 0, lastProbe: prev?.lastProbe || Date.now() });
        for (const id of (prev?.models || [])) { if (!next.has(id)) next.set(id, []); next.get(id).push(b.name); }
        continue;
      }

      if (prev && !prev.healthy && Date.now() < prev.backoffUntil) { health.set(b.name, prev); continue; }
      const r = await probeBackend(b);
      // [T002638] Genau eine Zeile beim Uebergang nach unhealthy. Nicht bei jedem
      // Durchlauf: der Probe laeuft im Intervall und wuerde das Journal sonst
      // fluten — wie es die MCP-Bruecke am 2026-08-04 mit 10.486 Zeilen pro Stunde
      // vorgemacht hat. "kein Eintrag" zaehlt als Uebergang, damit ein Backend, das
      // beim ersten Probe schon tot ist, nicht stillschweigend verschwindet.
      //
      // Bewusst NICHT gegen das oben gelesene `prev` geprueft, sondern gegen den
      // JETZT gueltigen Eintrag: setInterval feuert den naechsten Tick unabhaengig
      // davon, ob der vorige fertig ist, und `startDiscovery` tickt beim Start
      // zusaetzlich sofort. Zwei ueberlappende Ticks lesen beide dasselbe veraltete
      // `prev` und melden denselben Uebergang doppelt (im Test reproduziert).
      // Zwischen diesem Lesen und dem Schreiben unten liegt kein await, der
      // Doppel-Log ist damit ausgeschlossen.
      const current = health.get(b.name);
      if (!r.healthy && (!current || current.healthy)) {
        console.warn(`[discovery] ${b.name} unhealthy: ${r.reason ?? 'unknown'} (${b.baseUrl})`);
      }
      health.set(b.name, { ...r, draining: false, backoffUntil: r.healthy ? 0 : Date.now() + BACKOFF_MS, lastProbe: Date.now() });
      for (const id of r.models) { if (!next.has(id)) next.set(id, []); next.get(id).push(b.name); }
    }
    catalog = next;
    lastProbeAt = Date.now();
  };
  tick();
  const t = setInterval(tick, intervalMs);
  t.unref?.();
  return { timer: t, probeNow: tick };
}

/**
 * Backend-Arten, die auf eigener Infrastruktur laufen [T002657].
 *
 * Bewusst eine POSITIVliste, obwohl T002674 fuer den Watchdog das Gegenteil
 * gelernt hat — entscheidend ist die Richtung, in die eine Liste altert. Beim
 * Watchdog liess eine Allowlist neue Typen unbemerkt durchfallen: sie alterte
 * ins Unsichere. Hier ist es umgekehrt: ein kuenftiges, unbekanntes `kind` gilt
 * als NICHT lokal, faellt also aus dem lokal-only-Weg heraus und fuehrt zum
 * Fehlschlag statt zur Uebertragung. Dieselbe Regel wie bei data_residency:
 * eine fehlende Zusage ist keine Zusage.
 *
 * Gefiltert wird ueber `kind`, nicht ueber Backend-Namen — eine Namensliste
 * veraltet still, sobald ein Backend hinzukommt.
 */
const LOCAL_BACKEND_KINDS = new Set(['llamacpp', 'lmstudio']);

/** @param {{kind?:string}} b */
export function isLocalBackend(b) {
  return LOCAL_BACKEND_KINDS.has(b?.kind);
}

/**
 * @param {string} requestedId
 * @param {() => import('./backends.mjs').Backend[]} getBackends
 * @param {{localOnly?: boolean}} [opts] localOnly: nur eigene Infrastruktur;
 *   ist keine verfuegbar, wird NICHT auf ein remote-Backend substituiert,
 *   sondern null geliefert (der Aufrufer meldet das als Fehlschlag).
 * @returns {{backend:import('./backends.mjs').Backend, servedModel:string, substituted:boolean}|null}
 */
export function resolveModel(requestedId, getBackends, opts = {}) {
  const localOnly = opts.localOnly === true;
  // Gewoehnliche Anfragen behalten ihren Fallback unveraendert — der
  // lokal-only-Weg ist eine zusaetzliche Einschraenkung, keine Umstellung.
  const eligible = getBackends().filter((b) => !localOnly || isLocalBackend(b));
  const byName = (n) => eligible.find((b) => b.name === n);
  const isServing = (n) => {
    const h = health.get(n);
    return h?.healthy && !h.draining;
  };
  const isEligible = (n) => eligible.some((b) => b.name === n);
  const healthyNames = (id) => (catalog.get(id) || []).filter((n) => isServing(n) && isEligible(n));

  const exact = healthyNames(requestedId);
  if (exact.length) return { backend: byName(exact[0]), servedModel: requestedId, substituted: false };

  for (const b of eligible) {
    const aliased = b.modelAliases[requestedId];
    if (aliased && healthyNames(aliased).includes(b.name) && isServing(b.name)) {
      return { backend: b, servedModel: aliased, substituted: true };
    }
  }

  for (const b of eligible) {
    const h = health.get(b.name);
    if (h?.healthy && !h.draining && h.models.length) return { backend: b, servedModel: h.models[0], substituted: true };
  }
  return null;
}

export function aggregateModels() {
  const data = [];
  for (const id of catalog.keys()) if ((catalog.get(id) || []).some((n) => health.get(n)?.healthy)) {
    data.push({ id, object: 'model', owned_by: 'llm-proxy' });
  }
  return { object: 'list', data };
}

/**
 * Bewertet, ob der Proxy BEDIENEN kann - nicht, ob er laeuft (T002336).
 *
 * Massgeblich sind die Backends mit `priority === 1`, also der lokale
 * Primaerpfad. Die naheliegende Regel "mindestens eines gesund" reicht
 * nachweislich nicht: am 2026-07-27 war llamacpp-gemma (:8091) drei Stunden
 * tot, waehrend deepseek (Cloud, priority 2) durchgehend antwortete. Nach
 * jener Regel waere alles gruen gewesen, obwohl die Factory ins Leere lief.
 * Ein Cloud-Fallback ist kein Ersatz fuer den lokalen Stack - er ist
 * langsamer, kostet Geld und schickt Daten aus dem Haus.
 *
 * `degraded` listet dagegen ALLE ungesunden Backends, auch die niedriger
 * priorisierten: ein weggebrochener Fallback soll sichtbar sein, ohne zu
 * blockieren.
 *
 * @param {() => import('./backends.mjs').Backend[]} getBackends
 * @returns {{ready:boolean, degraded:{name:string,priority:number,kind:string,baseUrl:string}[], checked:number}}
 */
export function evaluateReadiness(getBackends) {
  const backends = getBackends();
  // [T002628] Drainende Backends sind nicht degraded — sie sind absichtlich
  // zurueckgenommen, nicht gestoert. Der Fallback (deepseek/remote) kann
  // bedienen, also ist der Proxy ready, solange ein nicht-drainendes Backend
  // gesund ist oder ein Remote-Backend den Fallback stellt.
  const degraded = backends
    .filter((b) => {
      const h = health.get(b.name);
      return !h?.healthy && !h?.draining;
    })
    .map((b) => ({ name: b.name, priority: b.priority, kind: b.kind, baseUrl: b.baseUrl }));

  const primary = backends.filter((b) => b.priority === 1);
  // Ein Prio-1-Backend, das drained, ist NICHT unhealthy — es ist intentional
  // zurueckgenommen. Der Proxy kann ueber Prio-2+ bedienen.
  //
  // [P1-2] primary.some statt primary.every: die Prio-1-Backends teilen sich
  // exclusiveGroup "chat-gpu" — es laeuft immer nur eines (siehe loadouts.json).
  // primary.every wuerde verlangen, dass ALLE gleichzeitig gesund sind, was mit
  // exklusiver GPU-Belegung nie der Fall ist. primary.some prueft "mindestens
  // eines gesund", was fuer einen exklusiven Gruppenmodell die korrekte
  // Erwartung ist. Uralt-Szenario "Factory ins Leere" (2026-07-27) bleibt
  // abgesichert: primary.some + backends.some verhindern ready=true, wenn KEIN
  // Prio-1-Backend gesund ist und der Cloud-Fallback der einzige bleibt.
  const ready = primary.length > 0
    && primary.some((b) => {
      const h = health.get(b.name);
      return !!h?.healthy || !!h?.draining;
    })
    && backends.some((b) => {
      const h = health.get(b.name);
      return !!h?.healthy && !h?.draining;
    });

  return { ready, degraded, checked: backends.length };
}

export function getState(getBackends) {
  return {
    lastProbe: lastProbeAt,
    lock: lastLock,
    backends: getBackends().map((b) => {
      const h = health.get(b.name);
      return { name: b.name, kind: b.kind, baseUrl: b.baseUrl, priority: b.priority,
        healthy: !!h?.healthy, draining: !!h?.draining,
        models: h?.models || [], loaded: [...(h?.loaded || [])] };
    }),
  };
}

/** @param {{backends: {name:string,priority:number,healthy:boolean,draining?:boolean,models:string[],aliases?:Record<string,string>,modelAliases?:Record<string,string>,fixups?:string[],baseUrl?:string,kind?:string,apiKeyEnv?:string}[]}} seed */
export function _testSeed(seed) {
  health.clear();
  catalog.clear();
  lastLock = seed.lock || { held: false, drainingKinds: [] };
  for (const b of seed.backends) {
    health.set(b.name, { healthy: b.healthy, draining: !!b.draining, models: b.models,
      loaded: new Set(), backoffUntil: 0, lastProbe: Date.now() });
    for (const id of b.models) { if (!catalog.has(id)) catalog.set(id, []); catalog.get(id).push(b.name); }
  }
}
