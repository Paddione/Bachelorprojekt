---
title: "Projekt-Cockpit — P2 API endpoints (cockpit/*)"
ticket_id: T000750
domains: [website, test]
status: active
pr_number: null
file_locks: [website/src/pages/api/admin/cockpit/portfolio.ts, website/src/pages/api/admin/cockpit/feature.ts, website/src/pages/api/admin/cockpit/reorder.ts, website/src/pages/api/admin/cockpit/reparent.ts, website/src/pages/api/admin/cockpit/batch.ts]
shared_changes: false
batch_id: cockpit-2026-06-15
parent_feature: projekt-cockpit
depends_on_plans: [docs/superpowers/plans/2026-06-15-cockpit-foundation.md]
---

# Projekt-Cockpit — P2 API

> **Batch:** `cockpit-2026-06-15` · Sub-Plan **2 von 4** · Master: `docs/superpowers/plans/2026-06-15-projekt-cockpit.md`
> **Abhängigkeit:** **P1 Foundation** (`cockpit-db.ts` + `cockpit-types.ts`). Branch/rebase auf `main` ERST nachdem P1 gemerged ist. Läuft **parallel zu P3 (Frontend)** — disjunkte Dateien (`api/admin/cockpit/*` vs. Komponenten).

**Goal:** Replace the flat `/admin/tickets` view with a brand-scoped, admin-gated **Projekt-Cockpit** that rolls up leaf-ticket progress per Feature/Produkt, offers two lenses (Überblick/Werkbank) and two modes (Karten/Tabelle), and supports inline / drawer / drag&drop / bulk editing — without growing the frozen `admin.ts` or `tickets.astro`.

**Architecture:** A new recursive-CTE view `tickets.v_cockpit_rollup` aggregates leaf counts per container; a pure DB module `cockpit-db.ts` queries it and reuses existing mutation helpers; five thin API routes under `api/admin/cockpit/` expose portfolio/feature/reorder/reparent/batch; a Svelte island (`Cockpit.svelte` + sub-components) backed by a pure `cockpitStore.ts` renders the UI; `cockpit.astro` does SSR auth + brand guard; `/admin/tickets` redirects into the cockpit's Tabelle mode. Backend/contract ships first so each stage leaves an independently-green state.

**Tech Stack:** Astro (SSR), Svelte islands, PostgreSQL 16 (recursive CTE views), Vitest (pg-mem with `vi.hoisted`), Playwright (`website` project), go-task quality gates (S1–S4 + freshness).

---

## Conventions used throughout this plan

- **All paths absolute** under the worktree root `/home/patrick/Bachelorprojekt/tmp/wt-projekt-cockpit/`. Commands assume `cd /home/patrick/Bachelorprojekt/tmp/wt-projekt-cockpit` first; the `website/` subdir is the pnpm workspace.
- **Brand guard (S3):** every endpoint resolves the brand via the established local const `const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';` and passes `BRAND()` into every query. **No `*.mentolder.de` / `*.korczewski.de` literals anywhere.** This matches `website/src/pages/api/admin/tickets/[id].ts`.
- **Auth guard:** `const session = await getSession(request.headers.get('cookie')); if (!session || !isAdmin(session)) return new Response(null, { status: 403 });` — `isAdmin` lives in `website/src/lib/auth.ts`.
- **S1 budgets (verified against `docs/code-quality/baseline.json` + `wc -l`):**
  - `website/src/lib/tickets/admin.ts` — Ist 677, **Baseline 677 → Budget 0. DO NOT TOUCH.** No cockpit logic here.
  - `website/src/pages/admin/tickets.astro` — Ist 359, **nicht-baselined → wirksame Schwelle = 400 (Astro), Budget 41.** Only a redirect change is allowed.
  - `website/src/lib/tickets-db.ts` — Ist **1094**, **baselined at 1106** (`S1:website/src/lib/tickets-db.ts`) → headroom **12 lines**. The ~55-line rollup view must therefore **NOT** be appended inline (1094 + 55 ≈ 1149 > 1106 → **S1 ratchet FAIL**). Instead the view DDL lives in a new module `tickets/cockpit-schema.ts`; `tickets-db.ts` gains only an import + a one-line `await ensureCockpitViews(pool)` call (→ ≤ 1096 ≤ 1106 ✓). Never hand-edit baseline.json.
  - All **new** `.ts` files: limit 600. New `.svelte`: limit 500. New `.astro`: limit 400. Plan keeps every new file with growth reserve under its limit; split into sub-components if any approaches ~80 %.
