# Design K2 — Daten-Adapter & lokaler Daemon

> Bindende Vorgaben: `openspec/changes/sdlc-cockpit-design/design.md`, Entscheidungen E1, E12, E16, E17, E18
> und Design-Abschnitt 4 (Datenfluss und Fehlerverhalten).

## 1. Architektur

```
Browser                        Lokaler Daemon (Node.js)             Quellen
───────                        ─────────────────────────             ───────

.lavish/kit/adapter.js  ──GET──►  :49152/api/admin/cockpit/*  ──►  ticket-mcp
                        ──GET──►  :49152/api/admin/cluster/*  ──►  kubectl --context fleet
                        ──GET──►  :49152/api/cockpit/ci       ──►  gh-axi
                        ──GET──►  :49152/api/cockpit/agents   ──►  agent-lock.sh
                        ──GET──►  :49152/api/cockpit/models   ──►  localhost:8091/health
                        ──SSE──►  :49152/api/cockpit/stream/* ──►  opencode.db (SQLite)
                        ──POST─►  :49152/api/cockpit/*        ──►  Token → Audit (K4)
```

**Kernprinzip:** Der Daemon erfindet **kein eigenes API**, sondern spiegelt den `/api/admin/*`-Vertrag
(E1). Der spätere Admin-Umzug (K7) ist dann ein Wechsel der Base-URL, kein Rewrite.

### 1.1 Schichten

| Schicht | Datei | Aufgabe |
|---------|-------|---------|
| **Adapter (Browser)** | `.lavish/kit/adapter.js` | Ersetzt K1-Fixtures. HTTP-Client mit Polling, SSE, D10–D13 |
| **Daemon (Server)** | `.lavish/kit/daemon/` | Node.js HTTP-Server, `/api/*`-Routen, Quell-Integration |
| **Quellen** | extern | `kubectl`, `gh-axi`, `git`, `agent-lock.sh`, `ticket-mcp`, `factory-mcp`, `opencode.db` |

### 1.2 Start/Stop

```bash
# Start
cd /home/patrick/Bachelorprojekt
npx tsx .lavish/kit/daemon/server.ts &
# Token erscheint in /tmp/cockpit-daemon.token (0600)
# PID erscheint in /tmp/cockpit-daemon.pid

# Stop
kill $(cat /tmp/cockpit-daemon.pid)
```

## 2. Endpoint-Design

### 2.1 Status-Endpoints (GET, JSON)

Allen gemeinsam:
- `Content-Type: application/json`
- Jede Antwort enthält `fetchedAt: "2026-07-28T20:30:00Z"` (D12)
- Bei Quell-Fehler: `error: "kubectl: unable to connect to fleet cluster"` (D13, nie Null/Strich)
- Kein Caching: `Cache-Control: no-store`

| Methode | Endpoint | Quelle | Refresh-Intervall |
|---------|----------|--------|-------------------|
| GET | `/api/admin/cockpit/portfolio?brand=mentolder` | `ticket-mcp export_tickets` | 5 min |
| GET | `/api/admin/cockpit/feature?extId=T000123&brand=mentolder` | `ticket-mcp get_ticket` | 3 min |
| GET | `/api/admin/cluster/pods-list?namespace=workspace` | `kubectl get pods` | 30 s |
| GET | `/api/admin/cluster/warnings` | `kubectl`-Auswertung (Restarts, CrashLoop, NotReady) | 30 s |
| GET | `/api/admin/factory-control` | `factory-mcp factory_status` + `factory_queue` | 1 min |
| GET | `/api/cockpit/ci` | `gh-axi pr list` + Workflow-Runs | 2 min |
| GET | `/api/cockpit/agents` | `agent-lock.sh list` + `opencode.db` | 15 s |
| GET | `/api/cockpit/models` | `curl http://127.0.0.1:8091/health` (für jeden Modell-Server) | 30 s |

### 2.2 Stream-Endpoints (SSE)

| Endpoint | Quelle | Ereignisse |
|----------|--------|------------|
| `/api/cockpit/stream/agents` | `opencode.db` + `agent-lock.sh` (Poll) | `agent_started`, `agent_heartbeat`, `agent_idle`, `agent_done` |
| `/api/cockpit/stream/factory` | `factory-mcp factory_recent` (Poll) | `tick_started`, `tick_done`, `phase_event` |

