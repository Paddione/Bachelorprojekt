---
title: Factory & Dev-Flow Floor Overhaul
ticket_id: T000581
status: active
domains: [website, db]
---

# Factory & Dev-Flow Floor Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `dev-flow-execute` runs visible on the `/dev-status` Factory Floor — devflow tickets render in the shared Hall with a blue outline (vs. gold for Factory), carry a live GitHub CI-status badge, and the floor updates in real time via SSE instead of polling.

**Architecture:** The DAL (`factory-floor.ts`) widens the Hall query so a ticket qualifies either via `pipeline_slot` (Factory) OR via the existence of a `driver='devflow'` phase-event; it also surfaces `driver`, a server-parsed `prNumber`, and a GitHub-API-derived `ciStatus`. A new SSE endpoint pushes a lightweight "phase changed" signal that the Svelte client uses to re-fetch the existing JSON API. `dev-flow-execute` (skill markdown) and `pipeline.js` are enriched with full phase events and `--detail` strings. No DB-schema change.

**Tech Stack:** Astro API routes (TypeScript), Svelte 5 (runes), Postgres (pg + pg-mem for tests), Vitest, GitHub REST API, Server-Sent Events.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `website/src/lib/factory-floor.ts` | `getHall()` query widening + `HallItem` fields (`driver`, `prNumber`, `ciStatus`); pure PR-number parse helper |
| `website/src/lib/github-ci.ts` (NEW) | GitHub CI-status fetch + aggregation + 60s in-memory cache; pure aggregation helper for testing |
| `website/src/pages/api/factory-floor.ts` | After `getFloor()`, enrich devflow Hall items in `deploy` phase with `ciStatus` from `github-ci.ts` |
| `website/src/pages/api/factory-floor/stream.ts` (NEW) | SSE endpoint: polls `MAX(at)` every 5s, emits `phase` on change + `heartbeat` every 30s |
| `website/src/components/FactoryFloor.svelte` | SSE client (replaces `setInterval`), devflow blue chip + CI badge |
| `.claude/skills/dev-flow-execute/SKILL.md` | 8 phase events with `--detail` strings (best-effort `|| true`) |
| `scripts/factory/pipeline.js` | `--detail` strings on existing `phaseEvent(...)` calls |
| `website/src/lib/factory-floor.test.ts` | New unit tests: widened Hall query, PR parse, CI aggregation |

---

## Task 1: Widen the Hall query + extend `HallItem` (DAL)

**Files:**
- Modify: `website/src/lib/factory-floor.ts` (`HallItem` interface ~line 24, `getHall()` ~line 118, add `parsePrNumber` helper)
- Test: `website/src/lib/factory-floor.test.ts`

The Hall must include devflow tickets that have **no** `pipeline_slot` but **do** have at least one `driver='devflow'` phase event. The slot-counting in `getControl()` stays untouched (capacity must not be inflated by devflow tickets).

- [ ] **Step 1: Add fixture rows for a devflow ticket to the test mock**

In `website/src/lib/factory-floor.test.ts`, inside the `vi.mock('pg', ...)` seed block, add one slot-less devflow ticket and its events. Append to the existing `INSERT INTO tickets.tickets VALUES` list (before the trailing `;`):

```sql
      -- devflow ticket: NO pipeline_slot, but has driver='devflow' phase events
      ,('dv1','T000582','feature','Devflow feature','hoch','in_progress',NULL,0,NULL, now(), now())
```

And append to the existing `INSERT INTO tickets.factory_phase_events (...) VALUES` list (before its trailing `;`):

```sql
      ,('dv1','implement','done',NULL,'devflow', now() - INTERVAL '4 min')
      ,('dv1','deploy','entered','PR #1512 · CI watch','devflow', now() - INTERVAL '1 min')
```

- [ ] **Step 2: Write the failing test for the widened Hall**

Add inside `describe('factory-floor DAL', ...)`:

