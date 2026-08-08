// adapter.js — Live data adapter (K2)
// brand='mentolder' hardcoded per E16
// Replaces K1 fixture implementation entirely.
//
// K4 (T002463): Per-Endpunkt-Host-Aufloesung statt Basis-Konstante (Auth-Schnitt).
// Ein globaler Umschalter ist unzulaessig — die Website bedient heute nur einen
// Teil der Endpunkte, ein Umschalten stellte die uebrigen auf 404.

const data = (() => {
  const DAEMON_BASE = 'http://127.0.0.1:49152';
  const brand = 'mentolder';

  // ---- Endpunkt-Karte: pro Endpunkt, welche Quelle ihn bedient ----
  // `website: true`  → der Endpunkt existiert auf der Website und wird im
  //                    Admin-Kontext von der eigenen Origin geladen.
  // `website: false` → Quelle ist (bis auf weiteres) der lokale Daemon.
  //                    `daemonOnly` kennzeichnet Endpunkte, die dauerhaft nur
  //                    daemon-gestuetzt sind (lesen lokalen Zustand).
  const ENDPOINT_MAP = {
    'portfolio':        { path: '/sdlc/api/cockpit/portfolio', website: true },
    'pods-list':        { path: '/sdlc/api/cluster/pods-list', website: true },
    'factory-control':  { path: '/sdlc/api/factory-control', website: true },
    'ticket-status':    { path: '/sdlc/api/cockpit/ticket-status', website: true },
    'audit':            { path: '/sdlc/api/cockpit/audit', website: true },
    'epics':            { path: '/api/cockpit/epics', website: false },
    'styles':           { path: '/api/cockpit/styles', website: false },
    'ci':               { path: '/api/cockpit/ci', website: false },
    'agents':           { path: '/api/cockpit/agents', website: false, daemonOnly: true },
    'models':           { path: '/api/cockpit/models', website: false, daemonOnly: true },
    'agents-stream':    { path: '/api/cockpit/stream/agents', website: false, daemonOnly: true },
    'factory-stream':   { path: '/api/cockpit/stream/factory', website: false, daemonOnly: true },
  };

  // Kontext wird EINMAL beim Laden bestimmt. Standalone = die Seite wird nicht
  // von der Admin-Flaeche ausgeliefert (file:// oder der Daemon-Port selbst).
  const isStandalone = typeof location !== 'undefined'
    && (location.protocol === 'file:' || Number(location.port) === 49152);
  const HOST = isStandalone ? DAEMON_BASE : '';
  const UNAVAILABLE_MSG = 'Quelle in diesem Kontext nicht verfügbar';

  // ---- Endpunkt-Aufloesung (K4) ----
  // Liefert { host, path, available }. `host` ist im Admin-Kontext die eigene
  // Origin (leerer Praefix), im Standalone-Kontext die Daemon-Basis. Ein
  // daemon-gestuetzter Endpunkt ist im Admin-Kontext nicht verfügbar.
  function resolveEndpoint(key) {
    const entry = ENDPOINT_MAP[key];
    if (!entry) return { host: HOST, path: '', available: false };
    const available = isStandalone || entry.website;
    return { host: HOST, path: entry.path, available };
  }

  // Poll registry: maps handle → { intervalId, paused, refreshMs }
  const polls = new Map();
  let nextHandle = 1;
  let visibilityPaused = false;

  // ---- D11: visibility-based pause ----
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        visibilityPaused = true;
        // Pause all polls (don't clear — resume with immediate fetch on return)
        for (const poll of polls.values()) {
          if (poll.intervalId) {
            clearInterval(poll.intervalId);
            poll.intervalId = null;
          }
        }
      } else {
        visibilityPaused = false;
        // Resume all polls with immediate fetch
        for (const poll of polls.values()) {
          poll.controller.fetchNow();
          if (!poll.intervalId) {
            poll.intervalId = setInterval(() => {
              if (!visibilityPaused) poll.controller.fetchNow();
            }, poll.refreshMs);
          }
        }
      }
    });
  }

  // ---- Core fetch helper (D12, D13) ----
  // Reuse from K2: hält D12/D13 bereits ein (fetchedAt immer gesetzt, Fehler
  // als error-Feld statt null). Bekommt lediglich den aufgelösten Host und
  // die Verfügbarkeitsprüfung vorangestellt.
  async function fetchEndpoint(key, opts = {}) {
    const resolved = resolveEndpoint(key);
    const pathSuffix = opts.path || '';
    if (!resolved.available) {
      // D13 im Admin-Kontext: ein daemon-only-Endpunkt kommt nicht still leer
      // zurueck, sondern benennt, dass die Quelle hier fehlt.
      return { error: UNAVAILABLE_MSG, fetchedAt: new Date().toISOString() };
    }
    const q = opts.query ? (opts.query.startsWith('?') ? opts.query : `?${opts.query}`) : '';
    const sep = q ? '&' : '?';
    const url = `${resolved.host}${resolved.path}${pathSuffix}${q}${sep}_t=${Date.now()}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return { error: `HTTP ${res.status}: ${res.statusText}`, fetchedAt: new Date().toISOString() };
      }
      const payload = await res.json();
      // D12: Ensure fetchedAt is present
      if (!payload.fetchedAt) {
        payload.fetchedAt = new Date().toISOString();
      }
      return payload;
    } catch (e) {
      // D13: Never return null/empty array silently
      return { error: `Quelle nicht erreichbar: ${e.message}`, fetchedAt: new Date().toISOString() };
    }
  }

  // ---- Poll factory (D10, D11) ----
  function createPoll(key, defaultRefreshMs, query = '') {
    let lastData = null;
    let lastFetchedAt = null;
    let error = null;
    let staleSince = null;
    let listeners = [];

    const controller = {
      fetchNow: async () => {
        try {
          const result = await fetchEndpoint(key, { query });
          lastFetchedAt = result.fetchedAt;

          if (result.error) {
            error = result.error;
            if (!staleSince) staleSince = lastFetchedAt;
            // D13: Keep last valid data, mark as stale
            if (lastData) {
              lastData = { ...lastData, error, staleSince, fetchedAt: lastFetchedAt };
            } else {
              lastData = { error, staleSince, fetchedAt: lastFetchedAt };
            }
          } else {
            error = null;
            staleSince = null;
            lastData = { ...result, fetchedAt: lastFetchedAt };
          }
        } catch (e) {
          error = `Poll failed: ${e.message}`;
          if (!staleSince) staleSince = new Date().toISOString();
        }

        // Notify listeners
        for (const fn of listeners) {
          try { fn(lastData); } catch {}
        }
      },

      subscribe: (fn) => {
        listeners.push(fn);
        if (lastData) fn(lastData);
        return () => {
          listeners = listeners.filter(l => l !== fn);
        };
      },

      getLastData: () => lastData,
    };

    return function startPoll(refreshMs) {
      const ms = refreshMs || defaultRefreshMs;
      const handle = nextHandle++;

      // Immediate first fetch
      controller.fetchNow();

      // Start interval (unless visibility is paused)
      let intervalId = null;
      if (!visibilityPaused) {
        intervalId = setInterval(() => {
          if (!visibilityPaused) controller.fetchNow();
        }, ms);
      }

      polls.set(handle, { intervalId, paused: visibilityPaused, refreshMs: ms, controller });

      // Return handle with last data + unsubscribe
      return {
        _handle: handle,
        get data() { return controller.getLastData(); },
        subscribe: controller.subscribe,
      };
    };
  }

  // ---- Unsubscribe ----
  function unsubscribe(handleObj) {
    if (!handleObj || !handleObj._handle) return;
    const poll = polls.get(handleObj._handle);
    if (poll) {
      if (poll.intervalId) clearInterval(poll.intervalId);
      polls.delete(handleObj._handle);
    }
  }

  // ---- SSE stream helper ----
  function createStream(key) {
    return function startStream(onEvent) {
      const resolved = resolveEndpoint(key);
      if (!resolved.available) {
        onEvent({ type: 'connection_error', data: { error: UNAVAILABLE_MSG }, ts: new Date().toISOString() });
        return () => {};
      }
      let eventSource = null;
      let reconnectTimer = null;
      let closed = false;

      function connect() {
        if (closed) return;

        eventSource = new EventSource(`${resolved.host}${resolved.path}`);

        eventSource.onmessage = (event) => {
          try {
            const d = JSON.parse(event.data);
            onEvent({ type: event.type || 'message', data: d, ts: new Date().toISOString() });
          } catch {
            onEvent({ type: 'parse_error', data: event.data, ts: new Date().toISOString() });
          }
        };

        // Named events
        const namedEvents = ['agent_update', 'agent_started', 'agent_heartbeat', 'agent_done',
          'factory_tick', 'gap', 'heartbeat', 'error'];
        for (const evt of namedEvents) {
          eventSource.addEventListener(evt, (event) => {
            try {
              const d = JSON.parse(event.data);
              onEvent({ type: evt, data: d, ts: new Date().toISOString() });
            } catch {
              onEvent({ type: evt, data: event.data, ts: new Date().toISOString() });
            }
          });
        }

        eventSource.onerror = () => {
          onEvent({ type: 'connection_error', data: {}, ts: new Date().toISOString() });
          eventSource.close();
          // Auto-reconnect after 5s
          if (!closed) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
      }

      connect();

      // Return close function
      return () => {
        closed = true;
        if (eventSource) eventSource.close();
        if (reconnectTimer) clearTimeout(reconnectTimer);
      };
    };
  }

  // ---- Public API (identical to K1 signatures) ----

  /** @param {{ refreshMs?: number }} [opts] */
  function tickets(opts) {
    return createPoll('portfolio', 300000, `brand=${brand}`)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function agents(opts) {
    return createPoll('agents', 15000)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function ci(opts) {
    return createPoll('ci', 120000)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function cluster(opts) {
    return createPoll('pods-list', 30000, 'namespace=workspace')(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function factory(opts) {
    return createPoll('factory-control', 60000)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function models(opts) {
    return createPoll('models', 30000)(opts?.refreshMs);
  }

  /**
   * K5 Epic-Canvas (T002464). Poll wie die uebrigen Listen-Endpunkte.
   * @param {{ refreshMs?: number }} [opts]
   */
  function epics(opts) {
    return createPoll('epics', 60000)(opts?.refreshMs);
  }

  /**
   * OF1-Vorpruefung vor einem Canvas-Export: hat jemand anders
   * openspec/changes/ seit `sinceIso` angefasst?
   *
   * Einmalabruf statt Poll — die Frage stellt sich nur im Moment des Exports.
   * Sie liegt hier im Adapter, damit Panel und canvas-store.js kein eigenes
   * fetch() brauchen (E1).
   *
   * @param {string} epicId
   * @param {string} sinceIso
   * @returns {Promise<{hasChanges: boolean, error?: string, reason?: string}>}
   */
  async function epicChangesSince(epicId, sinceIso) {
    const data = await fetchEndpoint('epics', {
      path: `/${encodeURIComponent(epicId)}/changes-since`,
      query: `ts=${encodeURIComponent(sinceIso)}`,
    });
    // Konservativ: wo die Antwort nichts Eindeutiges sagt, gilt "geaendert".
    // Der Nutzer wird dann gefragt, statt dass still ueberschrieben wird.
    if (data.error) return { hasChanges: true, error: data.error };
    return { hasChanges: data.hasChanges !== false, reason: data.reason };
  }

  /**
   * K9 Stil-Datenbank (T002468) — die Gestaltungsquelle für die Modelle.
   *
   * Einmalabruf statt Poll: die Sammlung ändert sich nur, wenn jemand einen
   * Eintrag beiträgt, nicht im Sekundentakt. Ein Poll hätte hier nichts zu tun.
   *
   * Der Zugriff liegt im Adapter, damit kein Panel selbst fetch() ruft (E1) —
   * die Kit-Seiten laufen von file://, ein relativer Pfad erreichte den Daemon
   * gar nicht.
   *
   * @returns {Promise<{entries?: Array, warnings?: string[], error?: string, fetchedAt: string}>}
   */
  async function styles() {
    // fetchEndpoint hält D12/D13 bereits ein: fetchedAt ist immer gesetzt, und
    // ein Fehler kommt als error-Feld zurück statt als null.
    return fetchEndpoint('styles');
  }

  /**
   * K6 Brain-Verweise (T002465) — Wiki-Seiten zu den Quellpfaden eines Panels.
   *
   * Einmalabruf statt Poll: die Verweise aendern sich nur bei einem Ingest-Lauf.
   *
   * @param {string[]} paths repo-relative Quellpfade
   * @returns {Promise<{links?: Array, uncovered?: string[], missing?: string[], error?: string, fetchedAt: string}>}
   */
  async function brainLinks(paths) {
    if (!paths || paths.length === 0) {
      return { links: [], uncovered: [], missing: [], fetchedAt: new Date().toISOString() };
    }
    return fetchEndpoint(`/sdlc/api/cockpit/brain?paths=${encodeURIComponent(paths.join(','))}`);
  }

  /** @param {function} onEvent */
  function agentStream(onEvent) {
    return createStream('agents-stream')(onEvent);
  }

  /** @param {function} onEvent */
  function factoryStream(onEvent) {
    return createStream('factory-stream')(onEvent);
  }

  // ---- Write methods (K4: Website-API statt Daemon-Stubs) ----
  //
  // K4 entfernt den browser-seitigen Zugriff auf die Daemon-Schreib-Stubs
  // (/api/cockpit/ticket-action, /api/cockpit/agent-action) samt des
  // Token-Abrufs. Der Daemon hat keinen unauthentifizierten Schreibpfad; die
  // Website-API setzt auf die Admin-Session (Cookie) statt auf ein
  // Browser-Token.
  //
  // Die einzige Klasse-A-Schreibaktion aus E5 ist das Setzen des Ticket-Status.
  //
  // @param {string} ticketId
  // @param {string} status  Zielstatus aus der TicketStatus-Union
  async function ticketAction(ticketId, status) {
    const resolved = resolveEndpoint('ticket-status');
    if (!resolved.available) return { ok: false, error: UNAVAILABLE_MSG };
    try {
      const res = await fetch(`${resolved.host}${resolved.path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status }),
      });
      return res.json();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * K4 Audit-Log (Task 8, Strom-Panel). Poll auf den neuen Lese-Endpunkt.
   * @param {{ refreshMs?: number }} [opts]
   */
  function audit(opts) {
    return createPoll('audit', 30000)(opts?.refreshMs);
  }

  return {
    tickets,
    agents,
    ci,
    cluster,
    factory,
    models,
    epics,
    epicChangesSince,
    styles,
    brainLinks,
    agentStream,
    factoryStream,
    ticketAction,
    audit,
    resolveEndpoint,
    unsubscribe,
  };
})();

window.data = data;