**SSE-Format:**
```
event: agent_started
data: {"sid":"1941661","label":"opencode-flow-execute","ticket":"T002460","ts":"2026-07-28T20:13:00Z"}
id: 42

event: agent_heartbeat
data: {"sid":"1941661","ts":"2026-07-28T20:14:00Z"}
id: 43
```

**Lückenmarkierung bei Verbindungsabbruch (Tabelle 4.2):**
```
event: gap
data: {"from":"2026-07-28T20:14:05Z","to":"2026-07-28T20:14:30Z","reason":"client disconnected"}
id: 44
```

Der Daemon puffert die letzten 100 Event-IDs und liefert bei Reconnect (`Last-Event-ID`-Header)
die fehlenden Events nach — oder markiert die Lücke, wenn Events älter als der Puffer sind.

### 2.3 Schreib-Endpoints (POST, Token-geschützt → K4)

| Endpoint | Aktion | Audit |
|----------|--------|-------|
| `POST /api/cockpit/ticket-action` | Status-Änderung, Enqueue | `{"ts":"...","action":"ticket_action","target":"T000123","result":"ok"}` |
| `POST /api/cockpit/agent-action` | Kill, Requeue | `{"ts":"...","action":"agent_kill","target":"sid_1941661","result":"ok"}` |

**Token-Prüfung:** Jeder POST braucht `Authorization: Bearer <token>`. Token wird beim Start aus
`/tmp/cockpit-daemon.token` gelesen (vom Daemon mit `0600` geschrieben). Bei falschem Token: `401`.

**Audit-Log:** Jede Schreibaktion wird als JSON-Line in `.lavish/kit/daemon/audit.jsonl` geschrieben.
Die Audit-Datei ist append-only mit `fs.appendFileSync`.

## 3. Adapter (`.lavish/kit/adapter.js`)

K2 ersetzt die gesamte Fixture-Implementierung aus K1. Die **Signatur bleibt identisch** — Panels
rufen weiterhin `data.tickets()`, `data.agents()`, etc.

### 3.1 Architektur des Adapters

```js
const data = (() => {
  const BASE = 'http://127.0.0.1:49152';
  const brand = 'mentolder';
  const polls = new Map();  // refreshIntervalID → endpoint

  function poll(endpoint, refreshMs, onData) {
    // D10: Panel deklariert Rate
    // D11: Pausiert bei document.hidden (visibilitychange)
    // D12: fetchedAt wird durchgereicht
    // D13: error-Feld statt Null/Strich
  }

  function stream(endpoint, onEvent) {
    // SSE via EventSource
    // Lückenmarkierung bei Verbindungsabbruch
    // Reconnect mit Last-Event-ID
  }

  return {
    tickets: (opts)       => poll('/api/admin/cockpit/portfolio?brand=' + brand, opts?.refreshMs ?? 300000),
    agents: (opts)        => poll('/api/cockpit/agents',                        opts?.refreshMs ?? 15000),
    ci: (opts)            => poll('/api/cockpit/ci',                            opts?.refreshMs ?? 120000),
    cluster: (opts)       => poll('/api/admin/cluster/pods-list',               opts?.refreshMs ?? 30000),
    factory: (opts)       => poll('/api/admin/factory-control',                 opts?.refreshMs ?? 60000),
    models: (opts)        => poll('/api/cockpit/models',                        opts?.refreshMs ?? 30000),

    // Stream
    agentStream: (onEvent) => stream('/api/cockpit/stream/agents', onEvent),

    // Write (K4)
    ticketAction: (ticketId, action) => post('/api/cockpit/ticket-action', { ticketId, action }),
    agentAction: (sid, action)       => post('/api/cockpit/agent-action',   { sid, action }),

    // Lifecycle
    unsubscribe: (handle) => {
      clearInterval(polls.get(handle));
      polls.delete(handle);
    }
  };
})();
```

### 3.2 D10 — Refresh-Rate pro Panel

Panel deklariert seine Rate beim Aufruf:
```js
data.tickets({ refreshMs: 300000 });  // 5 min
data.cluster({ refreshMs: 30000 });   // 30 s
```

Der Adapter setzt `setInterval`. Default-Werte im Adapter, Panel kann überschreiben.

### 3.3 D11 — Kein Polling unsichtbarer Panels

```js
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Alle Intervalle pausieren (nicht clearen — wieder aufnehmen)
    pauseAllPolls();
  } else {
    // Intervalle fortsetzen, sofort einen Fetch machen
    resumeAllPolls();
  }
});
```

### 3.4 D12 — Aktualität immer sichtbar