```typescript
  it('getHall includes slot-less devflow tickets and tags driver + prNumber', async () => {
    const hall = await getHall();
    const byId = Object.fromEntries(hall.map((h) => [h.extId, h]));
    // Factory ticket keeps driver=factory, no prNumber from its detail
    expect(byId['T000459'].driver).toBe('factory');
    // devflow ticket present despite NULL pipeline_slot
    expect(byId['T000582']).toBeDefined();
    expect(byId['T000582'].driver).toBe('devflow');
    expect(byId['T000582'].phase).toBe('deploy');
    expect(byId['T000582'].prNumber).toBe(1512);
    // ciStatus is null until the API enriches it
    expect(byId['T000582'].ciStatus).toBeNull();
  });

  it('getControl does NOT count slot-less devflow tickets toward slots', async () => {
    const c = await getControl(3);
    expect(c.slotsUsed).toBe(2); // h1 + b1 only; dv1 (no slot) excluded
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t "devflow"`
Expected: FAIL — `T000582` is `undefined` (not returned by `getHall()`), and `driver`/`prNumber`/`ciStatus` are not on `HallItem`.

- [ ] **Step 4: Extend the `HallItem` interface**

In `website/src/lib/factory-floor.ts`, replace the `HallItem` interface (currently ending `... slot: number | null; }`) with:

```typescript
export interface HallItem {
  extId: string; title: string; priority: string;
  phase: Phase | null; phaseState: PhaseState | null; phaseSince: string | null;
  retryCount: number; blockReason: string | null; slot: number | null;
  driver: 'factory' | 'devflow' | null;   // NEU — vom neuesten Phase-Event
  prNumber: number | null;                 // NEU — aus deploy-detail geparst
  ciStatus: 'success' | 'pending' | 'failure' | null;  // NEU — vom API befüllt
}
```

- [ ] **Step 5: Add the `parsePrNumber` helper**

In `website/src/lib/factory-floor.ts`, near `parsePlanRef` (~line 205), add an exported pure helper:

```typescript
/** Extract a PR number from a phase-event detail string ("PR #1512 · …"); null on miss. */
export function parsePrNumber(detail: string | null): number | null {
  if (!detail) return null;
  const m = /PR #(\d+)/.exec(detail);
  return m ? parseInt(m[1], 10) : null;
}
```

- [ ] **Step 6: Widen `getHall()` and map the new fields**

In `website/src/lib/factory-floor.ts`, replace the body of `getHall()` (the `pool.query(...)` template + the `.map(...)`):

```typescript
export async function getHall(): Promise<HallItem[]> {
  // latest phase event per ticket via DISTINCT ON, then LEFT JOIN. A ticket
  // qualifies for the Hall if it holds a pipeline_slot (Factory) OR if it has
  // at least one driver='devflow' phase event (dev-flow-execute run, no slot).
  const r = await pool.query(
    `SELECT t.external_id, t.title, t.priority, t.pipeline_slot, t.retry_count,
            e.phase, e.state, e.detail, e.driver, e.at
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (ticket_id) ticket_id, phase, state, detail, driver, at
           FROM tickets.factory_phase_events
          ORDER BY ticket_id, at DESC
       ) e ON e.ticket_id = t.id
      WHERE t.status IN ('in_progress','in_review')
        AND (
          t.pipeline_slot IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM tickets.factory_phase_events x
             WHERE x.ticket_id = t.id AND x.driver = 'devflow'
          )
        )
      ORDER BY t.pipeline_slot NULLS LAST, t.external_id`,
  );
  return r.rows.map((row: any) => ({
    extId: row.external_id,
    title: row.title,
    priority: row.priority,
    phase: row.phase ?? null,
    phaseState: row.state ?? null,
    phaseSince: row.at ? new Date(row.at).toISOString() : null,
    retryCount: row.retry_count ?? 0,
    blockReason: row.state === 'blocked' ? (row.detail ?? 'blockiert') : null,
    slot: row.pipeline_slot ?? null,
    driver: row.driver ?? null,
    prNumber: row.driver === 'devflow' ? parsePrNumber(row.detail) : null,
    ciStatus: null,
  }));
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: PASS — all existing tests stay green (the `getControl` slot-leak test still expects `slotsUsed=2`), the two new tests pass.

- [ ] **Step 8: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-floor): widen Hall query for slot-less devflow tickets"
```

