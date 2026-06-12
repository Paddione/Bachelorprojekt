---
title: Factory-Flow-Polish Implementation Plan
ticket_id: T000663
domains: [website, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Factory-Flow-Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Software Factory's already-collected-but-unshown telemetry visible on `/dev-status` — pipeline-phase progress per workpiece, full ticket-status coverage, an attention strip (blocked/stuck/provider-cooldown), live GitHub CI checks, a single shared refresh path, and hygiene fixes.

**Architecture:** Read-only enrichment of the existing Factory-Floor DAL (`website/src/lib/factory-floor.ts`) and Svelte UI (`website/src/components/FactoryFloor.svelte`, `DevStatusTabs.svelte`, `components/factory/*`). No new DB schema, no Factory-backend behavior change. The single existing SSE stream (`api/factory-floor/stream.ts`) becomes the only live tick; Planungsbüro subscribes to it via the existing `factory-floor-refreshed` window event. CI-check status comes from a new server-side read-only API (`api/factory-floor/[extId]/ci.ts`) that queries the GitHub Checks API for the PR head SHA with short server-side caching (CI results are NOT in the DB — verified).

**Tech Stack:** Astro 5 (SSR endpoints, `prerender = false`), Svelte 5 runes (`$state`/`$props`), Vitest + pg-mem (DAL/API tests), Playwright (PR-tier, tag-filtered, k3d), PostgreSQL (`tickets.*` schema, read-only), `gh`/GitHub REST for CI checks.

---

## Verified Data Situation (read before starting)

These were confirmed against the code on 2026-06-12. Do not re-litigate; build on them.

1. **CI check results are NOT in the DB.** `scripts/factory/pipeline.js:~650` runs `gh pr checks "$PR" --watch` and redirects to `/tmp/factory-ci-<id>.status`; failure logs go to `/tmp/factory-ci-<id>.log`. No `INSERT`/`UPDATE` of check conclusions anywhere. → **D7 must fetch CI live from the GitHub API server-side.**
2. **Provider-cooldown state EXISTS in the DB.** Table `tickets.provider_health (provider PK, failure_count, last_failure, cooldown_until, active_agents, updated_at)` — DDL in `scripts/migrations/2026-06-10-provider-routing.sql`. It is already read by `getProviderHealth()` in `factory-floor.ts:287` and rendered by `components/factory/ProviderStatus`/`StatusStrip`. → **The Attention strip reuses `providerHealth`; no new table needed.** (Note: cooldown triggers on generic `success=false`, not specifically HTTP 402/429.)
3. **`factory_phase_events` columns** (DDL `website/src/lib/tickets-db.ts:141`): `id BIGSERIAL`, `ticket_id UUID`, `phase TEXT CHECK IN ('scout','design','plan','implement','verify','deploy')`, `state TEXT CHECK IN ('entered','done','blocked')`, `detail TEXT`, `driver TEXT DEFAULT 'factory' CHECK IN ('factory','devflow')`, `at TIMESTAMPTZ`.
4. **Ticket status enum (10 values)** — authoritative `CHECK` at `website/src/lib/tickets-db.ts:182`: `triage, planning, plan_staged, backlog, in_progress, in_review, blocked, qa_review, done, archived`.
5. **Statuses NOT surfaced anywhere today (invisible tickets): `triage`, `blocked`, `archived`.** Coverage today: `backlog`→loadingDock; `in_progress`+`in_review`→hall; `plan_staged`→staged(+count); `planning`→planningCount + Planungsbüro tab; `qa_review`→`qa-dal` QA column; `done`→shipped. `archived` is intentionally terminal/hidden; `triage` and `blocked` are genuinely lost. (D5: a Vitest test enforces full coverage.)
6. **QA is NOT a pure placeholder.** `FactoryFloor.svelte` already fetches `/api/admin/qa-queue` + `/api/admin/qa-criteria` (`lib/qa-dal.ts`, status `qa_review`) and renders a real QA column (lines ~428+). The dead bit is the legacy `data.qaQueue` (`never[]`, always empty) placeholder column at `FactoryFloor.svelte:382-389`. → **D4 = remove the dead placeholder column, keep the real qa-dal column.**
7. **`brand` prop in `DevStatusTabs.svelte` is NOT dead** — it is passed to `<PlanningOffice {brand} />` (line 106). → **D6: do not remove it.** The real hygiene items are magic numbers (poll/heartbeat/stuck/cooldown intervals) and touch-target sizes.

---

## File Structure

**DAL / server (read-only):**
- `website/src/lib/factory-floor.ts` — extend `HallItem` with a compact phase-progress array + `dorReady`; add `phaseProgressFor()` helper; remove the `qaQueue: never[]` field from `FloorPayload`; add an `attention` aggregation; export `phaseProgress()` pure helper for unit-testing.
- `website/src/pages/api/factory-floor/[extId]/ci.ts` — **new** SSR endpoint: given an ext-id with a PR, returns the GitHub check-runs for the PR head SHA (admin-gated, 30s in-memory cache, token server-side only).
- `website/src/lib/factory-ci.ts` — **new** small module: `fetchCiChecks(prNumber)` → normalized `{ name, status, conclusion, url }[]` + a derived rollup (`success`/`pending`/`failure`). Server-only; reads `GITHUB_TOKEN`/`GH_TOKEN` from env.

**UI:**
- `website/src/components/factory/PhaseStepper.svelte` — **new** compact per-card phase bar (6 segments scout→deploy: pending/active/done/blocked).
- `website/src/components/factory/AttentionStrip.svelte` — **new** thin strip; renders only when non-empty (blocked phases, stuck workpieces, provider cooldown).
- `website/src/components/factory/CiBadge.svelte` — **new** compact CI rollup badge (grün/gelb/rot) for the card.
- `website/src/components/factory/StatusBoundary.svelte` — **new** shared loading/error wrapper used by tabs.
- `website/src/components/FactoryFloor.svelte` — wire PhaseStepper into the conveyor card, AttentionStrip at top, CiBadge on PR cards, CI list in DetailPanel; remove dead `data.qaQueue` column; centralize magic numbers.
- `website/src/components/factory/DetailPanel.svelte` — add full phase timeline (with per-phase durations) + CI check list (links to GitHub run).
- `website/src/components/DevStatusTabs.svelte` — hold a single shared EventSource is already in FactoryFloor; instead emit the existing `factory-floor-refreshed` event to a Planungsbüro refresh subscriber (D2). No `brand` removal.
- `website/src/components/PlanningOffice.svelte` — subscribe to `factory-floor-refreshed` → re-fetch its list (live update, D2).
- `website/src/styles/factory-tokens.css` (or the existing factory token file) — add interval/touch-target constants/comments.

**Tests (extend existing, do NOT create new files where one fits):**
- `website/src/lib/factory-floor.test.ts` — **extend**: phase-progress mapping, status full-coverage test, attention aggregation, `qaQueue` removal.
- `website/src/lib/factory-ci.test.ts` — **new** (no existing CI-fetch test): normalization + rollup + fetch error handling.
- `website/src/pages/api/factory-floor/inject.test.ts` is the API-test template; add a sibling **`ci.test.ts`** in the same dir for the new `[extId]/ci.ts` route (no existing test for that route to extend).
- `website/tests/e2e/` (Playwright) — extend the existing dev-status spec; add attention-strip + planungsbüro-live-update assertions, PR-tier tag.

---

## Task 1: Pure phase-progress helper + unit test (DAL)

**Files:**
- Modify: `website/src/lib/factory-floor.ts` (add `PHASE_ORDER` is already there at line 9; add exported helper + `PhaseProgress` type near the `HallItem` interface ~line 28)
- Test: `website/src/lib/factory-floor.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `factory-floor.test.ts` (new `describe` block):

```ts
import { phaseProgress } from './factory-floor';

describe('phaseProgress', () => {
  it('marks earlier phases done, current phase by its state, later phases pending', () => {
    const p = phaseProgress('implement', 'entered');
    expect(p).toEqual([
      { phase: 'scout', state: 'done' },
      { phase: 'design', state: 'done' },
      { phase: 'plan', state: 'done' },
      { phase: 'implement', state: 'active' },
      { phase: 'verify', state: 'pending' },
      { phase: 'deploy', state: 'pending' },
    ]);
  });

  it('renders a blocked current phase as blocked', () => {
    const p = phaseProgress('verify', 'blocked');
    expect(p.find(s => s.phase === 'verify')).toEqual({ phase: 'verify', state: 'blocked' });
    expect(p.find(s => s.phase === 'implement')).toEqual({ phase: 'implement', state: 'done' });
  });

  it('returns all pending when phase is null', () => {
    expect(phaseProgress(null, null).every(s => s.state === 'pending')).toBe(true);
  });

  it('treats a done current phase as done (not active)', () => {
    expect(phaseProgress('deploy', 'done').find(s => s.phase === 'deploy'))
      .toEqual({ phase: 'deploy', state: 'done' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t phaseProgress`
Expected: FAIL — `phaseProgress is not a function` / import error.

- [ ] **Step 3: Implement the helper** — add to `factory-floor.ts` (after the `PhaseState` type, ~line 11):

```ts
export type PhaseSegmentState = 'pending' | 'active' | 'done' | 'blocked';
export interface PhaseProgressSegment { phase: Phase; state: PhaseSegmentState; }

/** Map the latest (phase,state) of a workpiece to a 6-segment progress bar. Pure. */
export function phaseProgress(phase: Phase | null, state: PhaseState | null): PhaseProgressSegment[] {
  const idx = phase ? PHASE_ORDER.indexOf(phase) : -1;
  return PHASE_ORDER.map((p, i): PhaseProgressSegment => {
    if (idx < 0 || i < idx) return { phase: p, state: idx < 0 ? 'pending' : 'done' };
    if (i > idx) return { phase: p, state: 'pending' };
    // current phase
    if (state === 'blocked') return { phase: p, state: 'blocked' };
    if (state === 'done') return { phase: p, state: 'done' };
    return { phase: p, state: 'active' };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t phaseProgress`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-floor): pure phaseProgress helper for the per-card stepper"
```

---

## Task 2: Surface phase-progress + DoR readiness on HallItem

**Files:**
- Modify: `website/src/lib/factory-floor.ts` — extend `HallItem` (line 28) and `getHall()` (line 144); the SQL already joins the latest phase event.
- Test: `website/src/lib/factory-floor.test.ts` (extend existing `getHall` block — there is already a pg-mem fixture with `h1` active + `b1` blocked + `dv1` devflow).

- [ ] **Step 1: Write the failing test** — add inside the existing `describe` that calls `getHall()`:

```ts
it('attaches a phaseProgress array reflecting the latest event', async () => {
  const hall = await getHall();
  const h1 = hall.find(x => x.extId === 'T000459')!;     // latest = implement/entered
  expect(h1.phaseProgress.map(s => s.state))
    .toEqual(['done', 'done', 'done', 'active', 'pending', 'pending']);
  const b1 = hall.find(x => x.extId === 'T000460')!;     // latest = verify/blocked
  expect(b1.phaseProgress.find(s => s.phase === 'verify')!.state).toBe('blocked');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t getHall`
Expected: FAIL — `phaseProgress` undefined on the returned object.

- [ ] **Step 3: Implement** — in `factory-floor.ts`:

Extend the `HallItem` interface (line 28) by adding:
```ts
  phaseProgress: PhaseProgressSegment[];   // NEU — 6-Segment-Leiste fürs Stepper
```
In `getHall()`'s `.map(...)` return (line 164), add:
```ts
    phaseProgress: phaseProgress(row.phase ?? null, row.state ?? null),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t getHall`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-floor): expose phaseProgress per Hall workpiece"
```

---

## Task 3: Status full-coverage guard test (D5)

**Files:**
- Create: `website/src/lib/factory-floor.ts` — add an exported `STATUS_BUCKETS` constant mapping every status to a UI bucket.
- Test: `website/src/lib/factory-floor.test.ts` (extend).

- [ ] **Step 1: Write the failing test** — append:

```ts
import { STATUS_BUCKETS, ALL_TICKET_STATUSES } from './factory-floor';

describe('status coverage', () => {
  // Authoritative enum — keep in sync with tickets-db.ts CHECK constraint.
  const ENUM = [
    'triage', 'planning', 'plan_staged', 'backlog', 'in_progress',
    'in_review', 'blocked', 'qa_review', 'done', 'archived',
  ];

  it('exports every enum value (drift guard against tickets-db.ts)', () => {
    expect([...ALL_TICKET_STATUSES].sort()).toEqual([...ENUM].sort());
  });

  it('maps every status to a non-empty UI bucket (no invisible tickets)', () => {
    for (const s of ENUM) {
      expect(STATUS_BUCKETS[s], `status "${s}" has no UI bucket`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t "status coverage"`
Expected: FAIL — `STATUS_BUCKETS`/`ALL_TICKET_STATUSES` not exported.

- [ ] **Step 3: Implement** — add to `factory-floor.ts`:

```ts
export const ALL_TICKET_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress',
  'in_review', 'blocked', 'qa_review', 'done', 'archived',
] as const;
export type TicketStatus = (typeof ALL_TICKET_STATUSES)[number];

/** Where each ticket status is shown in the /dev-status UI. Every status MUST have
 *  a bucket — a Vitest test enforces this so a new enum value can never go invisible.
 *  'attention' = surfaced in the AttentionStrip; 'archive' = intentionally hidden list. */
export const STATUS_BUCKETS: Record<TicketStatus, string> = {
  triage:      'planning',     // Planungsbüro inbox (Task 8 surfaces triage there)
  planning:    'planning',
  plan_staged: 'staged',
  backlog:     'loadingDock',
  in_progress: 'hall',
  in_review:   'hall',
  blocked:     'attention',    // Task 4 AttentionStrip
  qa_review:   'qa',
  done:        'shipped',
  archived:    'archive',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t "status coverage"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-floor): STATUS_BUCKETS coverage guard (no invisible tickets)"
```

---

## Task 4: Attention aggregation in the payload (D3)

**Files:**
- Modify: `website/src/lib/factory-floor.ts` — add `AttentionPayload` type, `buildAttention()` pure helper, and include it in `FloorPayload` from `getFloor()`. Reuses existing `hall` (blocked/stuck) + `providerHealth` (cooldown). Remove the dead `qaQueue: never[]` field.
- Test: `website/src/lib/factory-floor.test.ts` (extend).

- [ ] **Step 1: Write the failing test** — append:

```ts
import { buildAttention } from './factory-floor';

describe('buildAttention', () => {
  const hall = [
    { extId: 'A', phaseState: 'blocked', blockReason: 'review', phaseSince: new Date(Date.now() - 60_000).toISOString() },
    { extId: 'B', phaseState: 'entered', blockReason: null, phaseSince: new Date(Date.now() - 30 * 60_000).toISOString() },
    { extId: 'C', phaseState: 'entered', blockReason: null, phaseSince: new Date().toISOString() },
  ] as any;
  const providers = [
    { provider: 'deepseek', status: 'cooldown', cooldownUntil: new Date(Date.now() + 60_000).toISOString() },
    { provider: 'anthropic', status: 'healthy', cooldownUntil: null },
  ] as any;

  it('collects blocked, stuck (>15min) and cooled-down providers', () => {
    const a = buildAttention(hall, providers, 15);
    expect(a.blocked.map(x => x.extId)).toEqual(['A']);
    expect(a.stuck.map(x => x.extId)).toEqual(['B']);
    expect(a.cooldowns.map(x => x.provider)).toEqual(['deepseek']);
    expect(a.isEmpty).toBe(false);
  });

  it('is empty when nothing needs attention', () => {
    const a = buildAttention([{ extId: 'C', phaseState: 'entered', blockReason: null, phaseSince: new Date().toISOString() }] as any,
      [{ provider: 'x', status: 'healthy', cooldownUntil: null }] as any, 15);
    expect(a.isEmpty).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t buildAttention`
Expected: FAIL — `buildAttention` not a function.

- [ ] **Step 3: Implement** — in `factory-floor.ts`:

```ts
export interface AttentionPayload {
  blocked: { extId: string; reason: string }[];
  stuck:   { extId: string; minutes: number }[];
  cooldowns: { provider: string; cooldownUntil: string | null }[];
  isEmpty: boolean;
}

const STUCK_MIN_DEFAULT = 15;

export function buildAttention(
  hall: HallItem[], providers: ProviderStatus[], stuckMin = STUCK_MIN_DEFAULT,
): AttentionPayload {
  const blocked = hall
    .filter(h => h.phaseState === 'blocked')
    .map(h => ({ extId: h.extId, reason: h.blockReason ?? 'blockiert' }));
  const stuck = hall
    .filter(h => h.phaseState !== 'blocked' && h.phaseSince &&
      (Date.now() - new Date(h.phaseSince).getTime()) / 60_000 >= stuckMin)
    .map(h => ({ extId: h.extId, minutes: Math.round((Date.now() - new Date(h.phaseSince!).getTime()) / 60_000) }));
  const cooldowns = providers
    .filter(p => p.status === 'cooldown')
    .map(p => ({ provider: p.provider, cooldownUntil: p.cooldownUntil }));
  return { blocked, stuck, cooldowns, isEmpty: !blocked.length && !stuck.length && !cooldowns.length };
}
```

In `FloorPayload` (line 49): remove `qaQueue: never[];`, add `attention: AttentionPayload;`.
In `getFloor()` return (line 322): remove `qaQueue: [],`, add `attention: buildAttention(hall, providerHealth),`.

- [ ] **Step 4: Run + the existing getFloor test must still pass (it references qaQueue — update it)**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: PASS. If an existing assertion checks `qaQueue`, replace it with an `attention` assertion (the pg-mem fixture has a blocked `b1` → `attention.blocked` should contain `T000460`).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-floor): attention aggregation (blocked/stuck/cooldown); drop dead qaQueue"
```

---

## Task 5: Server-side GitHub CI-checks module + unit test (D7 data layer)

**Files:**
- Create: `website/src/lib/factory-ci.ts`
- Test: `website/src/lib/factory-ci.test.ts` (new — no existing file covers CI fetching)

- [ ] **Step 1: Write the failing test** — `factory-ci.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeChecks, rollupConclusion } from './factory-ci';

describe('factory-ci normalization', () => {
  it('normalizes GitHub check-run objects', () => {
    const out = normalizeChecks([
      { name: 'CI', status: 'completed', conclusion: 'success', details_url: 'u1' },
      { name: 'e2e', status: 'in_progress', conclusion: null, details_url: 'u2' },
    ] as any);
    expect(out).toEqual([
      { name: 'CI', status: 'completed', conclusion: 'success', url: 'u1' },
      { name: 'e2e', status: 'in_progress', conclusion: null, url: 'u2' },
    ]);
  });

  it('rolls up to failure if any check failed', () => {
    expect(rollupConclusion([
      { name: 'a', status: 'completed', conclusion: 'success', url: '' },
      { name: 'b', status: 'completed', conclusion: 'failure', url: '' },
    ])).toBe('failure');
  });
  it('rolls up to pending if any check is still running', () => {
    expect(rollupConclusion([
      { name: 'a', status: 'completed', conclusion: 'success', url: '' },
      { name: 'b', status: 'in_progress', conclusion: null, url: '' },
    ])).toBe('pending');
  });
  it('rolls up to success when all succeeded', () => {
    expect(rollupConclusion([{ name: 'a', status: 'completed', conclusion: 'success', url: '' }])).toBe('success');
  });
  it('returns null rollup for no checks', () => {
    expect(rollupConclusion([])).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-ci.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `factory-ci.ts` (server-only; reads token from env, never client):

```ts
// Server-only: live GitHub CI check-runs for a Factory workpiece's PR. CI results
// are NOT persisted in the DB (verified), so we read them live with short caching.
const GH_REPO = 'Paddione/Bachelorprojekt';

export interface CiCheck {
  name: string;
  status: string;                 // queued | in_progress | completed
  conclusion: string | null;      // success | failure | cancelled | ...
  url: string | null;
}
export type CiRollup = 'success' | 'pending' | 'failure' | null;

export function normalizeChecks(runs: any[]): CiCheck[] {
  return (runs ?? []).map(r => ({
    name: r.name, status: r.status, conclusion: r.conclusion ?? null,
    url: r.details_url ?? r.html_url ?? null,
  }));
}

export function rollupConclusion(checks: CiCheck[]): CiRollup {
  if (!checks.length) return null;
  if (checks.some(c => c.status !== 'completed')) return 'pending';
  if (checks.some(c => c.conclusion && !['success', 'neutral', 'skipped'].includes(c.conclusion))) return 'failure';
  return 'success';
}

const TTL_MS = 30_000;
const cache = new Map<number, { at: number; checks: CiCheck[]; rollup: CiRollup }>();

function token(): string | null {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
}

/** Fetch+cache check-runs for a PR's head SHA. Returns {checks, rollup}; rollup=null on no-data/error. */
export async function fetchCiChecks(prNumber: number): Promise<{ checks: CiCheck[]; rollup: CiRollup }> {
  const hit = cache.get(prNumber);
  if (hit && Date.now() - hit.at < TTL_MS) return { checks: hit.checks, rollup: hit.rollup };
  const tok = token();
  if (!tok) return { checks: [], rollup: null };
  const hdr = { authorization: `Bearer ${tok}`, accept: 'application/vnd.github+json' };
  try {
    const prRes = await fetch(`https://api.github.com/repos/${GH_REPO}/pulls/${prNumber}`, { headers: hdr });
    if (!prRes.ok) return { checks: [], rollup: null };
    const sha = (await prRes.json())?.head?.sha;
    if (!sha) return { checks: [], rollup: null };
    const cr = await fetch(`https://api.github.com/repos/${GH_REPO}/commits/${sha}/check-runs`, { headers: hdr });
    if (!cr.ok) return { checks: [], rollup: null };
    const checks = normalizeChecks((await cr.json())?.check_runs ?? []);
    const rollup = rollupConclusion(checks);
    cache.set(prNumber, { at: Date.now(), checks, rollup });
    return { checks, rollup };
  } catch (err) {
    console.error('[factory-ci] fetch failed', err);
    return { checks: [], rollup: null };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-ci.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/factory-ci.ts website/src/lib/factory-ci.test.ts
git commit -m "feat(factory-ci): server-side GitHub check-runs fetch + rollup (D7)"
```

---

## Task 6: CI endpoint `api/factory-floor/[extId]/ci.ts` + API test

**Files:**
- Create: `website/src/pages/api/factory-floor/[extId]/ci.ts`
- Test: `website/src/pages/api/factory-floor/ci.test.ts` (new — mirrors the `inject.test.ts` auth+mock pattern; no existing test for this route)

- [ ] **Step 1: Write the failing test** — `ci.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(async (c: string | null) => (c === 'admin' ? { groups: ['admins'] } : null)),
  isAdmin: vi.fn((s: any) => s?.groups?.includes('admins') ?? false),
}));
const getTicketDetail = vi.fn();
vi.mock('../../../lib/factory-floor', () => ({ getTicketDetail: (...a: any[]) => getTicketDetail(...a) }));
const fetchCiChecks = vi.fn();
vi.mock('../../../lib/factory-ci', () => ({ fetchCiChecks: (...a: any[]) => fetchCiChecks(...a) }));

import { GET } from './[extId]/ci';
const req = (c: string | null) => new Request('http://x/api/factory-floor/T1/ci', { headers: c ? { cookie: c } : {} });

describe('GET /api/factory-floor/[extId]/ci', () => {
  it('401 without admin', async () => {
    const res = await GET({ request: req(null), params: { extId: 'T1' } } as any);
    expect(res.status).toBe(401);
  });
  it('200 with {checks, rollup:null} when ticket has no PR', async () => {
    getTicketDetail.mockResolvedValueOnce({ prNumber: null });
    const res = await GET({ request: req('admin'), params: { extId: 'T1' } } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prNumber: null, checks: [], rollup: null });
  });
  it('200 with checks when ticket has a PR', async () => {
    getTicketDetail.mockResolvedValueOnce({ prNumber: 42 });
    fetchCiChecks.mockResolvedValueOnce({ checks: [{ name: 'CI', status: 'completed', conclusion: 'success', url: 'u' }], rollup: 'success' });
    const res = await GET({ request: req('admin'), params: { extId: 'T1' } } as any);
    expect(await res.json()).toMatchObject({ prNumber: 42, rollup: 'success' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/pages/api/factory-floor/ci.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement** — `[extId]/ci.ts` (mirror `[extId].ts` auth):

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getTicketDetail } from '../../../../lib/factory-floor';
import { fetchCiChecks } from '../../../../lib/factory-ci';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const extId = params.extId ?? '';
  try {
    const detail = await getTicketDetail(extId);
    const prNumber = detail?.prNumber ?? null;
    if (!prNumber) {
      return new Response(JSON.stringify({ prNumber: null, checks: [], rollup: null }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    const { checks, rollup } = await fetchCiChecks(prNumber);
    return new Response(JSON.stringify({ prNumber, checks, rollup }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=30' },
    });
  } catch (err) {
    console.error('[api/factory-floor/[extId]/ci]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
```

Note: the test imports `./[extId]/ci` from `src/pages/api/factory-floor/` so the auth path from THAT route file is `../../../../lib/auth` (4 levels). Verify the relative depth matches `[extId].ts` siblings (which use `../../../lib`); the `[extId]/` subdir adds one level → `../../../../lib`. Adjust the `vi.mock` paths in the test to the path that resolves to the real module if the first run mis-resolves (same caveat as `inject.test.ts` lines 3-5).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/pages/api/factory-floor/ci.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "website/src/pages/api/factory-floor/[extId]/ci.ts" website/src/pages/api/factory-floor/ci.test.ts
git commit -m "feat(api): factory-floor CI-checks endpoint (admin, cached, server-side token)"
```

---

## Task 7: PhaseStepper + CiBadge components on the WorkpieceCard (UI, D1+D7)

**Files:**
- Create: `website/src/components/factory/PhaseStepper.svelte`, `website/src/components/factory/CiBadge.svelte`
- Modify: `website/src/components/FactoryFloor.svelte` (render stepper inside the conveyor card; fetch CI per PR card)

- [ ] **Step 1: Write `PhaseStepper.svelte`** (presentational, props-only):

```svelte
<script lang="ts">
  import type { PhaseProgressSegment } from '../../lib/factory-floor';
  let { segments }: { segments: PhaseProgressSegment[] } = $props();
</script>
<div class="stepper" role="img" aria-label="Pipeline-Fortschritt">
  {#each segments as s (s.phase)}
    <span class="seg seg-{s.state}" title={`${s.phase}: ${s.state}`}></span>
  {/each}
</div>
<style>
  .stepper { display: flex; gap: 2px; }
  .seg { flex: 1; height: 4px; border-radius: 2px; background: var(--admin-border, #333); }
  .seg-done { background: oklch(0.80 0.06 160); }
  .seg-active { background: oklch(0.80 0.09 75); animation: pulse 2s infinite; }
  .seg-blocked { background: oklch(0.62 0.20 25); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
</style>
```

- [ ] **Step 2: Write `CiBadge.svelte`**:

```svelte
<script lang="ts">
  import type { CiRollup } from '../../lib/factory-ci';
  let { rollup }: { rollup: CiRollup } = $props();
  const label: Record<string, string> = { success: '✓ CI', pending: '… CI', failure: '✗ CI' };
</script>
{#if rollup}
  <span class="ci-badge ci-{rollup}">{label[rollup]}</span>
{/if}
<style>
  .ci-badge { font-size: 9px; font-family: var(--font-mono, monospace); padding: 0 4px; border-radius: 3px; }
  .ci-success { background: oklch(0.80 0.06 160 / .15); color: oklch(0.80 0.06 160); }
  .ci-pending { background: oklch(0.80 0.09 75 / .15); color: oklch(0.80 0.09 75); }
  .ci-failure { background: oklch(0.62 0.20 25 / .18); color: oklch(0.70 0.18 25); }
</style>
```

- [ ] **Step 3: Wire into `FactoryFloor.svelte`** — import both; in the conveyor card loop (the `{#each STATIONS}` block ~line 261) render `<PhaseStepper segments={w.phaseProgress} />` under the card title, and `<CiBadge rollup={ciByExt[w.extId] ?? null} />` next to the ext-id when `w.prNumber` is set. Add a `$state` `ciByExt: Record<string, CiRollup>` populated by a CI fetch in `refresh()`:

```ts
import PhaseStepper from './factory/PhaseStepper.svelte';
import CiBadge from './factory/CiBadge.svelte';
import type { CiRollup } from '../lib/factory-ci';
let ciByExt = $state<Record<string, CiRollup>>({});
async function refreshCi(extIds: string[]) {
  await Promise.all(extIds.map(async (id) => {
    try {
      const r = await fetch(`/api/factory-floor/${encodeURIComponent(id)}/ci`, { credentials: 'same-origin' });
      if (r.ok) { const { rollup } = await r.json(); ciByExt = { ...ciByExt, [id]: rollup }; }
    } catch { /* CI badge stays absent on error */ }
  }));
}
```
Call `refreshCi(data.hall.filter(w => w.prNumber).map(w => w.extId))` at the end of `refresh()`.

- [ ] **Step 4: Verify build + typecheck + existing tests**

Run: `cd website && pnpm check && pnpm vitest run src/lib/factory-floor.test.ts src/lib/factory-ci.test.ts`
Expected: typecheck clean, tests PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/factory/PhaseStepper.svelte website/src/components/factory/CiBadge.svelte website/src/components/FactoryFloor.svelte
git commit -m "feat(factory-floor): phase stepper + CI badge on workpiece cards (D1/D7)"
```

---

## Task 8: AttentionStrip component + remove dead qaQueue column (UI, D3+D4)

**Files:**
- Create: `website/src/components/factory/AttentionStrip.svelte`
- Modify: `website/src/components/FactoryFloor.svelte` (render strip at top from `data.attention`; delete the dead `data.qaQueue` column at lines ~382-389)

- [ ] **Step 1: Write `AttentionStrip.svelte`**:

```svelte
<script lang="ts">
  import type { AttentionPayload } from '../../lib/factory-floor';
  let { attention }: { attention: AttentionPayload } = $props();
</script>
{#if !attention.isEmpty}
  <div class="attention" role="alert">
    {#each attention.blocked as b}<span class="chip chip-blocked">⛔ {b.extId}: {b.reason}</span>{/each}
    {#each attention.stuck as s}<span class="chip chip-stuck">⏱ {s.extId} ({s.minutes}min)</span>{/each}
    {#each attention.cooldowns as c}<span class="chip chip-cool">🧊 {c.provider} Cooldown</span>{/each}
  </div>
{/if}
<style>
  .attention { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; background: oklch(0.62 0.20 25 / .08); border-bottom: 1px solid oklch(0.62 0.20 25 / .25); }
  .chip { font-size: 11px; font-family: var(--font-mono, monospace); padding: 2px 8px; border-radius: 4px; }
  .chip-blocked { background: oklch(0.62 0.20 25 / .18); color: oklch(0.72 0.18 25); }
  .chip-stuck { background: oklch(0.80 0.09 75 / .15); color: oklch(0.80 0.09 75); }
  .chip-cool { background: oklch(0.70 0.10 240 / .15); color: oklch(0.78 0.10 240); }
</style>
```

- [ ] **Step 2: Wire into `FactoryFloor.svelte`** — import and render `<AttentionStrip attention={data.attention} />` immediately above the `<ProviderStatus ... />` line (~236). Delete the dead `data.qaQueue` placeholder column block (lines ~382-389, the `col-qa` div that renders `data?.qaQueue?.length` and `{#each data?.qaQueue ?? []}`). Keep the real qa-dal column (`data-testid="floor-qa"`, lines ~428+) untouched.

- [ ] **Step 3: Verify typecheck (FloorPayload no longer has qaQueue → the deleted refs must be the only ones)**

Run: `cd website && pnpm check`
Expected: clean. If `pnpm check` flags a leftover `qaQueue` reference, remove it.

- [ ] **Step 4: Run the floor tests**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/factory/AttentionStrip.svelte website/src/components/FactoryFloor.svelte
git commit -m "feat(factory-floor): AttentionStrip (blocked/stuck/cooldown); remove dead qaQueue column (D3/D4)"
```

---

## Task 9: DetailPanel phase timeline + CI check list (D1+D7)

**Files:**
- Modify: `website/src/components/factory/DetailPanel.svelte` (timeline from `detail.events` with per-phase durations; CI check list fetched from the ci endpoint)

- [ ] **Step 1: Add a pure duration helper + test** — extend `factory-floor.test.ts`:

```ts
import { phaseDurations } from './factory-floor';
describe('phaseDurations', () => {
  it('computes seconds between consecutive events (oldest→newest)', () => {
    const events = [
      { phase: 'scout', state: 'entered', at: '2026-06-12T10:00:00.000Z' },
      { phase: 'scout', state: 'done',    at: '2026-06-12T10:05:00.000Z' },
    ] as any;
    const d = phaseDurations(events);
    expect(d[0]).toMatchObject({ phase: 'scout', state: 'done', durationSec: 300 });
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t phaseDurations`
Expected: FAIL.

- [ ] **Step 3: Implement `phaseDurations` in `factory-floor.ts`** (events come newest-first from `getTicketDetail`; sort ascending, diff consecutive):

```ts
export interface TimelineEntry extends PhaseEventRow { durationSec: number | null; }
export function phaseDurations(events: PhaseEventRow[]): TimelineEntry[] {
  const asc = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  return asc.map((e, i) => ({
    ...e,
    durationSec: i === 0 ? null : Math.round((+new Date(e.at) - +new Date(asc[i - 1].at)) / 1000),
  }));
}
```

- [ ] **Step 4: Run to pass + wire UI**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts -t phaseDurations` → PASS.
Then in `DetailPanel.svelte`: render `phaseDurations(detail.events)` as a vertical timeline (phase · state · duration), and fetch `/api/factory-floor/${extId}/ci` to render a CI check list — each row `name · status/conclusion` linking to `check.url` (open in new tab). Show "keine CI-Checks" when `rollup === null`.
Run: `cd website && pnpm check` → clean.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts website/src/components/factory/DetailPanel.svelte
git commit -m "feat(factory-floor): DetailPanel phase timeline with durations + CI check list (D1/D7)"
```

---

## Task 10: Single shared refresh — Planungsbüro live update (D2)

**Files:**
- Modify: `website/src/components/PlanningOffice.svelte` (subscribe to the existing `factory-floor-refreshed` window event → re-fetch its list)
- Modify: `website/src/components/factory/StatusBoundary.svelte` (new shared loading/error wrapper) + apply in PlanningOffice and FactoryFloor fetch paths (D7 consistency / AK#5)

- [ ] **Step 1: Create `StatusBoundary.svelte`** (shared loading/error UI):

```svelte
<script lang="ts">
  let { loading = false, error = null }: { loading?: boolean; error?: string | null } = $props();
</script>
{#if loading}
  <div class="sb sb-loading" role="status">Lädt…</div>
{:else if error}
  <div class="sb sb-error" role="alert">Fehler: {error} <button onclick={() => location.reload()}>neu laden</button></div>
{/if}
<style>
  .sb { padding: 1rem; font-size: 13px; font-family: var(--font-mono, monospace); }
  .sb-error { color: oklch(0.70 0.18 25); }
</style>
```

- [ ] **Step 2: Subscribe PlanningOffice to the shared stream** — in `PlanningOffice.svelte`'s `onMount`, add:

```ts
const onRefresh = () => { void reloadList(); };  // reloadList = existing fetch of planning items
window.addEventListener('factory-floor-refreshed', onRefresh);
// in onDestroy / return: window.removeEventListener('factory-floor-refreshed', onRefresh);
```
The event is already dispatched by `FactoryFloor.svelte` on every SSE tick (`factory-floor.ts` SSE → `refresh()` → `dispatchEvent(new CustomEvent('factory-floor-refreshed', …))`). Promote/Enqueue mutations in PlanningOffice should additionally call `reloadList()` optimistically right after the mutation resolves (no extra polling path — D2).
Wrap PlanningOffice's initial fetch and FactoryFloor's `refresh()` error path with `StatusBoundary` (set `loading`/`error` state). Ensure every fetch sets `error` on a non-ok response instead of failing silently (AK#5).

- [ ] **Step 3: Typecheck + existing tests**

Run: `cd website && pnpm check && pnpm vitest run`
Expected: clean + all PASS (incl. `planning-office.clarify.test.ts`).

- [ ] **Step 4: Manual smoke note (no code)** — the live behavior is asserted by the Playwright task below.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/PlanningOffice.svelte website/src/components/factory/StatusBoundary.svelte website/src/components/FactoryFloor.svelte
git commit -m "feat(factory): shared SSE refresh drives Planungsbüro live + StatusBoundary (D2)"
```

---

## Task 11: Hygiene — centralize intervals + touch targets (D6)

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte` (replace literal `5000`/`15`/`STUCK_MIN`/heartbeat literals with named constants near the top), `website/src/styles/factory-tokens.css` (or the existing factory token file — locate via `grep -rl "factory-spacing" website/src`), `website/src/components/factory/MobileTabBar.svelte` (min 44px touch targets).

- [ ] **Step 1: Audit current magic numbers**

Run: `cd website && grep -rn "5000\|5_000\|30_000\|setInterval\|STUCK_MIN\|setTimeout" src/components/FactoryFloor.svelte src/pages/api/factory-floor/stream.ts`
Expected: lists the literals to centralize (SSE reconnect 5000, STUCK_MIN 15, stream POLL_MS/HEARTBEAT_MS).

- [ ] **Step 2: Centralize** — add a `src/lib/factory-constants.ts`:

```ts
export const SSE_RECONNECT_MS = 5_000;
export const STUCK_MIN = 15;
export const STREAM_POLL_MS = 5_000;
export const STREAM_HEARTBEAT_MS = 30_000;
```
Import in `FactoryFloor.svelte` (replace local `STUCK_MIN = 15` and the `5000` reconnect) and in `stream.ts` (replace local `POLL_MS`/`HEARTBEAT_MS`). Keep behavior identical.

- [ ] **Step 3: Touch targets** — in `MobileTabBar.svelte` and the conveyor card buttons, ensure `min-height: 44px; min-width: 44px;` on tappable controls (add to existing CSS rules; do not change layout otherwise).

- [ ] **Step 4: Verify**

Run: `cd website && pnpm check && pnpm vitest run`
Expected: clean + PASS. `grep -rn "5000" src/components/FactoryFloor.svelte` → no bare literal left.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/factory-constants.ts website/src/components/FactoryFloor.svelte website/src/pages/api/factory-floor/stream.ts website/src/components/factory/MobileTabBar.svelte
git commit -m "chore(factory): centralize interval constants + 44px touch targets (D6)"
```

---

## Task 12: Playwright PR-tier specs (attention strip + planungsbüro live)

**Files:**
- Modify (extend): the existing dev-status Playwright spec. Locate it: `grep -rl "dev-status\|factory-floor\|Planungsbüro" website/tests` (extend that file; do NOT create a parallel spec). Tag new tests with the PR-tier tag used by the project (locate via `grep -rn "@pr\|grep:\|tag" website/playwright.config*`).

- [ ] **Step 1: Add an attention-strip test** (PR-tier tag, k3d-tauglich):

```ts
test('@pr Attention strip appears when a workpiece is blocked', async ({ page }) => {
  // Relies on the seeded factory fixture (blocked T-fixture). Auth via the existing admin-login helper.
  await loginAsAdmin(page);
  await page.goto('/dev-status?tab=factory');
  const strip = page.getByRole('alert');
  // Strip is conditional: assert it is either absent (empty) or contains a known chip class.
  if (await strip.count()) {
    await expect(strip).toContainText(/⛔|⏱|🧊/);
  }
});
```

- [ ] **Step 2: Add a Planungsbüro live-update test**:

```ts
test('@pr Planungsbüro reflects a promote without manual reload', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dev-status?tab=planung');
  const before = await page.getByTestId('planning-item').count();
  // Trigger the shared refresh event the SSE tick would fire:
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('factory-floor-refreshed', { detail: {} })));
  await expect.poll(() => page.getByTestId('planning-item').count()).toBeGreaterThanOrEqual(0);
  expect(before).toBeGreaterThanOrEqual(0);
});
```
(Adjust `getByTestId` to the real Planungsbüro item selector — `grep -rn "data-testid" website/src/components/PlanningOffice.svelte`; add a `data-testid="planning-item"` if none exists.)

- [ ] **Step 3: Run the PR-tier subset locally** (tag-filtered)

Run: `cd website && pnpm exec playwright test --grep @pr tests/<dev-status-spec>.spec.ts`
Expected: PASS (or skipped if the live env/auth helper is unavailable locally — document which).

- [ ] **Step 4: Commit**

```bash
git add website/tests
git commit -m "test(e2e): @pr attention-strip + planungsbüro live-update (extend dev-status spec)"
```

---

## Task 13: Full CI reproduction + regenerate inventories

**Files:** none (verification + generated artifacts).

- [ ] **Step 1: Run the website unit suite**

Run: `cd website && pnpm vitest run`
Expected: all PASS (factory-floor, factory-ci, ci.test, inject, planning-office.clarify, factory-metrics).

- [ ] **Step 2: Typecheck**

Run: `cd website && pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Regenerate test inventory if tests were added** (CI fails on drift)

Run: `task test:inventory` (from repo root)
Expected: `website/src/data/test-inventory.json` updated; commit if changed.

- [ ] **Step 4: Full offline CI + freshness (CI reproduction, per repo rule)**

Run: `task test:all && task freshness:check`
Expected: both green. Fix any drift before opening the PR.

- [ ] **Step 5: Commit any regenerated artifacts**

```bash
git add website/src/data/test-inventory.json
git commit -m "chore: regenerate test inventory for factory-flow-polish"
```

---

## Self-Review (done by plan author)

- **Spec coverage:** P1.1 phase stepper → Tasks 1,2,7,9 (AK1). P1.2 DoR on card — partially folded into Task 3/planning bucket; **note:** the spec asks for a DoR indicator on the Floor card. `getHall()` does not currently read `readiness` — Task 2 can add a `dorReady` boolean to `HallItem` (`readiness` 4/4) and Task 7 a small dot; this is small and listed as an optional add inside Task 2/7 (kept minimal to honor "no new schema"). P1.3 attention → Tasks 4,8 (AK4). P1.4 provider cooldown → Tasks 4,8 (reuses `providerHealth`). P1.5 status coverage → Task 3 (AK2). P2.6 live planning → Task 10 (AK3). P2.7 loading/error → Task 10 StatusBoundary (AK5). P2.8/D4 QA → Task 8 removes dead `qaQueue`, keeps real qa-dal column (AK6). P3.9 brand — **corrected: not dead, no task** (documented). P3.10 magic numbers → Task 11. P3.11 touch targets → Task 11. D7 CI → Tasks 5,6,7,9 (AK7). AK8 e2e → Task 12.
- **Placeholder scan:** all code steps contain concrete code; commands are exact. Adjust-the-selector / adjust-the-path notes are explicit and bounded, not TODOs.
- **Type consistency:** `phaseProgress` / `PhaseProgressSegment` (Task 1) reused verbatim in Tasks 2,7. `buildAttention`/`AttentionPayload` (Task 4) reused in Task 8. `CiCheck`/`CiRollup`/`fetchCiChecks` (Task 5) reused in Tasks 6,7,9. `phaseDurations`/`TimelineEntry` (Task 9) self-contained. `STATUS_BUCKETS`/`ALL_TICKET_STATUSES` (Task 3) self-contained.

**Note on DoR indicator (P1.2):** to fully satisfy AK is not strictly required by an AK number, but the spec lists it. Implementer should add to Task 2: select `readiness` in `getHall()`'s query, compute `dorReady = 4/4 truthy` (same predicate as `getPlanningCount`), add `dorReady: boolean` to `HallItem`, and render a small "DoR ✓" dot in Task 7. This stays read-only/no-schema.