Jede Antwort trägt `fetchedAt`. Der Adapter reicht es durch, das Panel zeigt es an:
```
Aktualisiert vor 12 s | vor 2 min | vor 15 min (veraltet)
```

### 3.5 D13 — Kein stiller Ersatzwert

Bei Netzwerk- oder Server-Fehler:
```json
{
  "error": "kubectl: connection refused (fleet cluster unreachable)",
  "fetchedAt": "2026-07-28T20:30:00Z"
}
```

Niemals: `null`, `[]`, `"–"`, oder Beispielwerte, die wie Messwerte aussehen.

## 4. Daemon-Implementierung (`.lavish/kit/daemon/`)

### 4.1 Verzeichnisstruktur

```
.lavish/kit/daemon/
  server.ts          Einstiegspunkt: HTTP-Server, Routing, Token-Generierung
  routes/
    cockpit.ts       /api/admin/cockpit/*  → ticket-mcp
    cluster.ts       /api/admin/cluster/*   → kubectl
    factory.ts       /api/admin/factory-control → factory-mcp
    custom.ts        /api/cockpit/agents, /ci, /models
    stream.ts        SSE-Endpoints
  sources/
    kubectl.ts       kubectl --context fleet Wrapper
    gh-axi.ts        gh-axi Wrapper
    git.ts           git Status, Worktree-Liste
    agent-lock.ts    agent-lock.sh list Parser
    ticket-mcp.ts    ticket-mcp CLI Wrapper
    factory-mcp.ts   factory-mcp CLI Wrapper
    opencode-db.ts   opencode.db SQLite Reader (readonly)
    model-health.ts  Port-Check via Health-Endpoint (nicht no-cors!)
  lib/
    token.ts         Token-Generierung, Prüfung, Audit-Schreiber
    exec.ts          child_process.exec Wrapper mit Timeout
    cache.ts         In-Memory Cache mit TTL
    sse.ts           SSE-Helfer (Event-Format, Lückenmarkierung, Puffer)
  audit.jsonl        Append-only Audit-Log (wächst mit jeder Schreibaktion)
```

### 4.2 Framework

**Hono** (leichtgewichtiger als Express, native TypeScript-Unterstützung, Edge-kompatibel):
```ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
app.get('/api/admin/cockpit/portfolio', portfolioHandler);
// ...
serve({ fetch: app.fetch, port: 49152 });
```

**Kein Build-Schritt:** Direktausführung mit `tsx` (wie `website/`). Kein `tsc`, kein `esbuild`.

### 4.3 Quell-Integration

#### kubectl
```ts
import { exec } from './exec';
const pods = await exec('kubectl --context fleet get pods -n workspace -o json');
const warnings = await exec('kubectl --context fleet get pods -A -o json | jq "[.items[] | select(.status.containerStatuses[]?.restartCount > 5)]"');
```

#### gh-axi
```ts
const prs = await exec('gh-axi pr list --json number,title,state,author,review');
const ciRuns = await exec('gh-axi run list --limit 8 --json name,status,startedAt,headBranch');
```

#### agent-lock.sh
```ts
const agents = await exec('bash scripts/agent-lock.sh list');
// Parsen: SCOPE ID TOOL SID STATE LABEL → strukturiertes JSON
```

#### ticket-mcp
```ts
const tickets = await exec('bash scripts/ticket-mcp.sh export --status triage,planning,plan_staged,backlog,in_progress --limit 50');
```

#### factory-mcp
```ts
const factoryStatus = await exec('bash scripts/factory-mcp.sh status');
const queue = await exec('bash scripts/factory-mcp.sh queue');
```

#### opencode.db (SQLite)
```ts
import Database from 'better-sqlite3';
const db = new Database('/home/patrick/.local/share/opencode/opencode.db', { readonly: true });

// Session-Tabelle auslesen (Struktur hängt von opencode-Version ab):
// Diese Abfrage wird beim Bauen der Routen explorativ ermittelt
const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 20').all();
```

#### Modell-Server-Health (Port-Check-Ersatz)
```ts
// Statt no-cors fetch: echter Health-Endpoint-Check
async function checkModelHealth(port: number): Promise<ModelStatus> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await res.json();
    return {
      port,
      status: res.ok ? 'running' : 'degraded',
      vram_gb: body.vram_used_gb ?? null,
      slots_used: body.slots_used ?? null,
      slots_total: body.slots_total ?? null,
      model: body.model ?? null,
    };
  } catch (e) {
    return { port, status: 'offline', error: `Health check failed: ${e.message}` };
  }
}
```