---

## Task 2: GitHub CI-status helper with aggregation + cache

**Files:**
- Create: `website/src/lib/github-ci.ts`
- Test: `website/src/lib/factory-floor.test.ts` (new `describe` block)

This module fetches the CI verdict for a PR and aggregates per-check-run conclusions into one of `success | pending | failure`. The aggregation is a **pure, exported** function so it is unit-testable without network; the fetch wrapper caches results 60s in-memory to avoid GitHub rate limits.

- [ ] **Step 1: Write the failing aggregation test**

Add a new block at the bottom of `website/src/lib/factory-floor.test.ts`:

```typescript
import { aggregateCheckRuns } from './github-ci';

describe('github-ci aggregation', () => {
  it('all completed+success → success', () => {
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'success' },
    ])).toBe('success');
  });
  it('any failure-ish conclusion → failure', () => {
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'failure' },
    ])).toBe('failure');
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'timed_out' },
    ])).toBe('failure');
  });
  it('any still-running check → pending', () => {
    expect(aggregateCheckRuns([
      { status: 'completed', conclusion: 'success' },
      { status: 'in_progress', conclusion: null },
    ])).toBe('pending');
  });
  it('empty list → pending', () => {
    expect(aggregateCheckRuns([])).toBe('pending');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t "github-ci"`
Expected: FAIL — cannot resolve module `./github-ci`.

- [ ] **Step 3: Create `github-ci.ts` with the pure aggregator + cached fetch**

Create `website/src/lib/github-ci.ts`:

```typescript
// GitHub CI-status helper for the Factory Floor. Resolves a PR number to an
// aggregated check-run verdict (success | pending | failure), cached 60s
// in-memory to stay within unauthenticated/PAT rate limits. Fails CLOSED to
// null on any error — the Floor must never break because GitHub is slow/down.

const REPO = 'Paddione/Bachelorprojekt';
const API = 'https://api.github.com';
const CACHE_TTL_MS = 60_000;

export type CiStatus = 'success' | 'pending' | 'failure';
export interface CheckRun { status: string; conclusion: string | null; }

const FAILURE_CONCLUSIONS = new Set([
  'failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale',
]);

/** Aggregate check-run results into one verdict. Pure — no network. */
export function aggregateCheckRuns(runs: CheckRun[]): CiStatus {
  if (runs.length === 0) return 'pending';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  if (runs.some((r) => r.conclusion && FAILURE_CONCLUSIONS.has(r.conclusion))) return 'failure';
  if (runs.every((r) => r.conclusion === 'success' || r.conclusion === 'neutral' || r.conclusion === 'skipped')) {
    return 'success';
  }
  return 'pending';
}

interface CacheEntry { value: CiStatus | null; at: number; }
const cache = new Map<number, CacheEntry>();

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' };
  const pat = process.env.GITHUB_PAT;
  if (pat) h.Authorization = `Bearer ${pat}`;
  return h;
}

/** Resolve a PR number to its aggregated CI status (cached 60s). null on any error. */
export async function getPrCiStatus(prNumber: number): Promise<CiStatus | null> {
  const hit = cache.get(prNumber);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  let value: CiStatus | null = null;
  try {
    const commitsRes = await fetch(`${API}/repos/${REPO}/pulls/${prNumber}/commits?per_page=100`, { headers: ghHeaders() });
    if (commitsRes.ok) {
      const commits = await commitsRes.json() as Array<{ sha: string }>;
      const sha = commits[commits.length - 1]?.sha;
      if (sha) {
        const runsRes = await fetch(`${API}/repos/${REPO}/commits/${sha}/check-runs`, { headers: ghHeaders() });
        if (runsRes.ok) {
          const body = await runsRes.json() as { check_runs?: CheckRun[] };
          value = aggregateCheckRuns(body.check_runs ?? []);
        }
      }
    }
  } catch {
    value = null; // fail closed
  }
  cache.set(prNumber, { value, at: Date.now() });
  return value;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t "github-ci"`