- **S2:** `cockpit-db.ts` imports only `pool`/`ensureSchemaOnce` from `website-db.ts` and existing helpers from `admin.ts` (type-only where possible) — **no imports from API routes or UI**. `cockpitStore.ts` imports nothing from DB/API/UI — pure store.
- **pg-mem DML tests** must mock the pool with `vi.hoisted(() => …)` before the test body (pattern: `website/src/pages/api/admin/ki/providers.test.ts`).
- **Migration (S4):** `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` mirrors the bootstrap view verbatim and is referenced both by the bootstrap (`tickets-db.ts`) and operationally applied to **both** brand DBs.

---

## Stage B — API endpoints (`cockpit/*`) (HTTP layer)

Five thin routes wrapping Stage A helpers. After Stage B, the full contract is reachable over HTTP and unit-tested. Each route ≤ ~150 lines (limit 400).

### Task 7: `GET /api/admin/cockpit/portfolio`

**Files:**
- Create: `website/src/pages/api/admin/cockpit/portfolio.ts`
- Test: `website/src/lib/tickets/__tests__/cockpit-api.test.ts`

- [x] **Step 1: Write the failing test**

Create `website/src/lib/tickets/__tests__/cockpit-api.test.ts`. Mock `../../auth` (`getSession`, `isAdmin`) and `../cockpit-db` with `vi.mock`, then import and invoke the route's `GET`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), isAdmin: vi.fn(),
  getPortfolio: vi.fn(),
}));
vi.mock('../../../lib/auth', () => ({ getSession: mocks.getSession, isAdmin: mocks.isAdmin }));
vi.mock('../../../lib/tickets/cockpit-db', () => ({ getPortfolio: mocks.getPortfolio }));

import { GET } from '../../../pages/api/admin/cockpit/portfolio';

const req = () => new Request('http://x/api/admin/cockpit/portfolio',
  { headers: { cookie: 'sid=1' } });

beforeEach(() => { vi.clearAllMocks(); process.env.BRAND_ID = 'mentolder'; });

describe('GET /cockpit/portfolio', () => {
  it('403 when not admin', async () => {
    mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(false);
    const res = await GET({ request: req() } as any);
    expect(res.status).toBe(403);
  });
  it('returns PortfolioPayload for admin', async () => {
    mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true);
    mocks.getPortfolio.mockResolvedValue({ products: [{ extId: 'p1', features: [] }] });
    const res = await GET({ request: req() } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products[0].extId).toBe('p1');
    expect(mocks.getPortfolio).toHaveBeenCalledWith('mentolder');
  });
});
```

- [x] **Step 2: Run it and verify it fails**

Run: `cd website && pnpm test -- cockpit-api.test.ts`
Expected: FAIL — route module does not exist.

- [x] **Step 3: Implement the route**

Create `website/src/pages/api/admin/cockpit/portfolio.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getPortfolio } from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  try {
    return json(await getPortfolio(BRAND()));
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
};
```

- [x] **Step 4: Run the test and verify it passes**

Run: `cd website && pnpm test -- cockpit-api.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/cockpit/portfolio.ts website/src/lib/tickets/__tests__/cockpit-api.test.ts
git commit -m "feat(cockpit): GET /api/admin/cockpit/portfolio"
```

---

### Task 8: `GET /api/admin/cockpit/feature`

**Files:**
- Create: `website/src/pages/api/admin/cockpit/feature.ts`
- Test: append to `website/src/lib/tickets/__tests__/cockpit-api.test.ts`

- [x] **Step 1: Write the failing test**

Append:

```typescript
const featureMocks = vi.hoisted(() => ({ getFeatureTickets: vi.fn() }));
vi.mock('../../../lib/tickets/cockpit-db', async (orig) => ({
  ...(await (orig as any)()),
  getFeatureTickets: featureMocks.getFeatureTickets,
}));
import { GET as FEATURE_GET } from '../../../pages/api/admin/cockpit/feature';

