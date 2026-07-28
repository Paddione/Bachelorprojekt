# Partial p1 — Daemon Core (HTTP-Server, Routing, Token, Lib)

**Ticket:** T002461  
**Rolle:** `daemon-core`  
**Ziel-Dateien:** `.lavish/kit/daemon/server.ts`, `routes/*`, `lib/*`  
**Quellen:** `sources/` (nur Schnittstellen — keine Implementierung)  
**Abhängigkeiten:** K1 (T002460) — `.lavish/kit/`-Verzeichnis muss existieren

## Ziel

Den Node.js/TypeScript HTTP-Daemon mit Hono-Routing, Token-Generierung und Hilfsbibliotheken
aufbauen. Die Source-Adapter werden nur als Schnittstelle importiert (leere Stubs in p1, gefüllt
in p2). Die SSE-Logik (`lib/sse.ts`) wird implementiert, der Lückenmarkierungs-Puffer aufgesetzt.

## Zu erstellende Dateien

### `.lavish/kit/daemon/server.ts`
Einstiegspunkt. Hono-App mit allen Routen, CORS-Header, Token-Generierung, Audit-Middleware.
Port aus `COCKPIT_DAEMON_PORT` oder Default `49152`. Token-Datei nach `/tmp/cockpit-daemon.token`
schreiben mit `0o600`. PID nach `/tmp/cockpit-daemon.pid`.

```ts
// server.ts — SDLC Cockpit Daemon (K2)
// Start: npx tsx .lavish/kit/daemon/server.ts
// Stop:  kill $(cat /tmp/cockpit-daemon.pid)

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { generateToken, writeTokenFile } from './lib/token';
import { auditMiddleware } from './lib/token';
import { portfolioHandler, featureHandler } from './routes/cockpit';
import { podsListHandler, warningsHandler } from './routes/cluster';
import { factoryStatusHandler } from './routes/factory';
import { agentsHandler, ciHandler, modelsHandler } from './routes/custom';
import { agentStreamHandler, factoryStreamHandler } from './routes/stream';

const PORT = parseInt(process.env.COCKPIT_DAEMON_PORT || '49152', 10);
const token = generateToken();

// Write token file with tight permissions BEFORE starting server
writeTokenFile('/tmp/cockpit-daemon.token', token);

// Write PID file
const fs = require('fs');
fs.writeFileSync('/tmp/cockpit-daemon.pid', String(process.pid));

const app = new Hono();

// CORS: allow the file:// origin of lavish pages and localhost
app.use('*', cors({
  origin: ['null', 'http://localhost:*', 'http://127.0.0.1:*'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Authorization', 'Content-Type'],
}));

// Audit middleware for write endpoints
app.use('/api/cockpit/ticket-action', auditMiddleware(token));
app.use('/api/cockpit/agent-action', auditMiddleware(token));

// ----- Routes -----

// Admin Cockpit (mirrors website/src/pages/api/admin/cockpit/)
app.get('/api/admin/cockpit/portfolio', portfolioHandler);
app.get('/api/admin/cockpit/feature', featureHandler);

// Admin Cluster (mirrors website/src/pages/api/admin/cluster/)
app.get('/api/admin/cluster/pods-list', podsListHandler);
app.get('/api/admin/cluster/warnings', warningsHandler);

// Admin Factory
app.get('/api/admin/factory-control', factoryStatusHandler);

// Custom Cockpit Endpoints (new)
app.get('/api/cockpit/agents', agentsHandler);
app.get('/api/cockpit/ci', ciHandler);
app.get('/api/cockpit/models', modelsHandler);

// SSE Streams
app.get('/api/cockpit/stream/agents', agentStreamHandler);
app.get('/api/cockpit/stream/factory', factoryStreamHandler);

// Write stubs (token-protected, real implementation in K4)
app.post('/api/cockpit/ticket-action', (c) => c.json({ ok: true, message: 'Write actions in K4' }));
app.post('/api/cockpit/agent-action', (c) => c.json({ ok: true, message: 'Write actions in K4' }));

// Health
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

console.log(`[cockpit-daemon] listening on http://127.0.0.1:${PORT}`);
console.log(`[cockpit-daemon] token at /tmp/cockpit-daemon.token (0600)`);
console.log(`[cockpit-daemon] pid ${process.pid}`);

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' });
```

### `.lavish/kit/daemon/lib/token.ts`
Token-Generierung, Datei-Schreiben, Audit-Middleware.

```ts
import { randomBytes } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function writeTokenFile(path: string, token: string): void {
  writeFileSync(path, token, { mode: 0o600 });
}