Expected: PASS — all four aggregation cases.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/github-ci.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-floor): GitHub CI-status helper with aggregation + 60s cache"
```

---

## Task 3: Enrich the main API with CI status for devflow deploy-phase tickets

**Files:**
- Modify: `website/src/pages/api/factory-floor.ts`

The Hall already returns `prNumber` and `ciStatus: null` for devflow tickets. The main API enriches `ciStatus` (only for devflow tickets in the `deploy` phase that have a `prNumber`) before serialising. This keeps GitHub calls off the SSE path and off the DAL.

- [ ] **Step 1: Enrich the payload after `getFloor()`**

In `website/src/pages/api/factory-floor.ts`, replace the `try { ... }` block's body:

```typescript
  try {
    const payload = await getFloor(slotsCap);
    // Enrich devflow tickets currently in deploy with their live CI verdict.
    await Promise.all(
      payload.hall
        .filter((h) => h.driver === 'devflow' && h.phase === 'deploy' && h.prNumber != null)
        .map(async (h) => { h.ciStatus = await getPrCiStatus(h.prNumber as number); }),
    );
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/factory-floor]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
```

- [ ] **Step 2: Add the import**

At the top of `website/src/pages/api/factory-floor.ts`, add below the existing `getFloor` import:

```typescript
import { getPrCiStatus } from '../../lib/github-ci';
```

- [ ] **Step 3: Typecheck**

Run: `cd website && pnpm typecheck`
Expected: PASS — no type errors (`h.ciStatus` and `h.prNumber` exist on `HallItem` from Task 1).

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/factory-floor.ts
git commit -m "feat(factory-floor): enrich devflow deploy-phase tickets with live CI status"
```

---

## Task 4: SSE stream endpoint

**Files:**
- Create: `website/src/pages/api/factory-floor/stream.ts`

A `GET /api/factory-floor/stream` route that emits an SSE `phase` event whenever `MAX(at)` of `tickets.factory_phase_events` advances (polled server-side every 5s), plus a `heartbeat` every 30s to keep the connection open. Admin-gated, identical to the main API.

- [ ] **Step 1: Create the SSE endpoint**

Create `website/src/pages/api/factory-floor/stream.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { pool } from '../../../lib/website-db';

export const prerender = false;

const POLL_MS = 5_000;
const HEARTBEAT_MS = 30_000;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let lastMax = '';

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        try {
          const r = await pool.query(
            `SELECT COALESCE(MAX(at)::text, '') AS m FROM tickets.factory_phase_events`,
          );
          const m = r.rows[0]?.m ?? '';
          if (m && m !== lastMax) {
            lastMax = m;
            send('phase', { at: m });
          }
        } catch {
          /* swallow — heartbeat keeps the stream alive, client re-fetches on next phase */
        }
      };

      // Prime lastMax so the first poll only fires on a *new* event, then start loops.
      void poll();
      pollTimer = setInterval(poll, POLL_MS);
      beatTimer = setInterval(() => send('heartbeat', { t: Date.now() }), HEARTBEAT_MS);

      const cleanup = () => {
        if (pollTimer) clearInterval(pollTimer);
        if (beatTimer) clearInterval(beatTimer);
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (pollTimer) clearInterval(pollTimer);
      if (beatTimer) clearInterval(beatTimer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd website && pnpm typecheck`