describe('GET /cockpit/feature', () => {
  const url = (id?: string) =>
    new URL(`http://x/api/admin/cockpit/feature${id ? `?id=${id}` : ''}`);
  const ctx = (id?: string) => ({
    request: new Request(url(id), { headers: { cookie: 'sid=1' } }),
    url: url(id),
  } as any);

  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });

  it('400 without id', async () => {
    const res = await FEATURE_GET(ctx());
    expect(res.status).toBe(400);
  });
  it('200 with FeatureTickets', async () => {
    featureMocks.getFeatureTickets.mockResolvedValue({ feature: { extId: 'f1' }, tickets: [] });
    const res = await FEATURE_GET(ctx('f1'));
    expect(res.status).toBe(200);
    expect((await res.json()).feature.extId).toBe('f1');
  });
  it('404 when not found', async () => {
    const err = new Error('not found'); err.name = 'NotFoundError';
    featureMocks.getFeatureTickets.mockRejectedValue(err);
    const res = await FEATURE_GET(ctx('zzz'));
    expect(res.status).toBe(404);
  });
});
```

- [x] **Step 2: Run it and verify it fails**

Run: `cd website && pnpm test -- cockpit-api.test.ts`
Expected: FAIL — `feature.ts` missing.

- [x] **Step 3: Implement the route**

Create `website/src/pages/api/admin/cockpit/feature.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getFeatureTickets, NotFoundError } from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  try {
    return json(await getFeatureTickets(BRAND(), id));
  } catch (e) {
    if (e instanceof NotFoundError || (e as Error).name === 'NotFoundError') {
      return json({ error: 'not found' }, 404);
    }
    return json({ error: String((e as Error).message) }, 500);
  }
};
```

- [x] **Step 4: Run + Step 5: Commit**

Run: `cd website && pnpm test -- cockpit-api.test.ts` → PASS.
```bash
git add website/src/pages/api/admin/cockpit/feature.ts website/src/lib/tickets/__tests__/cockpit-api.test.ts
git commit -m "feat(cockpit): GET /api/admin/cockpit/feature"
```

---

### Task 9: `POST /api/admin/cockpit/reorder`

**Files:**
- Create: `website/src/pages/api/admin/cockpit/reorder.ts`
- Test: append to `cockpit-api.test.ts`

- [x] **Step 1: Failing test** (append)

```typescript
const reorderMocks = vi.hoisted(() => ({ updatePlanningRanks: vi.fn() }));
vi.mock('../../../lib/tickets/cockpit-db', async (orig) => ({
  ...(await (orig as any)()), updatePlanningRanks: reorderMocks.updatePlanningRanks,
}));
import { POST as REORDER } from '../../../pages/api/admin/cockpit/reorder';

const post = (route: any, body: unknown) => route({
  request: new Request('http://x', { method: 'POST', headers: { cookie: 'sid=1' }, body: JSON.stringify(body) }),
} as any);

describe('POST /cockpit/reorder', () => {
  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });
  it('400 when updates missing', async () => {
    expect((await post(REORDER, {})).status).toBe(400);
  });
  it('200 ok on valid updates', async () => {
    reorderMocks.updatePlanningRanks.mockResolvedValue({ ok: true });
    const res = await post(REORDER, { updates: [{ ticketId: 'a', planningRank: 0 }] });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
```

- [x] **Step 2: Verify FAIL.** Run: `cd website && pnpm test -- cockpit-api.test.ts` → FAIL.

- [x] **Step 3: Implement**

Create `website/src/pages/api/admin/cockpit/reorder.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updatePlanningRanks, BrandMismatchError } from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  let body: { updates?: { ticketId: string; planningRank: number }[] };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const updates = body.updates;
  if (!Array.isArray(updates) || updates.length === 0) return json({ error: 'updates required' }, 400);
  if (updates.length > 100) return json({ error: 'too many updates' }, 400);
  try {
    await updatePlanningRanks(BRAND(), updates);
    return json({ ok: true, updated: updates.length });
  } catch (e) {
    if (e instanceof BrandMismatchError) return json({ error: 'cross-brand' }, 400);
    return json({ error: String((e as Error).message) }, 500);
  }
};
```

- [x] **Step 4: PASS + Step 5: Commit**

Run → PASS.
```bash
git add website/src/pages/api/admin/cockpit/reorder.ts website/src/lib/tickets/__tests__/cockpit-api.test.ts
git commit -m "feat(cockpit): POST /api/admin/cockpit/reorder"
```

---

### Task 10: `POST /api/admin/cockpit/reparent`

**Files:**
- Create: `website/src/pages/api/admin/cockpit/reparent.ts`
- Test: append to `cockpit-api.test.ts`

- [x] **Step 1: Failing test** (append)

```typescript
const reparentMocks = vi.hoisted(() => ({ reparentTicket: vi.fn() }));
vi.mock('../../../lib/tickets/cockpit-db', async (orig) => ({
  ...(await (orig as any)()), reparentTicket: reparentMocks.reparentTicket,
}));
import { POST as REPARENT } from '../../../pages/api/admin/cockpit/reparent';