export function auditMiddleware(token: string) {
  return async (c: any, next: any) => {
    if (c.req.method === 'GET') return next();
    
    const auth = c.req.header('Authorization');
    if (auth !== `Bearer ${token}`) {
      return c.json({ error: 'Token required for write actions' }, 401);
    }
    
    // Audit log
    appendFileSync(
      '.lavish/kit/daemon/audit.jsonl',
      JSON.stringify({
        ts: new Date().toISOString(),
        action: c.req.url,
        method: c.req.method,
        ip: '127.0.0.1',
      }) + '\n'
    );
    
    return next();
  };
}
```

### `.lavish/kit/daemon/lib/exec.ts`
`child_process.exec` Wrapper mit Timeout und Fehlerbehandlung.

```ts
import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(cpExec);

export interface ExecResult {
  stdout: string;
  stderr: string;
  ok: boolean;
  error?: string;
}

export async function exec(command: string, timeoutMs: number = 10000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      cwd: '/home/patrick/Bachelorprojekt',
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), ok: true };
  } catch (err: any) {
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || '',
      ok: false,
      error: err.killed ? `timeout after ${timeoutMs}ms` : (err.message || 'command failed'),
    };
  }
}
```

### `.lavish/kit/daemon/lib/cache.ts`
Einfacher In-Memory Cache mit TTL. Wird von den Routen genutzt, um CLI-Aufrufe nicht bei jedem
Poll zu wiederholen.

```ts
interface CacheEntry<T> {
  data: T;
  fetchedAt: string;       // ISO 8601
  expiresAt: number;       // Date.now() + ttl
  error?: string;          // set when last fetch failed
  staleSince?: string;     // set when first fetch failure occurred (D12)
}

const store = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string, ttlMs: number, fetchFn: () => Promise<T>): CacheEntry<T> {
  const now = Date.now();
  const entry = store.get(key);
  
  if (entry && entry.expiresAt > now) {
    return entry;  // Fresh
  }
  
  // Need to refresh — call fetchFn synchronously is impossible,
  // caller must handle async refresh
  return entry || { data: null as any, fetchedAt: new Date(0).toISOString(), expiresAt: 0 };
}

export function setCache<T>(key: string, data: T, ttlMs: number, error?: string): CacheEntry<T> {
  const now = new Date();
  const prev = store.get(key);
  
  const entry: CacheEntry<T> = {
    data: error ? (prev?.data ?? data) : data,   // keep stale data on error
    fetchedAt: now.toISOString(),
    expiresAt: Date.now() + ttlMs,
    error,
    staleSince: error
      ? (prev?.staleSince || now.toISOString())
      : undefined,
  };
  
  store.set(key, entry);
  return entry;
}
```

### `.lavish/kit/daemon/lib/sse.ts`
SSE-Helfer für Event-Formatierung, Lückenmarkierung und Event-Puffer (100 Events).

```ts
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

interface SSEEvent {
  id: number;
  event: string;
  data: Record<string, unknown>;
  ts: string;
}

// Circular buffer for last 100 events — enables replay after reconnect
class EventBuffer {
  private events: SSEEvent[] = [];
  private nextId = 1;
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  push(event: string, data: Record<string, unknown>): SSEEvent {
    const ev: SSEEvent = {
      id: this.nextId++,
      event,
      data,
      ts: new Date().toISOString(),
    };
    
    if (this.events.length >= this.maxSize) {
      this.events.shift();
    }
    this.events.push(ev);
    return ev;
  }

  getSince(lastEventId: number): { events: SSEEvent[]; gap: boolean } {
    const idx = this.events.findIndex(e => e.id > lastEventId);
    if (idx === -1) return { events: [], gap: false };
    
    const gap = this.events[idx].id > lastEventId + 1;
    return { events: this.events.slice(idx), gap };
  }

  oldestId(): number {
    return this.events[0]?.id ?? this.nextId;
  }
}

// Write a single SSE event to the stream
function writeSSEEvent(stream: any, ev: SSEEvent): void {
  stream.writeSSE({
    id: String(ev.id),
    event: ev.event,
    data: JSON.stringify(ev.data),
  });
}

// Write a gap marker event
function writeGapEvent(stream: any, fromId: number, toId: number): void {
  stream.writeSSE({
    event: 'gap',
    data: JSON.stringify({
      from_id: fromId,
      to_id: toId,
      message: `Events ${fromId}–${toId} missed during disconnect`,
    }),
  });
}

