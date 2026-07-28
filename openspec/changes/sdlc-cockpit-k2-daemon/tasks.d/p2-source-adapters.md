# Partial p2 — Source Adapters (Quell-Integration)

**Ticket:** T002461  
**Rolle:** `source-adapters`  
**Ziel-Dateien:** `.lavish/kit/daemon/sources/*`  
**Hängt ab von:** p1 (Daemon-Routing + lib/exec.ts)  
**Nicht zu modifizieren:** `routes/`, `lib/`, `server.ts` (p1), `adapter.js` (p3)

## Ziel

Die 8 Source-Module implementieren, die der Daemon aus den Routen aufruft. Jedes Modul wrapped
eine externe Datenquelle und liefert typisierte Datenstrukturen. Die Routen-Dateien aus p1 
importieren diese Module und ersetzen ihre Stub-Aufrufe durch echte Quell-Calls.

**Wichtig:** Die Routes aus p1 (`routes/cockpit.ts`, `routes/cluster.ts`, `routes/factory.ts`,
`routes/custom.ts`, `routes/stream.ts`) müssen ihre Stub-Implementierungen durch Importe der 
p2-Source-Module ersetzen. P2 muss also auch die Route-Dateien aus p1 **editieren** (Stubs → echte
Aufrufe). Die Datei-Signaturen und das Routing bleiben unverändert.

## Zu erstellende Dateien

### `.lavish/kit/daemon/sources/kubectl.ts`

Wrapper für `kubectl --context fleet`. Nutzt `exec()` aus `lib/exec.ts`.

```ts
import { exec } from '../lib/exec';

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  restarts: number;
  age: string;
  gpu?: string;
}

export interface ClusterWarning {
  pod: string;
  namespace: string;
  issue: string;
  severity: 'info' | 'warning' | 'critical';
}

type WarningsList = ClusterWarning[];

export async function getPods(namespace?: string): Promise<{ pods: PodInfo[] }> {
  const nsFlag = namespace ? `-n ${namespace}` : '-A';
  const result = await exec(
    `kubectl --context fleet get pods ${nsFlag} --no-headers -o custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount,AGE:.metadata.creationTimestamp`,
    10000
  );

  if (!result.ok) {
    throw new Error(`kubectl pods: ${result.error}`);
  }

  const pods: PodInfo[] = result.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        name: parts[0],
        namespace: parts[1],
        status: parts[2],
        restarts: parseInt(parts[3] || '0', 10),
        age: parts[4],
      };
    });

  return { pods };
}

export async function getWarnings(): Promise<WarningsList> {
  const warnings: ClusterWarning[] = [];

  try {
    // CrashLoopBackOff / Error pods
    const result = await exec(
      `kubectl --context fleet get pods -A --no-headers -o custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount`,
      10000
    );

    if (result.ok) {
      for (const line of result.stdout.split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        const name = parts[0];
        const ns = parts[1];
        const restarts = parseInt(parts[3] || '0', 10);

        if (restarts > 5) {
          warnings.push({ pod: name, namespace: ns, issue: `${restarts} restarts`, severity: 'warning' });
        }
        if (restarts > 20) {
          warnings.push({ pod: name, namespace: ns, issue: `${restarts} restarts`, severity: 'critical' });
        }
      }
    }

    // Check for NotReady / Error status pods
    const statusResult = await exec(
      `kubectl --context fleet get pods -A --field-selector=status.phase!=Running -o custom-columns=NAME:.metadata.name,NAMESPACE:.metadata.namespace,STATUS:.status.phase --no-headers 2>/dev/null`,
      10000
    );

    if (statusResult.ok) {
      for (const line of statusResult.stdout.split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        if (parts[2] === 'Pending' || parts[2] === 'Unknown') continue; // skip transient
        warnings.push({ pod: parts[0], namespace: parts[1], issue: `Status: ${parts[2]}`, severity: 'warning' });
      }
    }
  } catch {
    // Warnings are best-effort; errors are reported via the pods endpoint
  }

  return warnings;
}
```