### 4.4 Token & Audit (E17)

#### Token-Generierung (beim Start)
```ts
import { randomBytes } from 'crypto';
const token = randomBytes(32).toString('hex');
fs.writeFileSync('/tmp/cockpit-daemon.token', token, { mode: 0o600 });
```

#### Token-Prüfung (Middleware)
```ts
app.use('/api/cockpit/*', async (c, next) => {
  if (c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'DELETE') {
    const auth = c.req.header('Authorization');
    if (auth !== `Bearer ${token}`) {
      return c.json({ error: 'Token required for write actions' }, 401);
    }
    // Audit
    fs.appendFileSync('audit.jsonl', JSON.stringify({
      ts: new Date().toISOString(),
      action: c.req.url,
      ip: '127.0.0.1',
    }) + '\n');
  }
  return next();
});
```

### 4.5 Fehlerverhalten nach Panel-Typ

| GET-Endpoint (Status) | Quell-Fehler | Antwort |
|-----------------------|-------------|---------|
| `/api/admin/cluster/pods-list` | `kubectl` timeout | `200` mit `error: "..."`, `staleSince: "..."`, letzter gültiger Daten-Payload wenn vorhanden |
| `/api/cockpit/models` | Port 8091 antwortet nicht | `200` mit `error: "..."`, `staleSince: "..."`, `status: "offline"` |

| SSE-Endpoint (Strom) | Verbindungsabbruch | Verhalten |
|-----------------------|-------------------|-----------|
| `/api/cockpit/stream/agents` | Client disconnected | Server puffert, bei Reconnect: Lückenmarkierung oder Replay |

**Canvas** ist in K2 nicht betroffen (Canvas-Panel arbeitet lokal und speichert bei K5).

## 5. Security (E17, WSL)

**Bedrohungsmodell:** WSL `networkingMode=mirrored` teilt den Netzstack mit Windows. Ein Dienst auf
`127.0.0.1` ist auch von Windows-Prozessen erreichbar — ein Browser auf Windows kann den Daemon
erreichen.

**Gegenmaßnahmen:**
1. **Token für Schreiben**: POST/PUT/DELETE brauchen `Authorization: Bearer <token>`. Token in
   `/tmp/cockpit-daemon.token` mit `0600` (nur Owner lesbar).
2. **Audit-Log**: Jede Schreibaktion wird aufgezeichnet — nachvollziehbar, was passiert ist.
3. **GET ohne Token**: Lesen ist bewusst frei erreichbar — soll auch von Windows-Browser nutzbar sein.
4. **Port-Bindung an 127.0.0.1** (nicht `0.0.0.0`): Trotz `mirrored`-Mode begrenzt das die
   Erreichbarkeit auf den lokalen Host (Windows-Stack included, aber kein externes Netzwerk).
5. **Kein HTTPS**: Lokaler Dienst, kein Zertifikat nötig. `http://127.0.0.1:49152` ist OK.

## 6. Tests

### 6.1 BATS-Strukturtests (`tests/spec/sdlc-cockpit/`)

| Datei | Prüft | Typ |
|-------|-------|-----|
| `adapter-contract.bats` | Alle 8 Methoden vorhanden, Signaturen stimmen | Positiv |
| `daemon-endpoints.bats` | Daemon antwortet auf alle GET-Endpoints | Positiv |
| `no-silent-fallback.bats` | D13: Kein Null/Strich/Beispielwert bei Fehler — **mit Positiv-Anker** (T002356-M1) | Negativ |
| `freshness-timestamp.bats` | D12: Jede Antwort enthält `fetchedAt` | Positiv |
| `daemon-token-mode.bats` | Token-Datei hat `0600`, POST ohne Token → 401 | Positiv |

### 6.2 Vitest-Unit-Tests (`tests/unit/`)

| Datei | Prüft |
|-------|-------|
| `cockpit-adapter.test.ts` | `poll()` setzt Intervall, `unsubscribe()` cleart es, `document.hidden` pausiert |
| `cockpit-daemon-cache.test.ts` | Cache mit TTL, `staleSince`-Berechnung |

## 7. Offene Punkte

| # | Punkt | Status |
|---|-------|--------|
| OF3 | opencode.db-Tabellenstruktur — explorativ beim Bauen ermitteln | Geklärt (B3) |
| OFx | `data.models()` — welche Modell-Server sind zu monitoren? Ports aus Config oder Hartkodierung? | Zu klären während der Implementierung |
