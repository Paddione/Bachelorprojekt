// adapter.js — Live data adapter (K2)
// brand='mentolder' hardcoded per E16
// Communicates with local daemon on http://127.0.0.1:49152
// Replaces K1 fixture implementation entirely.

const data = (() => {
  const BASE = 'http://127.0.0.1:49152';
  const brand = 'mentolder';

  // Poll registry: maps handle → { intervalId, paused, refreshMs }
  const polls = new Map();
  let nextHandle = 1;
  let visibilityPaused = false;

  // ---- D11: visibility-based pause ----
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      visibilityPaused = true;
      // Pause all polls (don't clear — resume with immediate fetch on return)
      for (const [handle, poll] of polls) {
        if (poll.intervalId) {
          clearInterval(poll.intervalId);
          poll.intervalId = null;
        }
      }
    } else {
      visibilityPaused = false;
      // Resume all polls with immediate fetch
      for (const [handle, poll] of polls) {
        poll.controller.fetchNow();
        if (!poll.intervalId) {
          poll.intervalId = setInterval(() => {
            if (!visibilityPaused) poll.controller.fetchNow();
          }, poll.refreshMs);
        }
      }
    }
  });

  // ---- Core fetch helper (D12, D13) ----
  async function fetchEndpoint(endpoint) {
    try {
      const res = await fetch(`${BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}_t=${Date.now()}`);
      if (!res.ok) {
        return { error: `HTTP ${res.status}: ${res.statusText}`, fetchedAt: new Date().toISOString() };
      }
      const data = await res.json();
      // D12: Ensure fetchedAt is present
      if (!data.fetchedAt) {
        data.fetchedAt = new Date().toISOString();
      }
      return data;
    } catch (e) {
      // D13: Never return null/empty array silently
      return { error: `Daemon unreachable: ${e.message}`, fetchedAt: new Date().toISOString() };
    }
  }

  // ---- Poll factory (D10, D11) ----
  function createPoll(endpoint, defaultRefreshMs) {
    let lastData = null;
    let lastFetchedAt = null;
    let error = null;
    let staleSince = null;
    let listeners = [];

    const controller = {
      fetchNow: async () => {
        try {
          const result = await fetchEndpoint(endpoint);
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
  function createStream(endpoint) {
    return function startStream(onEvent) {
      let eventSource = null;
      let reconnectTimer = null;
      let closed = false;

      function connect() {
        if (closed) return;

        eventSource = new EventSource(`${BASE}${endpoint}`);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onEvent({ type: event.type || 'message', data, ts: new Date().toISOString() });
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
              const data = JSON.parse(event.data);
              onEvent({ type: evt, data, ts: new Date().toISOString() });
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
    return createPoll(`/api/admin/cockpit/portfolio?brand=${brand}`, 300000)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function agents(opts) {
    return createPoll('/api/cockpit/agents', 15000)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function ci(opts) {
    return createPoll('/api/cockpit/ci', 120000)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function cluster(opts) {
    return createPoll('/api/admin/cluster/pods-list?namespace=workspace', 30000)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function factory(opts) {
    return createPoll('/api/admin/factory-control', 60000)(opts?.refreshMs);
  }

  /** @param {{ refreshMs?: number }} [opts] */
  function models(opts) {
    return createPoll('/api/cockpit/models', 30000)(opts?.refreshMs);
  }

  /** @param {function} onEvent */
  function agentStream(onEvent) {
    return createStream('/api/cockpit/stream/agents')(onEvent);
  }

  /** @param {function} onEvent */
  function factoryStream(onEvent) {
    return createStream('/api/cockpit/stream/factory')(onEvent);
  }

  // ---- Write methods (stubs until K4) ----
  async function ticketAction(ticketId, action) {
    const token = await getToken();
    if (!token) return { ok: false, error: 'No write token available' };
    try {
      const res = await fetch(`${BASE}/api/cockpit/ticket-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ticketId, action, brand }),
      });
      return res.json();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function agentAction(sid, action) {
    const token = await getToken();
    if (!token) return { ok: false, error: 'No write token available' };
    try {
      const res = await fetch(`${BASE}/api/cockpit/agent-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sid, action, brand }),
      });
      return res.json();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Token retrieval — T002505.
  //
  // Frueher holte diese Funktion den Token von `${BASE}/api/cockpit/token`.
  // Dieser Endpoint gab ihn unauthentifiziert heraus und machte damit die
  // 0600-Rechte der Token-Datei wertlos; er ist entfernt.
  //
  // Ein Browser hat keinen legitimen Weg an den Token: die Datei liegt unter
  // /tmp/cockpit-daemon.token und ist bewusst nur fuer den Nutzer lesbar.
  // Damit sind Schreibaktionen aus dem Browser deaktiviert — die zugehoerigen
  // Endpunkte sind ohnehin noch Stubs. Eine echte Auth (z. B. eine an einen
  // festen Origin gebundene Session, die der Daemon selbst ausliefert) gehoert
  // nach K4 und soll nicht durch einen offenen Token-Endpoint ersetzt werden.
  async function getToken() {
    return null;
  }

  return {
    tickets,
    agents,
    ci,
    cluster,
    factory,
    models,
    agentStream,
    factoryStream,
    ticketAction,
    agentAction,
    unsubscribe,
  };
})();

window.data = data;