### `.lavish/kit/daemon/sources/gh-axi.ts`

Wrapper für `gh-axi` CLI. Liefert PRs und CI-Runs.

```ts
import { exec } from '../lib/exec';

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  author: string;
  review: string;
}

export interface CIRun {
  run: number;
  workflow: string;
  status: string;
  started: string;
  branch: string;
}

export async function getPullRequests(): Promise<PullRequest[]> {
  const result = await exec('gh-axi pr list --json number,title,state,author,review --limit 10', 10000);

  if (!result.ok) {
    throw new Error(`gh-axi pr: ${result.error}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`gh-axi pr: invalid JSON: ${result.stdout.slice(0, 200)}`);
  }
}

export async function getCIRuns(): Promise<CIRun[]> {
  const result = await exec(
    'gh-axi run list --json name,status,startedAt,headBranch --limit 8',
    10000
  );

  if (!result.ok) {
    throw new Error(`gh-axi ci: ${result.error}`);
  }

  try {
    const raw = JSON.parse(result.stdout);
    return raw.map((r: any) => ({
      run: r.databaseId || r.id,
      workflow: r.name || r.workflowName,
      status: r.status || r.conclusion,
      started: r.startedAt || r.createdAt,
      branch: r.headBranch,
    }));
  } catch {
    throw new Error(`gh-axi ci: invalid JSON`);
  }
}
```

### `.lavish/kit/daemon/sources/git.ts`

Git-Status und Worktree-Liste.

```ts
import { exec } from '../lib/exec';

export interface WorktreeInfo {
  path: string;
  branch: string;
  hash: string;
}

export async function getWorktrees(): Promise<WorktreeInfo[]> {
  const result = await exec('git worktree list', 5000);

  if (!result.ok) {
    throw new Error(`git worktree: ${result.error}`);
  }

  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        path: parts[0],
        hash: parts[1],
        branch: parts[2] ? parts[2].replace(/[\[\]]/g, '') : 'detached',
      };
    });
}

export async function getGitStatus(): Promise<{ branch: string; dirty: boolean }> {
  const branchResult = await exec('git rev-parse --abbrev-ref HEAD', 5000);
  const statusResult = await exec('git status --porcelain', 5000);

  return {
    branch: branchResult.ok ? branchResult.stdout : 'unknown',
    dirty: statusResult.ok ? statusResult.stdout.length > 0 : false,
  };
}
```

### `.lavish/kit/daemon/sources/agent-lock.ts`

Parser für `agent-lock.sh list`.

```ts
import { exec } from '../lib/exec';

export interface AgentSession {
  sid: string;
  label: string;
  ticket: string;
  worktree: string;
  status: string;
  tool: string;
}

export async function getAgentSessions(): Promise<AgentSession[]> {
  const result = await exec('bash scripts/agent-lock.sh list', 5000);

  if (!result.ok) {
    throw new Error(`agent-lock: ${result.error}`);
  }

  // Parse tabular output: SCOPE ID TOOL SID STATE LABEL
  const lines = result.stdout.split('\n');
  const sessions: AgentSession[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;

    const [scope, id, tool, sid, state, ...labelParts] = parts;
    const label = labelParts.join(' ');

    // Only "ticket" scope entries
    if (scope !== 'ticket') continue;

    sessions.push({
      sid,
      label,
      ticket: id,
      worktree: '', // agent-lock doesn't expose worktree per-ticket; map later
      status: state === 'live' ? 'active' : state,
      tool,
    });
  }

  return sessions;
}
```

### `.lavish/kit/daemon/sources/ticket-mcp.ts`

Wrapper für ticket-mcp CLI.

```ts
import { exec } from '../lib/exec';

export interface TicketSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  epic: string | null;
}

