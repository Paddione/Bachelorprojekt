// lib/sdlc/agents-overview.ts — Agents-Übersicht für das Leitstand-Deck (T016600).
//
// Sammelt den Stand aktiver Agents aus zwei Quellen und liefert ein
// UI-fertiges Payload:
//   1. `~/scripts/agents-overview.py --json` (dotfiles-Repo, SSOT für
//      lokale Backends, Prozesse, Sessions, Public-API-Erreichbarkeit).
//   2. `agent-lock.sh list` + Lock-JSONs (Claims mit Branch/Ticket-Angabe,
//      live/stale aus der Shell — hier NICHT neu implementiert).
//
// Alle Seiteneffekte laufen über injizierbare Deps, damit Route und Logik
// ohne Subprozesse unit-testbar bleiben. Fail-soft: jede fehlende Quelle
// landet als Fehlerzustand im Payload, nie als Exception aus collect().

export interface AgentsBackend {
  name: string;
  kind: string;
  url: string;
  status: string;
  models: string[];
  detail: string;
}

export interface AgentsSessionRecent {
  id: string;
  title: string;
  updated: number | null;
}

export interface AgentsSessions {
  backend: string;
  status: string;
  detail: string;
  count: number;
  recent: AgentsSessionRecent[];
}

export interface AgentsProcess {
  pid: number;
  etime: string;
  cmd: string;
}

export interface AgentsPublicApi {
  name: string;
  url: string;
  status: string;
  detail: string;
}

export interface AgentsClaim {
  scope: string;
  id: string;
  tool: string;
  ownerSid: string;
  state: 'live' | 'stale';
  label: string;
  branch: string;
  ticket: string;
  worktree: string;
  file: string;
}

export interface AgentsOverviewPayload {
  generatedAt: number | null;
  localBackends: AgentsBackend[];
  agentProcesses: AgentsProcess[];
  agentSessions: Record<string, AgentsSessions>;
  publicApi: AgentsPublicApi[];
  claims: AgentsClaim[];
  /** Fehler je Quelle (Schlüssel: 'agents-script' | 'locks'), sonst leer. */
  errors: Record<string, string>;
}

export interface AgentsOverviewDeps {
  /** Führt das dotfiles-Skript aus; stdout ist dessen --json-Ausgabe. */
  runAgentsScript: () => Promise<{ code: number | null; stdout: string; stderr: string }>;
  /** Roh-stdout von `agent-lock.sh list` (Tabelle oder Leer-Meldung). */
  listLocks: () => Promise<string>;
  /** Lock-JSON-Text je FILE-Spalte, null wenn nicht lesbar. */
  readLockFile: (file: string) => Promise<string | null>;
}

export const EMPTY_PAYLOAD: AgentsOverviewPayload = {
  generatedAt: null,
  localBackends: [],
  agentProcesses: [],
  agentSessions: {},
  publicApi: [],
  claims: [],
  errors: {},
};

interface LockRow {
  scope: string;
  id: string;
  tool: string;
  sid: string;
  state: 'live' | 'stale';
  label: string;
  file: string;
}

// Spalten aus cmd_list(): %-14s %-24s %-8s %-10s %-6s %-20s %s
// (SCOPE ID TOOL SID STATE LABEL FILE). Slices statt Split — LABEL kann
// Leerzeichen enthalten, FILE (sanitized) nie.
const COLS: [number, number][] = [[0, 14], [15, 39], [40, 48], [49, 59], [60, 66], [67, 87]];

/** Parst die `agent-lock.sh list`-Tabelle; Header/Leer-Meldung → []. */
export function parseLockTable(output: string): LockRow[] {
  const rows: LockRow[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim() || line.startsWith('SCOPE') || line.includes('keine aktiven Claims')) continue;
    const cells = COLS.map(([a, b]) => line.slice(a, b).trim());
    const file = line.slice(88).trim();
    if (!file) continue;
    const [scope, id, tool, sid, state, label] = cells;
    if (!scope || !id) continue;
    rows.push({ scope, id, tool, sid, state: state === 'stale' ? 'stale' : 'live', label, file });
  }
  return rows;
}