describe('POST /cockpit/reparent', () => {
  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });
  it('400 without ticketId', async () => {
    expect((await post(REPARENT, { newParentId: 'p' })).status).toBe(400);
  });
  it('200 ok on success', async () => {
    reparentMocks.reparentTicket.mockResolvedValue({ ok: true });
    const res = await post(REPARENT, { ticketId: 't1', newParentId: 'f2' });
    expect(res.status).toBe(200);
  });
  it('400 on cycle', async () => {
    const err = new Error('cycle'); err.name = 'CycleError';
    reparentMocks.reparentTicket.mockRejectedValue(err);
    const res = await post(REPARENT, { ticketId: 't1', newParentId: 'f2' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cycle/i);
  });
});
```

- [x] **Step 2: Verify FAIL.**

- [x] **Step 3: Implement**

Create `website/src/pages/api/admin/cockpit/reparent.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { reparentTicket, CycleError, BrandMismatchError, NotFoundError }
  from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  let body: { ticketId?: string; newParentId?: string | null };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!body.ticketId) return json({ error: 'ticketId required' }, 400);
  const newParentId = body.newParentId ?? null;
  try {
    await reparentTicket(BRAND(), body.ticketId, newParentId);
    return json({ ok: true, ticketId: body.ticketId, newParentId });
  } catch (e) {
    const name = (e as Error).name;
    if (e instanceof CycleError || name === 'CycleError') return json({ error: 'cycle detected' }, 400);
    if (e instanceof BrandMismatchError || name === 'BrandMismatchError') return json({ error: 'cross-brand' }, 400);
    if (e instanceof NotFoundError || name === 'NotFoundError') return json({ error: 'not found' }, 404);
    return json({ error: String((e as Error).message) }, 500);
  }
};
```

- [x] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/pages/api/admin/cockpit/reparent.ts website/src/lib/tickets/__tests__/cockpit-api.test.ts
git commit -m "feat(cockpit): POST /api/admin/cockpit/reparent (cycle-guarded)"
```

---

### Task 11: `POST /api/admin/cockpit/batch`

**Files:**
- Create: `website/src/pages/api/admin/cockpit/batch.ts`
- Test: append to `cockpit-api.test.ts`

- [x] **Step 1: Failing test** (append)

```typescript
const batchMocks = vi.hoisted(() => ({ batchMutate: vi.fn() }));
vi.mock('../../../lib/tickets/cockpit-db', async (orig) => ({
  ...(await (orig as any)()), batchMutate: batchMocks.batchMutate,
}));
import { POST as BATCH } from '../../../pages/api/admin/cockpit/batch';

describe('POST /cockpit/batch', () => {
  beforeEach(() => { mocks.getSession.mockResolvedValue({ user: {} }); mocks.isAdmin.mockReturnValue(true); });
  it('400 when ticketIds empty', async () => {
    expect((await post(BATCH, { ticketIds: [], mutation: { status: 'done' } })).status).toBe(400);
  });
  it('200 with per-id results (partial failure tolerated)', async () => {
    batchMocks.batchMutate.mockResolvedValue({ ok: true, results: [
      { ticketId: 'a', success: true }, { ticketId: 'b', success: false, error: 'x' }] });
    const res = await post(BATCH, { ticketIds: ['a', 'b'], mutation: { status: 'done' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
  });
});
```

- [x] **Step 2: Verify FAIL.**

- [x] **Step 3: Implement**

Create `website/src/pages/api/admin/cockpit/batch.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { batchMutate, BrandMismatchError } from '../../../../lib/tickets/cockpit-db';
import type { BatchMutation } from '../../../../lib/tickets/cockpit-types';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  let body: { ticketIds?: string[]; mutation?: BatchMutation };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { ticketIds, mutation } = body;
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) return json({ error: 'ticketIds required' }, 400);
  if (ticketIds.length > 100) return json({ error: 'too many' }, 400);
  if (!mutation || Object.keys(mutation).length === 0) return json({ error: 'mutation required' }, 400);
  try {
    return json(await batchMutate(BRAND(), ticketIds, mutation));
  } catch (e) {
    if (e instanceof BrandMismatchError) return json({ error: 'cross-brand' }, 400);
    return json({ error: String((e as Error).message) }, 500);
  }
};
```

- [x] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/pages/api/admin/cockpit/batch.ts website/src/lib/tickets/__tests__/cockpit-api.test.ts
git commit -m "feat(cockpit): POST /api/admin/cockpit/batch"
```

---

### Task 12: Stage B gate check

- [x] **Step 1:** Run all cockpit unit tests + size check.

Run:
```bash
cd website && pnpm test -- "cockpit-api|cockpit-db|tickets-db"
for f in portfolio feature reorder reparent batch; do wc -l "src/pages/api/admin/cockpit/$f.ts"; done
```
Expected: all green; each route well under 400 lines.

- [x] **Step 2: Commit** any incidental changes (else skip).

```bash
git add -A && git commit -m "chore(cockpit): stage B gate" || echo "nothing to commit"
```

---


---

## Verification (scoped sub-plan gate)

This sub-plan merges independently — it must be green on its own.

- [x] Scoped unit tests: `cd website && pnpm test -- "cockpit"`
- [ ] `task test:all` → exit 0
- [ ] `task freshness:regenerate` then `task freshness:check` → exit 0 (S1–S4 ratchet incl. `tickets-db.ts` ≤ 1106, `admin.ts` = 677)
- [ ] If test files were added: `task test:inventory` + commit `website/src/data/test-inventory.json`
- [ ] Confirm only this sub-plan's `file_locks` files changed