export async function getTickets(): Promise<TicketSummary[]> {
  // ticket-mcp export-tickets gibt JSON
  const result = await exec(
    'bash scripts/ticket-mcp.sh export --status triage,planning,plan_staged,backlog,in_progress --limit 50',
    10000
  );

  if (!result.ok) {
    throw new Error(`ticket-mcp: ${result.error}`);
  }

  try {
    const tickets = JSON.parse(result.stdout);
    return tickets.map((t: any) => ({
      id: t.external_id || t.id,
      title: t.title,
      status: t.status,
      priority: t.priority || 'mittel',
      epic: t.epic || null,
    }));
  } catch {
    throw new Error(`ticket-mcp: invalid JSON`);
  }
}

export async function getTicketDetail(extId: string): Promise<TicketSummary | null> {
  const result = await exec(`bash scripts/ticket-mcp.sh get ${extId}`, 5000);

  if (!result.ok) {
    throw new Error(`ticket-mcp get: ${result.error}`);
  }

  try {
    const t = JSON.parse(result.stdout);
    return {
      id: t.external_id || t.id,
      title: t.title,
      status: t.status,
      priority: t.priority || 'mittel',
      epic: t.epic || null,
    };
  } catch {
    return null;
  }
}
```

### `.lavish/kit/daemon/sources/factory-mcp.ts`

Wrapper für factory-mcp CLI.

```ts
import { exec } from '../lib/exec';

export interface FactoryStatus {
  queue_depth: number;
  running: string | null;
  waiting: string[];
  last_tick: string | null;
}

export async function getFactoryStatus(): Promise<FactoryStatus> {
  const statusResult = await exec('bash scripts/factory-mcp.sh status', 5000);
  const queueResult = await exec('bash scripts/factory-mcp.sh queue', 5000);

  // Parse combined output
  let queueDepth = 0;
  let running: string | null = null;
  const waiting: string[] = [];

  if (queueResult.ok) {
    const lines = queueResult.stdout.split('\n');
    for (const line of lines) {
      if (line.includes('running')) {
        const match = line.match(/T\d{6}/);
        if (match) running = match[0];
      }
      if (line.includes('waiting') || line.includes('backlog')) {
        const matches = line.match(/T\d{6}/g);
        if (matches) waiting.push(...matches);
      }
    }
    queueDepth = lines.length - 1; // rough estimate
  }

  return {
    queue_depth: queueDepth || waiting.length,
    running,
    waiting: waiting.slice(0, 10),
    last_tick: statusResult.ok ? extractTimestamp(statusResult.stdout) : null,
  };
}

function extractTimestamp(output: string): string | null {
  const match = output.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  return match ? match[0] : null;
}

export async function getRecentActivity(limit: number = 10) {
  const result = await exec(`bash scripts/factory-mcp.sh recent --limit ${limit}`, 5000);
  
  if (!result.ok) {
    throw new Error(`factory-mcp recent: ${result.error}`);
  }

  return result.stdout;
}
```

### `.lavish/kit/daemon/sources/opencode-db.ts`

Readonly-Zugriff auf `~/.local/share/opencode/opencode.db` (SQLite). Extrahiert aktive Sessions,
Delegations und Laufzeitinformationen für das Agenten-Mitlesen.

```ts
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

export interface OpenCodeSession {
  sid: string;
  label: string;
  ticket_id: string | null;
  worktree: string | null;
  status: string;
  created_at: string;
  last_active: string;
}

const DB_PATH = `${process.env.HOME}/.local/share/opencode/opencode.db`;

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    if (!existsSync(DB_PATH)) {
      throw new Error(`opencode.db not found at ${DB_PATH}`);
    }
    db = new Database(DB_PATH, { readonly: true });
  }
  return db;
}