/** Reichert Tabellenzeilen mit Branch/Ticket aus den Lock-JSONs an. */
export async function buildClaims(
  rows: LockRow[],
  readLockFile: (file: string) => Promise<string | null>,
): Promise<AgentsClaim[]> {
  const claims: AgentsClaim[] = [];
  for (const row of rows) {
    let detail: Record<string, string> = {};
    try {
      const text = await readLockFile(row.file);
      if (text) detail = JSON.parse(text) as Record<string, string>;
    } catch {
      detail = {};
    }
    claims.push({
      scope: row.scope,
      id: row.id,
      tool: row.tool,
      ownerSid: row.sid,
      state: row.state,
      label: row.label,
      branch: typeof detail.branch === 'string' ? detail.branch : '',
      ticket: typeof detail.ticket === 'string' ? detail.ticket : '',
      worktree: typeof detail.worktree === 'string' ? detail.worktree : '',
      file: row.file,
    });
  }
  return claims;
}

/** Serverseitiger Kurzzeit-Cache: frische Sammelrunde nur nach TTL-Ablauf. */
export function createCachedCollect(ttlMs: number): {
  get: (deps: AgentsOverviewDeps, nowMs: number) => Promise<{ body: AgentsOverviewPayload; hit: boolean }>;
} {
  let cached: { at: number; body: AgentsOverviewPayload } | null = null;
  return {
    get: async (deps, nowMs) => {
      if (cached && nowMs - cached.at < ttlMs) return { body: cached.body, hit: true };
      const body = await collectAgentsOverview(deps);
      cached = { at: nowMs, body };
      return { body, hit: false };
    },
  };
}

/** Sucht das Repo-Root aufwärts ab startDir (scripts/agent-lock.sh als Anker). */
export function findRepoRoot(startDir: string, existsSync: (p: string) => boolean): string | null {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(`${dir}/scripts/agent-lock.sh`)) return dir;
    const parent = dir.replace(/\/[^/]+\/?$/, '');
    if (!parent || parent === dir) return null;
    dir = parent;
  }
  return null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Das dotfiles-Skript spricht snake_case; die UI camelCase — beides lesen. */
function pick<T>(body: Record<string, unknown>, camel: string, snake: string): T | undefined {
  const v = body[camel] ?? body[snake];
  return v as T | undefined;
}

/** Sammelt das Gesamt-Payload; wirft nie — Fehler landen in errors. */
export async function collectAgentsOverview(deps: AgentsOverviewDeps): Promise<AgentsOverviewPayload> {
  const payload: AgentsOverviewPayload = {
    ...EMPTY_PAYLOAD,
    agentSessions: {},
    errors: {},
  };
  try {
    const res = await deps.runAgentsScript();
    if (res.code !== 0) {
      payload.errors['agents-script'] = (res.stderr || `exit ${res.code}`).slice(0, 200);
    } else {
      const body = JSON.parse(res.stdout) as Record<string, unknown>;
      const generated = pick<number>(body, 'generatedAt', 'generated_at');
      payload.generatedAt = typeof generated === 'number' ? generated : null;
      const backends = pick<unknown>(body, 'localBackends', 'local_backends');
      payload.localBackends = Array.isArray(backends) ? (backends as AgentsBackend[]) : [];
      const procs = pick<unknown>(body, 'agentProcesses', 'agent_processes');
      payload.agentProcesses = Array.isArray(procs) ? (procs as AgentsProcess[]) : [];
      const sessions = asRecord(pick<unknown>(body, 'agentSessions', 'agent_sessions') ?? {});
      for (const [k, v] of Object.entries(sessions)) {
        const s = asRecord(v);
        payload.agentSessions[k] = {
          backend: asString(s.backend) || k,
          status: asString(s.status),
          detail: asString(s.detail),
          count: typeof s.count === 'number' ? s.count : 0,
          recent: Array.isArray(s.recent)
            ? (s.recent as Record<string, unknown>[]).slice(0, 5).map((r) => ({
                id: asString(asRecord(r).id),
                title: asString(asRecord(r).title),
                updated: typeof asRecord(r).updated === 'number' ? (asRecord(r).updated as number) : null,
              }))
            : [],
        };
      }
      const pub = pick<unknown>(body, 'publicApi', 'public_api');
      payload.publicApi = Array.isArray(pub) ? (pub as AgentsPublicApi[]) : [];
    }
  } catch (e) {
    payload.errors['agents-script'] = e instanceof Error ? e.message.slice(0, 200) : 'script failed';
  }
  try {
    const table = await deps.listLocks();
    payload.claims = await buildClaims(parseLockTable(table), deps.readLockFile);
  } catch (e) {
    payload.errors['locks'] = e instanceof Error ? e.message.slice(0, 200) : 'locks failed';
  }
  return payload;
}