Expected: PASS — `pool` is exported from `./website-db`, `getSession`/`isAdmin` from `./auth` (same imports the main API uses).

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/factory-floor/stream.ts
git commit -m "feat(factory-floor): SSE stream endpoint for real-time phase updates"
```

---

## Task 5: Svelte client — SSE + devflow blue chip + CI badge

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

Replace the 4s polling `setInterval` with an `EventSource` that re-fetches on `phase` events (with auto-reconnect on error). Extend the `HallItem` TS interface in the component to match the DAL. Render devflow workpieces with a blue outline and a clickable CI badge (🟢/🔴/🟡) that opens the PR.

- [ ] **Step 1: Extend the component's `HallItem` interface**

In `website/src/components/FactoryFloor.svelte`, replace the `HallItem` interface line (line ~8) with:

```typescript
  interface HallItem { extId: string; title: string; priority: string; phase: Phase | null; phaseState: 'entered'|'done'|'blocked'|null; phaseSince: string | null; retryCount: number; blockReason: string | null; slot: number | null; driver: 'factory'|'devflow'|null; prNumber: number | null; ciStatus: 'success'|'pending'|'failure'|null; }
```

- [ ] **Step 2: Replace polling with an SSE client**

In `website/src/components/FactoryFloor.svelte`, replace the `let timer: ... = null;` declaration (line ~30) with:

```typescript
  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
```

Then replace the `onMount`/`onDestroy` pair at the bottom of the `<script>` (lines ~132-133) with:

```typescript
  function connectSSE() {
    es = new EventSource('/api/factory-floor/stream', { withCredentials: true });
    es.addEventListener('phase', () => { void refresh(); });
    es.addEventListener('heartbeat', () => { stale = false; });
    es.onerror = () => {
      es?.close(); es = null;
      if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connectSSE(); }, 5000);
    };
  }

  onMount(() => { if (!initial) void refresh(); connectSSE(); });
  onDestroy(() => {
    es?.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  });
```

- [ ] **Step 3: Remove the now-unused `POLL_MS` constant**

In `website/src/components/FactoryFloor.svelte`, delete the line `const POLL_MS = 4000;` (line ~20) — it is no longer referenced.

- [ ] **Step 4: Add a CI-badge helper + render devflow chips**

In `website/src/components/FactoryFloor.svelte`, add near `prioDot` (~line 125) a helper:

```typescript
  function ciIcon(s: 'success'|'pending'|'failure'|null): string {
    return s === 'success' ? '🟢' : s === 'failure' ? '🔴' : s === 'pending' ? '🟡' : '';
  }
  function openPR(n: number | null) { if (n) window.open(prUrl(n), '_blank', 'noopener'); }