export async function getSessions(): Promise<OpenCodeSession[]> {
  try {
    const db = getDb();
    
    // Die Tabellenstruktur von opencode.db kann variieren.
    // Wir probieren mehrere mögliche Abfragen und nehmen die erste, die funktioniert.
    const queries = [
      `SELECT id as sid, label, ticket_id, worktree, status, created_at, updated_at as last_active FROM sessions ORDER BY created_at DESC LIMIT 20`,
      `SELECT sid, label, ticket_id, worktree, status, created_at, last_active FROM sessions ORDER BY created_at DESC LIMIT 20`,
    ];

    for (const query of queries) {
      try {
        const rows = db.prepare(query).all() as any[];
        return rows.map(r => ({
          sid: r.sid || r.id,
          label: r.label || 'unknown',
          ticket_id: r.ticket_id || null,
          worktree: r.worktree || null,
          status: r.status === 'active' ? 'active' : 'idle',
          created_at: r.created_at || '',
          last_active: r.last_active || r.created_at || '',
        }));
      } catch {
        // Nächste Query probieren
      }
    }

    return [];
  } catch (e: any) {
    throw new Error(`opencode.db: ${e.message}`);
  }
}

export async function getRecentActivity(): Promise<{ event: string; ts: string; details: string }[]> {
  try {
    const db = getDb();
    
    // Versuche activity/delegations/log-Tabellen zu lesen
    const queries = [
      `SELECT type as event, created_at as ts, description as details FROM activity ORDER BY created_at DESC LIMIT 50`,
      `SELECT event, ts, details FROM log ORDER BY ts DESC LIMIT 50`,
    ];

    for (const query of queries) {
      try {
        return db.prepare(query).all() as any[];
      } catch {
        continue;
      }
    }

    return [];
  } catch {
    return [];
  }
}

// Cleanup beim Prozess-Ende
process.on('exit', () => {
  if (db) {
    try { db.close(); } catch {}
  }
});
```

### `.lavish/kit/daemon/sources/model-health.ts`

Proper Health-Check für lokale Modell-Server — ersetzt den unzuverlässigen `no-cors`-Port-Check.

```ts
export interface ModelStatus {
  name: string;
  port: number;
  status: 'running' | 'degraded' | 'offline';
  vram_gb: number | null;
  slots_used: number | null;
  slots_total: number | null;
  model: string | null;
  error?: string;
}

// Hartkodierte Modell-Server (später aus Config)
const MODEL_SERVERS = [
  { name: 'gemma-4-12b', port: 8091 },
];

export async function checkModels(): Promise<ModelStatus[]> {
  const results = await Promise.all(
    MODEL_SERVERS.map(async ({ name, port }) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          return {
            name, port,
            status: 'degraded' as const,
            vram_gb: null,
            slots_used: null,
            slots_total: null,
            model: null,
            error: `Health endpoint returned ${res.status}`,
          };
        }

        const body = await res.json();
        return {
          name, port,
          status: 'running' as const,
          vram_gb: body.vram_used_gb ?? body.vram_gb ?? null,
          slots_used: body.slots_used ?? body.slot_used ?? null,
          slots_total: body.slots_total ?? body.slots ?? null,
          model: body.model ?? body.model_name ?? null,
        };
      } catch (e: any) {
        return {
          name, port,
          status: 'offline' as const,
          vram_gb: null,
          slots_used: null,
          slots_total: null,
          model: null,
          error: e.name === 'AbortError' ? 'Health check timeout (3s)' : e.message,
        };
      }
    })
  );

  return results;
}
```

## Routen-Editierungen (p1-Dateien → echte Quellen)

### `routes/cockpit.ts` → Stubs ersetzen

Die `fetchPortfolio()`-Funktion ersetzt den Stub-Array durch:

```ts
import { getTickets, getTicketDetail } from '../sources/ticket-mcp';
import { setCache } from '../lib/cache';

async function fetchPortfolio() {
  return getTickets();  // statt fixture-array
}
```

### `routes/cluster.ts` → Stubs ersetzen

```ts
import { getPods, getWarnings } from '../sources/kubectl';