export { EventBuffer, writeSSEEvent, writeGapEvent };
export type { SSEEvent };
```

### `.lavish/kit/daemon/routes/cockpit.ts`
GET-Handler für `/api/admin/cockpit/*`. Wrappen `ticket-mcp` (p2-Implementierung). In p1: leere
Stubs, die `{ error: "source not yet implemented" }` + fixture-Daten zurückgeben (damit der
Daemon startet und GET-Endpoints beantwortet).

```ts
import type { Context } from 'hono';
import { getCached, setCache } from '../lib/cache';

// STUB: In p2 durch echten ticket-mcp-Call ersetzen
async function fetchPortfolio() {
  // Return K1-level fixtures so the adapter.js contract tests pass
  return [
    { id: 'T002460', title: 'K1: Lavish Design-Kit', status: 'in_progress', priority: 'hoch', epic: 'T002458' },
    { id: 'T002461', title: 'K2: Daten-Adapter', status: 'planning', priority: 'hoch', epic: 'T002458' },
  ];
}

export async function portfolioHandler(c: Context) {
  try {
    const data = await fetchPortfolio();
    const entry = setCache('portfolio', data, 300_000); // 5 min
    return c.json({ ...data, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    const entry = setCache('portfolio', null as any, 300_000, e.message);
    return c.json({ error: e.message, fetchedAt: entry.fetchedAt, staleSince: entry.staleSince });
  }
}

export async function featureHandler(c: Context) {
  const extId = c.req.query('extId') || '';
  const brand = c.req.query('brand') || 'mentolder';
  
  try {
    // STUB: In p2 durch ticket-mcp get_ticket ersetzen
    return c.json({
      id: extId,
      title: `Ticket ${extId}`,
      status: 'triage',
      brand,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
```

### `.lavish/kit/daemon/routes/cluster.ts`
GET-Handler für `/api/admin/cluster/*`. In p1: Stubs.

### `.lavish/kit/daemon/routes/factory.ts`
GET-Handler für `/api/admin/factory-control`. In p1: Stubs.

### `.lavish/kit/daemon/routes/custom.ts`
GET-Handler für `/api/cockpit/agents`, `/ci`, `/models`. In p1: Stubs.

### `.lavish/kit/daemon/routes/stream.ts`
SSE-Handler. Volle Implementierung des SSE-Mechanismus mit `EventBuffer` und Lückenmarkierung.
Die eigentlichen Daten kommen aus `sources/` (p2), aber der SSE-Mechanismus ist in p1 vollständig.

```ts
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventBuffer, writeSSEEvent, writeGapEvent } from '../lib/sse';

const agentBuffer = new EventBuffer(100);
const factoryBuffer = new EventBuffer(100);

export function agentStreamHandler(c: Context) {
  const lastEventId = parseInt(c.req.header('Last-Event-ID') || '0', 10);
  
  return streamSSE(c, async (stream) => {
    // Replay missed events or mark gap
    const { events, gap } = agentBuffer.getSince(lastEventId);
    
    if (gap) {
      writeGapEvent(stream, lastEventId, events[0]?.id || lastEventId);
    }
    
    for (const ev of events) {
      writeSSEEvent(stream, ev);
    }
    
    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ ts: new Date().toISOString() }) });
    }, 30000);
    
    // Poll agent-lock.sh every 15s (actual data source in p2)
    const poller = setInterval(async () => {
      // STUB: In p2 durch echten agent-lock.sh-Call ersetzen
      const ev = agentBuffer.push('agent_update', {
        agents: [{ sid: 'stub', label: 'p2-implementation needed', status: 'stub' }],
        fetchedAt: new Date().toISOString(),
      });
      writeSSEEvent(stream, ev);
    }, 15000);
    
    stream.onAbort(() => {
      clearInterval(heartbeat);
      clearInterval(poller);
    });
    
    // Keep stream alive
    await new Promise(() => {}); // never resolves
  });
}

export function factoryStreamHandler(c: Context) {
  const lastEventId = parseInt(c.req.header('Last-Event-ID') || '0', 10);
  
  return streamSSE(c, async (stream) => {
    const { events, gap } = factoryBuffer.getSince(lastEventId);
    if (gap) writeGapEvent(stream, lastEventId, events[0]?.id || lastEventId);
    for (const ev of events) writeSSEEvent(stream, ev);
    
    const poller = setInterval(async () => {
      // STUB: In p2 durch echten factory-mcp fetch ersetzen
      const ev = factoryBuffer.push('factory_tick', {
        last_tick: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
      });
      writeSSEEvent(stream, ev);
    }, 60000);
    
    stream.onAbort(() => clearInterval(poller));
    await new Promise(() => {});
  });
}
```

## Abnahmekriterien

1. `npx tsx .lavish/kit/daemon/server.ts` startet ohne Fehler
2. `curl http://127.0.0.1:49152/health` → `{"status":"ok","uptime":...}`
3. `curl http://127.0.0.1:49152/api/admin/cockpit/portfolio?brand=mentolder` → JSON mit `fetchedAt`
4. `stat /tmp/cockpit-daemon.token` → `0600`
5. `curl -X POST http://127.0.0.1:49152/api/cockpit/ticket-action` → `401`
6. `curl http://127.0.0.1:49152/api/cockpit/stream/agents` → SSE-Stream mit `heartbeat`-Events

## Notizen

- **Keine echten Daten in p1** — alle Source-Aufrufe sind Stubs. P2 füllt sie.
- `hono` und `@hono/node-server` müssen als Dependencies installiert werden (Root-`package.json` oder
  eigenes `package.json` in `.lavish/kit/daemon/`).
- Der Daemon läuft im Repo-Root (`cwd: /home/patrick/Bachelorprojekt`), weil `kubectl`, `gh-axi`
  und `agent-lock.sh` dort erwartet werden.