```

Then replace the Hall workpiece `<button>` block (lines ~262-272, inside `{#each hallAt(st.key) as w (w.extId)}`) with a driver-aware version:

```svelte
                <button
                  onclick={() => openDetail(w.extId)}
                  data-testid="floor-workpiece"
                  data-driver={w.driver ?? 'factory'}
                  title={`${w.title}${w.driver === 'devflow' && w.prNumber ? ` · PR #${w.prNumber}` : ''}${w.blockReason ? ` · ⛔ ${w.blockReason}` : ''}${w.phaseSince ? ` · seit ${minutesSince(w.phaseSince)} Min. in ${w.phase}` : ''}`}
                  class="flex w-full items-center justify-between gap-1 rounded px-1 py-0.5 text-xs mb-1 transition-all"
                  class:bg-gold={w.driver !== 'devflow' && w.phaseState !== 'blocked'}
                  class:text-dark={w.driver !== 'devflow' && w.phaseState !== 'blocked'}
                  class:bg-red-500={w.driver !== 'devflow' && w.phaseState === 'blocked'}
                  class:border={w.driver === 'devflow'}
                  class:border-blue-400={w.driver === 'devflow' && w.phaseState !== 'blocked'}
                  class:text-blue-300={w.driver === 'devflow' && w.phaseState !== 'blocked'}
                  class:bg-blue-950={w.driver === 'devflow' && w.phaseState !== 'blocked'}
                  class:border-red-400={w.driver === 'devflow' && w.phaseState === 'blocked'}
                  class:text-red-300={w.driver === 'devflow' && w.phaseState === 'blocked'}
                  class:bg-red-950={w.driver === 'devflow' && w.phaseState === 'blocked'}
                  class:animate-pulse={w.phaseState === 'blocked'}>
                  <span class="truncate">{w.extId}{w.driver === 'devflow' ? ' 👨‍💻' : ''}{w.phaseState === 'blocked' ? ' ⛔' : (minutesSince(w.phaseSince) >= STUCK_MIN ? ' ⏱' : '')}</span>
                  {#if w.driver === 'devflow' && w.ciStatus}
                    <span role="button" tabindex="0" data-testid="floor-ci-badge"
                          title={`CI: ${w.ciStatus} — PR öffnen`}
                          onclick={(e) => { e.stopPropagation(); openPR(w.prNumber); }}
                          onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openPR(w.prNumber); } }}>
                      {ciIcon(w.ciStatus)}
                    </span>
                  {/if}
                </button>
```

- [ ] **Step 5: Typecheck + build the Svelte component**

Run: `cd website && pnpm typecheck`
Expected: PASS — no unused `POLL_MS`/`timer`, `HallItem` fields resolve, no Svelte type errors.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/FactoryFloor.svelte
git commit -m "feat(factory-floor): SSE client + devflow blue chip + CI-status badge"
```

---

## Task 6: dev-flow-execute — full phase telemetry with detail strings

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`

Emit the full 8-event phase sequence with `--driver devflow` and `--detail` strings, all best-effort (`|| true`). Replace the existing minimal `implement entered/done` + `verify entered` events; add `plan entered/done`, `verify done`, and `deploy entered`.

- [ ] **Step 1: Add `plan entered`/`plan done` at Schritt 1.5**

In `.claude/skills/dev-flow-execute/SKILL.md`, in the Schritt 1.5 code block, replace the existing telemetry line:

```bash
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow || true
```

with:

```bash
# Live-Floor-Telemetrie (best-effort; --driver devflow; darf den Flow nie stoppen)
SLUG=$(basename "$PLAN_FILE" .md)
./scripts/ticket.sh phase "$TICKET_ID" plan entered --driver devflow --detail "Plan: $SLUG · $TICKET_ID" || true
```

Then, after the `set-touched-files` block in Schritt 1.5, add:

```bash
./scripts/ticket.sh phase "$TICKET_ID" plan done --driver devflow --detail "Plan geladen · Assets folgen" || true
```

- [ ] **Step 2: Add `implement entered` at the start of Schritt 2**

In `.claude/skills/dev-flow-execute/SKILL.md`, at the very start of Schritt 2 (just before "Statt deinen eigenen Kontext…"), add a fenced bash block:

```bash
# Live-Floor-Telemetrie (best-effort): Implementer-Subagent wird gespawnt
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow --detail "Subagent gestartet" || true
```

- [ ] **Step 3: Enrich the Schritt 3 verify telemetry**

In `.claude/skills/dev-flow-execute/SKILL.md`, replace the Schritt 3 telemetry lines:

```bash
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow || true
```

with:

```bash
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow --detail "Implementierung fertig" || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow --detail "task test:all + freshness" || true
```

Then, after the `task freshness:regenerate` line in the same block, add:

```bash
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "Tests grün · freshness OK" || true
```

- [ ] **Step 4: Add `deploy entered` at Schritt 5.5**

In `.claude/skills/dev-flow-execute/SKILL.md`, at the start of Schritt 5.5 (just after the `PR_URL=$(...)` line in the CI-loop block), add:

```bash
PR_NUM_TELEM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
./scripts/ticket.sh phase "$TICKET_ID" deploy entered --driver devflow --detail "PR #$PR_NUM_TELEM · CI watch" || true
```

And inside the CI retry loop, just after `echo "⏳ CI-Check Versuch $CI_ATTEMPT/$MAX_CI_ATTEMPTS …"`, add:

```bash
  ./scripts/ticket.sh phase "$TICKET_ID" deploy entered --driver devflow --detail "CI attempt $CI_ATTEMPT/$MAX_CI_ATTEMPTS" || true
```

- [ ] **Step 5: Enrich the Schritt 6.5 deploy-done telemetry**

In `.claude/skills/dev-flow-execute/SKILL.md`, replace the Schritt 6.5 telemetry line:

```bash
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow || true
```

with:

```bash
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "PR #$PR_NUM merged · deployed" || true
```

And update the Schritt 8 telemetry line at the bottom (the `deploy done` after deployments) to:

```bash
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "deployed (post-merge)" || true
```

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(dev-flow-execute): full devflow phase telemetry with detail strings"
```

---

## Task 7: Factory pipeline.js — detail strings on phase events

**Files:**
- Modify: `scripts/factory/pipeline.js`

Add a `--detail` argument to each `phaseEvent(...)` call that currently has none, per the spec's table. The `phaseEvent(ph, state, detail)` signature already supports it (line ~112); only the `entered`/`done` calls that pass no detail need updating. Where a count (`<N>`) is known from a prior agent result, interpolate it; otherwise use the static string.

- [ ] **Step 1: Add detail to scout events**

In `scripts/factory/pipeline.js`, update:

```javascript
phaseEvent('scout', 'entered')
```
→
```javascript
phaseEvent('scout', 'entered', 'Codebase-Analyse gestartet')
```

and (after the scout:persist agent, where `scout.touched_files` exists):

```javascript
phaseEvent('scout', 'done')
```
→
```javascript
phaseEvent('scout', 'done', `${(scout.touched_files || []).length} touched_files`)
```

- [ ] **Step 2: Add detail to design events**

```javascript
phaseEvent('design', 'entered')   →   phaseEvent('design', 'entered', 'Spec-Generierung')
phaseEvent('design', 'done')      →   phaseEvent('design', 'done', 'Spec erstellt')
```

- [ ] **Step 3: Add detail to plan events (both the fresh-plan and reuse branches)**

In the fresh-plan branch:

```javascript
phaseEvent('plan', 'entered')   →   phaseEvent('plan', 'entered', 'Plan-Erstellung')
phaseEvent('plan', 'done')      →   phaseEvent('plan', 'done', `${(plan.tasks || tasks || []).length} Tasks`)
```

In the reuse branch (the second `phaseEvent('plan', 'entered')` / `'done'` pair):

```javascript
phaseEvent('plan', 'entered')   →   phaseEvent('plan', 'entered', 'Plan-Reuse')
phaseEvent('plan', 'done')      →   phaseEvent('plan', 'done', `${(plan.tasks || tasks || []).length} Tasks (reuse)`)
```

> Verify the in-scope variable name for the task array at each call site (`plan.tasks` vs `tasks`) by reading the surrounding lines; use the one that is defined there. Leave the blocked-state plan event (`phaseEvent('plan', 'blocked', 'file-overlap: …')`) unchanged — it already carries a detail.

- [ ] **Step 4: Add detail to implement events**

```javascript
phaseEvent('implement', 'entered')   →   phaseEvent('implement', 'entered', 'Implementierung gestartet')
phaseEvent('implement', 'done')      →   phaseEvent('implement', 'done', `${tasks.length} Tasks implementiert`)
```

Leave `phaseEvent('implement', 'blocked', 'worktree-setup')` unchanged.

- [ ] **Step 5: Add detail to verify events**

```javascript
phaseEvent('verify', 'entered')   →   phaseEvent('verify', 'entered', 'Tests + Freshness')
phaseEvent('verify', 'done')      →   phaseEvent('verify', 'done', 'Tests ✓')
```

Leave the `phaseEvent('verify', 'done', 'noise-only')` call (the noise-only short-circuit) unchanged — it already carries a detail.

- [ ] **Step 6: Add detail to the final deploy-done event**

The deploy block already has `phaseEvent('deploy', 'entered')`. The instruction string that opens the PR records the PR number into a shell var; the JS `phaseEvent` cannot read it, so use a static detail. Update:

```javascript
phaseEvent('deploy', 'entered')   →   phaseEvent('deploy', 'entered', 'PR erstellt · CI watch')
phaseEvent('deploy', 'done')      →   phaseEvent('deploy', 'done', 'PR merged')
```

Leave `phaseEvent('deploy', 'done', 'dry-run')` and `phaseEvent('deploy', 'blocked', 'deploy-guard')` unchanged.

- [ ] **Step 7: Syntax-check pipeline.js**

Run: `node --check scripts/factory/pipeline.js`
Expected: no output, exit 0 (valid JS).

- [ ] **Step 8: Run the Factory smoke test to confirm loadability**

Run: `./tests/runner.sh local FA-SF-20`
Expected: PASS (pipeline.js still loads/nests as a Workflow script).

> If FA-SF-20 is not runnable offline in this environment, fall back to `node --check` (Step 7) and note it; do not block on the smoke test.

- [ ] **Step 9: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory): detail strings on pipeline phase events"
```

---

## Task 8: Full test pass + freshness + final verification

**Files:**
- No new files — verification + any test fixups uncovered.

- [ ] **Step 1: Run the full website unit suite**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: PASS — all DAL tests (existing + new Hall/devflow), the github-ci aggregation block.

- [ ] **Step 2: Typecheck the website**

Run: `cd website && pnpm typecheck`
Expected: PASS — no TS errors across `factory-floor.ts`, `github-ci.ts`, `factory-floor.ts` API, `stream.ts`, `FactoryFloor.svelte`.

- [ ] **Step 3: Run the offline test umbrella**

Run: `task test:all`
Expected: PASS — BATS, kustomize, Taskfile dry-run, Factory FA-SF tests all green.

- [ ] **Step 4: Regenerate freshness artefacts**

Run: `task freshness:regenerate`
Then: `git status --porcelain`
Expected: if `test-inventory.json` / `route-manifest.json` changed (new `stream.ts` route, new tests), they are regenerated. Stage and commit any changes:

```bash
git add -A
git commit -m "chore(factory-floor): regenerate freshness artefacts" || echo "nothing to regenerate"
```

- [ ] **Step 5: Run the freshness check gate**

Run: `task freshness:check`
Expected: PASS — no drift between generated artefacts and committed versions.

- [ ] **Step 6: Final commit (if any residual)**

```bash
git status
# ensure tree clean; if not, commit the remainder
```

---

## Self-Review

**Spec coverage:**
- Abschnitt 1 (devflow telemetry, 8 events, best-effort) → Task 6 ✓
- Abschnitt 2 (widened Hall query, `HallItem` `driver`/`prNumber`/`ciStatus`, slot counter untouched) → Task 1 ✓
- Abschnitt 3 (blue devflow chip, CI badge, tooltip, colour scheme) → Task 5 ✓
- Abschnitt 4 (SSE endpoint, Svelte EventSource client, GitHub CI fetch+aggregate+cache) → Tasks 2 (helper), 3 (API enrich), 4 (SSE), 5 (client) ✓
- Abschnitt 5 (pipeline.js detail strings) → Task 7 ✓
- `GITHUB_PAT` already in schema → read via `process.env.GITHUB_PAT`, no schema change ✓
- Testbarkeit (widened query test, CI aggregation test) → Tasks 1, 2; full pass Task 8 ✓
- Nicht im Scope (no DB migration, no dispatcher.js, no Planungsbüro, no auto-slot for devflow) → respected ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The one judgement call (task-array variable name in Task 7 Step 3) is explicitly flagged with how to resolve it from surrounding lines.

**Type consistency:** `HallItem.driver`/`prNumber`/`ciStatus` defined identically in DAL (Task 1) and component (Task 5). `parsePrNumber`, `aggregateCheckRuns`, `getPrCiStatus`, `ciIcon`, `openPR` signatures consistent across tasks. `CiStatus` union reused.

---

## Execution Handoff

This plan is staged for `dev-flow-execute` to pick up on branch `feature/factory-devflow-floor-overhaul`.