export async function podsListHandler(c: Context) {
  const ns = c.req.query('namespace') || undefined;
  try {
    const data = await getPods(ns);
    const entry = setCache(`pods-${ns || 'all'}`, data, 30_000); // 30s
    return c.json({ ...data, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    const entry = setCache(`pods-${ns || 'all'}`, null as any, 30_000, e.message);
    return c.json({ error: e.message, fetchedAt: entry.fetchedAt, staleSince: entry.staleSince });
  }
}
```

### `routes/factory.ts` → Stubs ersetzen

```ts
import { getFactoryStatus } from '../sources/factory-mcp';

// Analog: Stub durch getFactoryStatus() ersetzen
```

### `routes/custom.ts` → Stubs ersetzen

```ts
import { getAgentSessions } from '../sources/agent-lock';
import { getSessions } from '../sources/opencode-db';
import { getCIRuns } from '../sources/gh-axi';
import { checkModels } from '../sources/model-health';

export async function agentsHandler(c: Context) {
  try {
    const [agents, sessions] = await Promise.all([
      getAgentSessions(),
      getSessions().catch(() => []),
    ]);
    // Merge agent-lock + opencode.db data
    const merged = agents.map(a => {
      const session = sessions.find(s => s.ticket_id === a.ticket);
      return { ...a, worktree: session?.worktree || a.worktree, last_active: session?.last_active };
    });
    const entry = setCache('agents', merged, 15_000);
    return c.json({ agents: merged, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function ciHandler(c: Context) {
  try {
    const runs = await getCIRuns();
    const entry = setCache('ci', runs, 120_000);
    return c.json({ runs, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function modelsHandler(c: Context) {
  try {
    const models = await checkModels();
    const entry = setCache('models', models, 30_000);
    return c.json({ models, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}
```

### `routes/stream.ts` → Stubs ersetzen (SSE-Datenquellen)

```ts
// In agentStreamHandler:
// STUB durch echten agent-lock.sh-Poll ersetzen:
const poller = setInterval(async () => {
  try {
    const agents = await getAgentSessions();
    const ev = agentBuffer.push('agent_update', {
      agents,
      fetchedAt: new Date().toISOString(),
    });
    writeSSEEvent(stream, ev);
  } catch (e: any) {
    // Error events are sent but don't break the stream
    stream.writeSSE({ event: 'error', data: JSON.stringify({ error: e.message }) });
  }
}, 15000);

// In factoryStreamHandler:
const poller = setInterval(async () => {
  try {
    const status = await getFactoryStatus();
    const ev = factoryBuffer.push('factory_tick', {
      ...status,
      fetchedAt: new Date().toISOString(),
    });
    writeSSEEvent(stream, ev);
  } catch (e: any) {
    stream.writeSSE({ event: 'error', data: JSON.stringify({ error: e.message }) });
  }
}, 60000);
```

## Abnahmekriterien

1. `npx tsx .lavish/kit/daemon/server.ts` startet und alle Endpoints antworten mit echten Daten
2. `curl http://127.0.0.1:49152/api/admin/cluster/pods-list` → Pods aus `kubectl` (nicht K1-Fixtures)
3. `curl http://127.0.0.1:49152/api/cockpit/agents` → Agent-Sessions aus `agent-lock.sh list`
4. `curl http://127.0.0.1:49152/api/cockpit/ci` → PRs und CI-Runs aus `gh-axi`
5. `curl http://127.0.0.1:49152/api/cockpit/models` → Modell-Server-Status via `/health`-Endpoint
6. `curl http://127.0.0.1:49152/api/cockpit/stream/agents` → SSE-Stream mit echten Agent-Events
7. **D13:** Bei `kubectl`-Ausfall → `error`-Feld statt leerer Liste
8. **D12:** Alle Antworten tragen `fetchedAt`

## Notizen

- **`better-sqlite3`** muss als Dependency installiert werden (in `.lavish/kit/daemon/package.json` oder Root)
- Die `ticket-mcp.sh export` und `factory-mcp.sh` Kommandos müssen existieren — prüfen ob es die gibt oder alternative Aufrufe verwenden
- `kubectl --context fleet` muss verfügbar sein (ist es laut Check)
- `gh-axi` muss verfügbar und authentifiziert sein
- Die `opencode.db`-Tabellenstruktur ist versionsabhängig — die Fallback-Queries in `opencode-db.ts` fangen das ab
