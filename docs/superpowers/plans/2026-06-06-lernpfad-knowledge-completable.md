---
title: Lernpfad & Agent-Anleitung — durchspielbar + sidekick-natives Nudging — Implementation Plan
ticket_id: T000457
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Lernpfad & Agent-Anleitung — durchspielbar + sidekick-natives Nudging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 28-item portal knowledge system end-to-end completable (note-saves never silently de-complete an item; summary never exceeds 100 %; the "weiter lernen" CTA actually opens the matching guide card) and surface a working, summary-driven nudge in the Sidekick that the dead onboarding funnel replaces.

**Architecture:** Three slices. (1) DML fixes in `learning-db.ts` (nullable `status` so note-only saves don't touch status/timestamps; canonical-ID-capped summary). (2) A cross-component `CustomEvent('sidekick:navigate', { detail: { view, jumpTo } })` channel: `loslernen.astro` dispatches it from an in-page CTA, `PortalSidekick.svelte` listens (opens drawer + sets view + forwards `jumpTo`), `AgentGuideView.svelte` consumes a new `jumpTo` prop via a `$effect` that calls its existing `jumpTo()` once after hydration+summary. (3) Summary-driven nudge: a fail-soft summary fetch in `PortalSidekick`, a FAB attention dot while `done < total`, a progress badge + banner in `SidekickHome`, a done-state card on `loslernen.astro` that posts an idempotent `learning-complete` milestone, and removal of the dead `portal-onboarding-sequence` trigger.

**Tech Stack:** Astro 6 + Svelte 5 (runes: `$state`/`$derived`/`$props`/`$effect`/`untrack`), PostgreSQL via `pg` (`pool` from `website-db.ts`), Vitest 4 + `pg-mem` for DML tests, Playwright for E2E. No schema migration; the 100 % milestone reuses `onboarding_state` with `step_id='learning-complete'`.

---

## Reality-vs-Spec deviations discovered during recon (read these first)

These differ from the spec's line/structure assumptions; the plan is written against the **actual** code:

1. **`upsertLearningItem` signature & SQL (spec said ~L.111-165).** Actual file `website/src/lib/learning-db.ts` L.111-165. The bug is `const newStatus = opts.status || 'todo';` (L.124) plus an `ON CONFLICT … DO UPDATE` that unconditionally sets `status = $5` and `completed_at = $8` (L.136-141). Fix per spec §1a: make `status` truly nullable end-to-end and branch the UPDATE on NULL.
2. **`getLearningSummary` (spec said ~L.167-194).** Actual L.167-194. Today it does **not** join against canonical IDs at all (counts every row for the user+brand). Fix per §1b: cap counts to the canonical `(item_type,item_id)` set.
3. **No `@testing-library/svelte` and no jsdom/browser vitest env exists.** `website/vitest.config.ts` runs in the default **node** environment; there are zero mounted-Svelte component tests in the repo. The established pattern (e.g. `poll-db.test.ts`) is to **extract pure decision logic into a `.ts` helper and unit-test that**, and cover DOM wiring with Playwright. Therefore the spec's "Svelte component tests" are realized as: (a) a new pure helper `website/src/lib/assistant/sidekick-nudge.ts` (banner decision + navigate-event payload validation) unit-tested in node, and (b) the Playwright E2E for the actual event→open→scroll wiring. This is called out as an open decision below.
4. **DML test harness (HOISTING TRAP — verified).** `learning-db.ts` imports `pool` as a module binding (`import { pool } from './website-db'`), unlike `coaching-db.ts` (param-injected). Tests therefore `vi.mock('./website-db')` to swap in a `pg-mem` pool. **The pg-mem pool must be built inside `vi.hoisted(() => …)`, not in a module-level `const`.** `vi.mock` is hoisted above every ESM import and module-level `const`; because the real test imports `learning-db` (which transitively imports `website-db`), the mock factory runs at collect time — so a factory closing over a top-level `const memPool = …` throws `ReferenceError: Cannot access 'memPool' before initialization` (TDZ) and fails the WHOLE DML suite (Tasks 1-3) before any test runs. This was **reproduced and verified empirically in this worktree**: the top-level-`const` form failed at collect with that exact error; the `vi.hoisted` form collected+ran cleanly. (This is the opposite of `content-effective.test.ts`, whose factory uses `orig` and references no outer variable — it is immune to the TDZ and is NOT a valid template here. `coaching-db.test.ts` sidesteps the problem entirely by param-injecting its pool, which `learning-db.ts` does not support.) `learning-db.ts` public signatures stay unchanged.
5. **Playwright project.** `/portal/loslernen` is auth-gated (redirects to login). Per `.claude/skills/references/dev-flow-gotchas.md` [T000418] the brand-targeted authenticated project is **`mentolder`** (uses `storageState: '.auth/mentolder-website-admin.json'`, runs against the live brand in `e2e.yml`). The new spec is named `fa-46-lernpfad-cta.spec.ts` (FA-46 is unused) and its glob `**/fa-46-*.spec.ts` is registered in the `mentolder` project. Because `E2E_ADMIN_PASS` can be absent (empty storageState), the spec must **skip gracefully** when unauthenticated — same defensive shape as the other content-hub mentolder specs.
6. **Guide totals confirmed:** 13 goals + 15 tools = **28** items, **8** themes (`agent-guide.generated.json`). domId format is `ag-goal-<id>` / `ag-tool-<id>`. UI must always read `total` from the live summary, never the literal 28.

---

## File Structure (what each touched file owns)

- `website/src/lib/learning-db.ts` — DML. Fix `upsertLearningItem` (nullable status) + `getLearningSummary` (canonical cap). Signatures unchanged.
- `website/src/lib/learning-db.test.ts` — **replace** placeholder contract tests with real `pg-mem`-backed DML tests.
- `website/src/lib/assistant/sidekick-nudge.ts` — **new** pure helpers: `decideBanner(summary)`, `parseNavigateEvent(detail)`, and `shouldShowLearnDot(summary, helpContext, hasNumericBadge)` (the FAB-dot predicate PortalSidekick derives from). No DOM, no fetch — unit-testable in node.
- `website/src/lib/assistant/sidekick-nudge.test.ts` — **new** Vitest unit tests for the three helpers.
- `website/src/components/assistant/AgentGuideView.svelte` — new optional `jumpTo` prop + a consume-once `$effect`; 100 % done-state in the progress block.
- `website/src/components/PortalSidekick.svelte` — `sidekick:navigate` window listener (register in `onMount`, remove in teardown), fail-soft summary fetch, FAB attention dot derived from the pure `shouldShowLearnDot` helper, forward `jumpTo` to `AgentGuideView`, pass `summary` to `SidekickHome`, and clear `pendingJump` on manual `navigate()` (stale-jump fix). Renders no banner of its own (that lives in `SidekickHome`).
- `website/src/components/assistant/SidekickHome.svelte` — new optional `summary` prop; progress badge on the "Agent-Anleitung"/"Lernpfad" rows; a banner above the list.
- `website/src/pages/portal/loslernen.astro` — replace the `arena?jumpTo=` `<a>` CTA with an in-page event button (`data-jump-domid`), add a `<script define:vars={{ done, total }}>` (repo convention) that dispatches `sidekick:navigate` and posts the `learning-complete` milestone once at 100 %, add a done-state card.
- `website/src/lib/assistant/triggers/portal.ts` — remove `portal-onboarding-sequence` trigger + `ONBOARDING_STEPS` + the now-unused `isOnboardingStepComplete` import.
- `tests/e2e/specs/fa-46-lernpfad-cta.spec.ts` — **new** Playwright E2E (mentolder project).
- `tests/e2e/playwright.config.ts` — register `**/fa-46-*.spec.ts` in the `mentolder` project.
- `website/src/data/test-inventory.json` — regenerated via `task test:inventory`.

---

## Pre-flight (run once at the start of execution)

- [ ] **Confirm branch + clean tree**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable && git branch --show-current && git status --porcelain
```
Expected: `feature/lernpfad-knowledge-completable` and an empty status (only the committed plan + spec present).

- [ ] **Ensure website deps are installed (fresh worktree may lack node_modules)** — [T000245]

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && [ -d node_modules ] || npm ci
```
Expected: `node_modules` present. (If `task test:all` later exits 128 once, re-run — transient, per [T000218].)

- [ ] **Verify pg-mem is available (the DML test harness depends on it)**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && node -e "require('pg-mem'); console.log('pg-mem OK')"
```
Expected: `pg-mem OK`.

---

## Task 1: DML — note-only save must not touch status/timestamps (`upsertLearningItem`)

**Files:**
- Modify: `website/src/lib/learning-db.ts` (`upsertLearningItem`, L.111-165)
- Test: `website/src/lib/learning-db.test.ts` (full replacement)

- [ ] **Step 1: Replace the placeholder test file with a real pg-mem harness + the first failing test**

Replace the entire contents of `website/src/lib/learning-db.test.ts` with:

```ts
// website/src/lib/learning-db.test.ts
// Real DML tests for learning-db.ts, backed by an in-memory Postgres (pg-mem).
// learning-db.ts imports `pool` from ./website-db as a MODULE BINDING, so we
// vi.mock('./website-db') and swap in a pg-mem pool.
//
// HOISTING TRAP (verified empirically — see Deviation #4): `vi.mock` is hoisted to
// the top of the file, ABOVE every ESM import and module-level `const`. If the mock
// factory closes over a module-level `const memPool = …`, the factory runs during
// the very first import of './website-db' (which happens transitively when
// `import * as learningDb from './learning-db'` is collected) — BEFORE the
// `const memPool` line has executed → `ReferenceError: Cannot access 'memPool'
// before initialization`, which fails the ENTIRE suite at collect time. The fix is
// to build the pool inside `vi.hoisted(() => …)`, which Vitest runs even earlier
// than the imports, and to read `memPool` back out of the hoisted result.
// (NOTE: do NOT model this on content-effective.test.ts — its factory uses `orig`
// and references no outer variable, so it never hits the TDZ; it is not a template
// for the module-binding case here.)

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
import type { Pool } from 'pg';

// ── Build the pg-mem pool inside vi.hoisted (runs before the ESM imports) ──────
// Everything the vi.mock factory needs must live here: pg-mem setup, the
// gen_random_uuid registration, the CREATE TABLEs, and the pool itself. Use
// require() inside the hoisted block — top-level ESM imports are NOT yet evaluated
// when this runs.
const { memPool } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { newDb, DataType } = require('pg-mem');
  const pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  pgmem.public.none(`
    CREATE TABLE learning_progress (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id TEXT NOT NULL,
      brand            TEXT NOT NULL DEFAULT 'mentolder',
      item_type        TEXT NOT NULL CHECK (item_type IN ('goal','tool')),
      item_id          TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'todo'
                         CHECK (status IN ('todo','in_progress','done')),
      note             TEXT,
      started_at       TIMESTAMPTZ,
      completed_at     TIMESTAMPTZ,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (keycloak_user_id, brand, item_type, item_id)
    );
    CREATE TABLE onboarding_state (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id TEXT NOT NULL,
      brand            TEXT NOT NULL DEFAULT 'mentolder',
      step_id          TEXT NOT NULL,
      completed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (keycloak_user_id, brand, step_id)
    );
  `);
  const { Pool: MemPool } = pgmem.adapters.createPg();
  return { memPool: new MemPool() as unknown as Pool };
});

// The factory reads `memPool` from the hoisted result — both are hoisted, so this
// is safe (no TDZ). Do NOT introduce a separate module-level `const` for memPool.
vi.mock('./website-db', () => ({ pool: memPool, platformPool: memPool }));

import * as learningDb from './learning-db';
import { goals, tools } from './agentGuide';

const USER = 'kc-user-1';
const BRAND = 'mentolder';
const GOAL_ID = goals[0].id;   // a real canonical goal id
const TOOL_ID = tools[0].id;   // a real canonical tool id

beforeEach(async () => {
  await memPool.query('TRUNCATE learning_progress');
  await memPool.query('TRUNCATE onboarding_state');
});

afterAll(async () => {
  await (memPool as unknown as { end(): Promise<void> }).end();
});

describe('upsertLearningItem — note-only save', () => {
  it('INSERT path: a note-only save on an empty table defaults to status=todo with null timestamps', async () => {
    // Spec-mandated INSERT default ($5-vs-$7 separation): a brand-new note-only row
    // must NOT inherit a status from $5 (which is NULL here) — it uses the INSERT-path
    // default 'todo' via $7, and leaves both timestamps null.
    const created = await learningDb.upsertLearningItem(USER, BRAND, 'goal', GOAL_ID, { note: 'x' });
    expect(created.status).toBe('todo');
    expect(created.startedAt).toBeNull();
    expect(created.completedAt).toBeNull();
    expect(created.note).toBe('x');
  });

  it('does NOT reset status or completed_at when saving a note on a done item', async () => {
    // Arrange: mark the goal done.
    const done = await learningDb.upsertLearningItem(USER, BRAND, 'goal', GOAL_ID, { status: 'done' });
    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
    const firstCompletedAt = done.completedAt;

    // Act: save a note WITHOUT a status (note-only).
    const afterNote = await learningDb.upsertLearningItem(USER, BRAND, 'goal', GOAL_ID, { note: 'Habe das gelernt' });

    // Assert: status + completed_at preserved; note written.
    expect(afterNote.status).toBe('done');
    expect(afterNote.completedAt).not.toBeNull();
    expect(afterNote.completedAt?.getTime()).toBe(firstCompletedAt?.getTime());
    expect(afterNote.note).toBe('Habe das gelernt');
  });
});
```

> **Harness verified empirically (2026-06-06):** the `vi.hoisted` pattern above was run in this worktree against a throwaway scratch test (`require('pg-mem')` inside the hoisted block, `vi.mock('./website-db')` reading `memPool` from the hoisted result, plus a real `import * as learningDb from './learning-db'`) — it COLLECTED and RAN cleanly (no `ReferenceError`). The OLD top-level-`const` pattern was also reproduced in the same worktree and FAILED the whole suite at collect time with exactly `ReferenceError: Cannot access 'memPool' before initialization`. Encode the `vi.hoisted` form verbatim.

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx vitest run src/lib/learning-db.test.ts -t "note-only save"
```
Expected: FAIL — the `does NOT reset…` case fails because `afterNote.status` is `'todo'` (the `opts.status || 'todo'` bug) and `completedAt` is `null`. (The `INSERT path…` case should already PASS against the old code, since a brand-new note-only row defaults to `'todo'` regardless; it is a regression guard for the new INSERT/UPDATE split.)

> **If you instead get `ReferenceError: Cannot access 'memPool' before initialization` (the whole suite fails to collect):** the test file regressed to the old top-level-`const` pattern. The fix is the `vi.hoisted` form in Step 1 — build the pg-mem pool inside `vi.hoisted(() => …)` and have the `vi.mock` factory read `memPool` from the hoisted result. Do NOT "fix" it by moving the pool inside `beforeAll`; the factory must see it at hoist time.

- [ ] **Step 3: Implement the nullable-status fix in `upsertLearningItem`**

In `website/src/lib/learning-db.ts`, replace the body from `const newStatus = opts.status || 'todo';` (L.124) through the end of the `pool.query(...)` call (L.163), i.e. replace L.124-163 with:

```ts
  // status may be undefined (note-only save) → preserve existing status/timestamps.
  const hasStatus = opts.status !== undefined;
  const statusParam = hasStatus ? opts.status! : null;     // $5 — NULL signals note-only
  const newNote = opts.note !== undefined ? opts.note : null;

  // INSERT-path defaults: a brand-new row with no explicit status is 'todo'.
  const now = new Date();
  const insertStatus = hasStatus ? opts.status! : 'todo';
  const insertStartedAt = insertStatus === 'todo' ? null : now;
  const insertCompletedAt = insertStatus === 'done' ? now : null;

  const result = await pool.query(
    `INSERT INTO learning_progress
       (keycloak_user_id, brand, item_type, item_id, status, note, started_at, completed_at, updated_at)
     VALUES ($1, $2, $3, $4, $7, $6, $8, $9, now())
     ON CONFLICT (keycloak_user_id, brand, item_type, item_id) DO UPDATE SET
       status = CASE WHEN $5::text IS NULL THEN learning_progress.status ELSE $5 END,
       note = COALESCE($6, learning_progress.note),
       started_at = CASE
                      WHEN $5::text IS NULL THEN learning_progress.started_at
                      WHEN $5 = 'todo' THEN learning_progress.started_at
                      ELSE COALESCE(learning_progress.started_at, now())
                    END,
       completed_at = CASE
                        WHEN $5::text IS NULL THEN learning_progress.completed_at
                        WHEN $5 = 'done' THEN COALESCE(learning_progress.completed_at, now())
                        ELSE NULL
                      END,
       updated_at = now()
     RETURNING
       id,
       keycloak_user_id AS "keycloakUserId",
       brand,
       item_type AS "itemType",
       item_id AS "itemId",
       status,
       note,
       started_at AS "startedAt",
       completed_at AS "completedAt",
       updated_at AS "updatedAt"`,
    [
      keycloakUserId,   // $1
      brand,            // $2
      itemType,         // $3
      itemId,           // $4
      statusParam,      // $5 — NULL on note-only; drives the UPDATE CASEs
      newNote,          // $6
      insertStatus,     // $7 — INSERT-path status (never NULL)
      insertStartedAt,  // $8 — INSERT-path started_at
      insertCompletedAt,// $9 — INSERT-path completed_at
    ]
  );
  return result.rows[0];
```

Notes baked into the target SQL:
- `$5` is the nullable status; on note-only it is `NULL` and every UPDATE column falls through to its existing value (except `note`/`updated_at`).
- On explicit `'done'`, `completed_at = COALESCE(existing, now())` keeps the **original** completion time sticky (spec §1a polish).
- On explicit `'todo'`/`'in_progress'`, `completed_at` is cleared/`NULL`; `started_at` stays sticky for non-todo via `COALESCE(existing, now())`, and is preserved on `'todo'`.
- The INSERT path uses separate params `$7/$8/$9` so a brand-new note-only row still defaults to `status='todo'` (spec §1a).

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx vitest run src/lib/learning-db.test.ts -t "note-only save"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/lib/learning-db.ts website/src/lib/learning-db.test.ts
git commit -m "fix(learning): note-only save no longer de-completes an item"
```

---

## Task 2: DML — status transitions keep timestamps correct & sticky

**Files:**
- Modify: `website/src/lib/learning-db.ts` (already fixed in Task 1 — this task only adds tests)
- Test: `website/src/lib/learning-db.test.ts` (append)

- [ ] **Step 1: Add the failing transition test**

Append to `website/src/lib/learning-db.test.ts`:

```ts
describe('upsertLearningItem — status transitions', () => {
  it('todo→in_progress→done→done preserves started_at and the first completed_at', async () => {
    const a = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'todo' });
    expect(a.status).toBe('todo');
    expect(a.startedAt).toBeNull();
    expect(a.completedAt).toBeNull();

    const b = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'in_progress' });
    expect(b.status).toBe('in_progress');
    expect(b.startedAt).not.toBeNull();      // started_at now set
    expect(b.completedAt).toBeNull();
    const startedAt = b.startedAt;

    const c = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'done' });
    expect(c.status).toBe('done');
    expect(c.startedAt?.getTime()).toBe(startedAt?.getTime());  // sticky
    expect(c.completedAt).not.toBeNull();
    const completedAt = c.completedAt;

    const d = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'done' });
    expect(d.completedAt?.getTime()).toBe(completedAt?.getTime()); // first completion sticky
    expect(d.startedAt?.getTime()).toBe(startedAt?.getTime());
  });

  it('done→todo clears completed_at but keeps started_at', async () => {
    await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'done' });
    const reverted = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'todo' });
    expect(reverted.status).toBe('todo');
    expect(reverted.completedAt).toBeNull();
    expect(reverted.startedAt).not.toBeNull();   // started_at stays sticky
  });

  it('preserves an existing note across a status-only toggle (note = COALESCE($6, …))', async () => {
    // Set a note first (note-only save).
    await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { note: 'meine Notiz' });
    // Toggle status WITHOUT passing a note → $6 is NULL → COALESCE keeps the old note.
    const afterToggle = await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'done' });
    expect(afterToggle.status).toBe('done');
    expect(afterToggle.note).toBe('meine Notiz');   // note survived the status-only update
  });

  it('rejects an item_id that is not in the canonical guide', async () => {
    await expect(
      learningDb.upsertLearningItem(USER, BRAND, 'goal', 'not-a-real-goal', { status: 'done' })
    ).rejects.toThrow(/not in agent-guide/);
  });
});
```

- [ ] **Step 2: Run to verify**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx vitest run src/lib/learning-db.test.ts -t "status transitions"
```
Expected: PASS (Task 1's SQL already implements this; these tests lock the behaviour in). If any assertion fails, the fix in Task 1 is wrong — debug there, do not weaken the test.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/lib/learning-db.test.ts
git commit -m "test(learning): lock status-transition + completed_at stickiness"
```

---

## Task 3: DML — `getLearningSummary` capped to canonical IDs (no done>total / pct>100)

**Files:**
- Modify: `website/src/lib/learning-db.ts` (`getLearningSummary`, L.167-194)
- Test: `website/src/lib/learning-db.test.ts` (append)

- [ ] **Step 1: Add the failing cap test (orphan row must not be counted)**

Append to `website/src/lib/learning-db.test.ts`:

```ts
describe('getLearningSummary — canonical cap', () => {
  it('never counts orphan (non-canonical) rows and never exceeds total/100%', async () => {
    // Insert a legitimately-done canonical item.
    await learningDb.upsertLearningItem(USER, BRAND, 'goal', GOAL_ID, { status: 'done' });

    // Inject an orphan 'done' row whose item_id is NOT in the canonical guide,
    // bypassing the upsert validation (simulates a removed item left behind).
    await memPool.query(
      `INSERT INTO learning_progress
         (keycloak_user_id, brand, item_type, item_id, status, started_at, completed_at)
       VALUES ($1, $2, 'goal', 'removed-legacy-goal', 'done', now(), now())`,
      [USER, BRAND]
    );

    const summary = await learningDb.getLearningSummary(USER, BRAND);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.done).toBe(1);                 // only the canonical one counts
    expect(summary.done).toBeLessThanOrEqual(summary.total);
    expect(summary.pct).toBeLessThanOrEqual(100);
    expect(summary.pct).toBe(Math.round((1 / summary.total) * 100));
  });

  it('counts a CANONICAL in_progress row but excludes an in_progress orphan', async () => {
    // Canonical in_progress item — MUST be counted.
    await learningDb.upsertLearningItem(USER, BRAND, 'tool', TOOL_ID, { status: 'in_progress' });
    // Orphan in_progress item (not in the guide) — MUST be excluded. Without the
    // canonical cap this orphan would push inProgress to 2 (real red→green: the old
    // uncapped code would fail the `=== 1` assertion).
    await memPool.query(
      `INSERT INTO learning_progress
         (keycloak_user_id, brand, item_type, item_id, status, started_at)
       VALUES ($1, $2, 'tool', 'removed-legacy-tool', 'in_progress', now())`,
      [USER, BRAND]
    );
    const summary = await learningDb.getLearningSummary(USER, BRAND);
    expect(summary.inProgress).toBe(1);   // only the canonical row, orphan excluded
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx vitest run src/lib/learning-db.test.ts -t "canonical cap"
```
Expected: FAIL — `done` is `2` (orphan counted) / `inProgress` is `1`, so `pct` can exceed 100.

- [ ] **Step 3: Implement the canonical cap in `getLearningSummary`**

In `website/src/lib/learning-db.ts`, replace the `getLearningSummary` query + count block (the `pool.query(...)` call at L.171-179 and the `const done`/`const inProgress` lines) with a version that filters on the canonical `(item_type, item_id)` pairs via a **parameterized** composite-key allow-list (no string interpolation of values). Replace L.171-185 with:

```ts
  // Canonical allow-list of "<type>::<id>" composite keys from the guide cache, so
  // orphan rows of removed items never inflate the counts. Passed as one text[] param
  // ($3) and matched against the row's composite key — fully parameterized, no inlining.
  const canonicalKeys = guideItemsCache.map(i => `${i.type}::${i.id}`);

  const result = await pool.query(
    `SELECT
       COUNT(CASE WHEN status = 'done' THEN 1 END)::int AS done,
       COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
       MAX(updated_at) AS last_activity
     FROM learning_progress
     WHERE keycloak_user_id = $1 AND brand = $2
       AND (item_type || '::' || item_id) = ANY($3::text[])`,
    [keycloakUserId, brand, canonicalKeys]
  );

  const row = result.rows[0];
  const total = getTotalGuideItems();
  const done = Math.min(row.done || 0, total);
  const inProgress = row.in_progress || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
```

Implementation note: the composite key `item_type || '::' || item_id` cannot collide because `item_type` is constrained to `goal`/`tool` (neither contains `::`). `= ANY($3::text[])` keeps the canonical list a single bound parameter (injection-safe, no inlining). The `Math.min(..., total)` / `Math.min(100, ...)` guards make the cap explicit even if a future canonical-set change lags the data. Verify `pg-mem` supports `= ANY($::text[])` — if a `pg-mem` limitation surfaces in Task 3 Step 4, fall back to a parameterized `IN ($3, $4, …)` list built from `canonicalKeys.map((_, i) => '$' + (i + 3))` comparing `(item_type || '::' || item_id)`.

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx vitest run src/lib/learning-db.test.ts
```
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/lib/learning-db.ts website/src/lib/learning-db.test.ts
git commit -m "fix(learning): cap summary counts to canonical guide ids (no done>total)"
```

---

## Task 4: Pure nudge helpers (`sidekick-nudge.ts`) — banner decision + event validation + FAB-dot predicate

**Files:**
- Create: `website/src/lib/assistant/sidekick-nudge.ts`
- Test: `website/src/lib/assistant/sidekick-nudge.test.ts`

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `website/src/lib/assistant/sidekick-nudge.test.ts`:

```ts
// Unit tests for the pure Sidekick-nudge helpers (no DOM, no fetch).
import { describe, it, expect } from 'vitest';
import { decideBanner, parseNavigateEvent, shouldShowLearnDot } from './sidekick-nudge';

describe('decideBanner', () => {
  it('returns null when summary is null (fail-soft: no banner)', () => {
    expect(decideBanner(null)).toBeNull();
  });
  it('returns null when total is 0 (no canonical items)', () => {
    expect(decideBanner({ done: 0, total: 0 })).toBeNull();
  });
  it('start state when done === 0', () => {
    expect(decideBanner({ done: 0, total: 28 })).toEqual({
      kind: 'start', label: 'Starte deinen Lernpfad', done: 0, total: 28, cta: true,
    });
  });
  it('continue state when 0 < done < total', () => {
    expect(decideBanner({ done: 7, total: 28 })).toEqual({
      kind: 'continue', label: 'Weiter lernen · 7/28', done: 7, total: 28, cta: true,
    });
  });
  it('done state when done === total (no CTA)', () => {
    expect(decideBanner({ done: 28, total: 28 })).toEqual({
      kind: 'done', label: '✓ Lernpfad abgeschlossen', done: 28, total: 28, cta: false,
    });
  });
});

describe('parseNavigateEvent', () => {
  it('returns null for non-object / missing detail', () => {
    expect(parseNavigateEvent(undefined)).toBeNull();
    expect(parseNavigateEvent(null)).toBeNull();
    expect(parseNavigateEvent('x')).toBeNull();
  });
  it('returns null for an unknown view', () => {
    expect(parseNavigateEvent({ view: 'nope', jumpTo: 'ag-goal-x' })).toBeNull();
  });
  it('accepts a known view and optional jumpTo', () => {
    expect(parseNavigateEvent({ view: 'agent-guide', jumpTo: 'ag-tool-superpowers' }))
      .toEqual({ view: 'agent-guide', jumpTo: 'ag-tool-superpowers' });
    expect(parseNavigateEvent({ view: 'home' }))
      .toEqual({ view: 'home', jumpTo: null });
  });
  it('coerces a non-string jumpTo to null', () => {
    expect(parseNavigateEvent({ view: 'agent-guide', jumpTo: 123 }))
      .toEqual({ view: 'agent-guide', jumpTo: null });
  });
});

describe('shouldShowLearnDot', () => {
  it('false outside the portal context', () => {
    expect(shouldShowLearnDot({ done: 1, total: 28 }, 'website', false)).toBe(false);
  });
  it('false when a numeric badge already occupies the FAB', () => {
    expect(shouldShowLearnDot({ done: 1, total: 28 }, 'portal', true)).toBe(false);
  });
  it('false (fail-soft) when summary is null', () => {
    expect(shouldShowLearnDot(null, 'portal', false)).toBe(false);
  });
  it('false when total is 0 (no canonical items)', () => {
    expect(shouldShowLearnDot({ done: 0, total: 0 }, 'portal', false)).toBe(false);
  });
  it('true when 0 <= done < total in the portal with no badge', () => {
    expect(shouldShowLearnDot({ done: 0, total: 28 }, 'portal', false)).toBe(true);
    expect(shouldShowLearnDot({ done: 7, total: 28 }, 'portal', false)).toBe(true);
  });
  it('false when everything is learned (done === total)', () => {
    expect(shouldShowLearnDot({ done: 28, total: 28 }, 'portal', false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx vitest run src/lib/assistant/sidekick-nudge.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `website/src/lib/assistant/sidekick-nudge.ts`:

```ts
// Pure decision logic for the summary-driven Sidekick nudge.
// No DOM, no fetch — kept here so it is unit-testable in the node vitest env.
// The Svelte components import and render these results; the cross-component
// DOM wiring is covered by Playwright (fa-46-lernpfad-cta.spec.ts).

export type SidekickView =
  | 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'agent-guide';

const KNOWN_VIEWS: ReadonlySet<string> = new Set([
  'home', 'support', 'questionnaire', 'help', 'tickets', 'inbox', 'agent-guide',
]);

export interface BannerInput { done: number; total: number; }
export interface BannerDecision {
  kind: 'start' | 'continue' | 'done';
  label: string;
  done: number;
  total: number;
  cta: boolean;       // false only for the done state
}

/** Decide the home-banner state from the learning summary. Fail-soft: null → no banner. */
export function decideBanner(summary: BannerInput | null): BannerDecision | null {
  if (!summary || summary.total <= 0) return null;
  const { done, total } = summary;
  if (done >= total) {
    return { kind: 'done', label: '✓ Lernpfad abgeschlossen', done, total, cta: false };
  }
  if (done <= 0) {
    return { kind: 'start', label: 'Starte deinen Lernpfad', done, total, cta: true };
  }
  return { kind: 'continue', label: `Weiter lernen · ${done}/${total}`, done, total, cta: true };
}

export interface NavigateIntent { view: SidekickView; jumpTo: string | null; }

/** Validate the detail of a `sidekick:navigate` CustomEvent. Returns null if invalid. */
export function parseNavigateEvent(detail: unknown): NavigateIntent | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as { view?: unknown; jumpTo?: unknown };
  if (typeof d.view !== 'string' || !KNOWN_VIEWS.has(d.view)) return null;
  const jumpTo = typeof d.jumpTo === 'string' ? d.jumpTo : null;
  return { view: d.view as SidekickView, jumpTo };
}

/**
 * Pure predicate for the FAB attention dot. The dot shows only in the portal
 * context, only when a summary loaded with canonical items left to learn
 * (`0 < done < total`), and only when no numeric badge already occupies the FAB
 * corner. PortalSidekick derives `showLearnDot` from this (plus its own `!open`).
 */
export function shouldShowLearnDot(
  summary: BannerInput | null,
  helpContext: string,
  hasNumericBadge: boolean,
): boolean {
  if (helpContext !== 'portal') return false;
  if (hasNumericBadge) return false;
  if (!summary || summary.total <= 0) return false;
  return summary.done < summary.total;
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx vitest run src/lib/assistant/sidekick-nudge.test.ts
```
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/lib/assistant/sidekick-nudge.ts website/src/lib/assistant/sidekick-nudge.test.ts
git commit -m "feat(sidekick): pure nudge helpers (banner decision + navigate parse + learn-dot predicate)"
```

---

## Task 5: `AgentGuideView` — consume a `jumpTo` prop once after hydration

**Files:**
- Modify: `website/src/components/assistant/AgentGuideView.svelte`

> No node-mountable test here (see deviation #3); behaviour is verified by the Playwright E2E in Task 9. This task implements the prop + consume-once `$effect` strictly following the existing `untrack` guard pattern.

- [ ] **Step 1: Add the `jumpTo` prop**

In `website/src/components/assistant/AgentGuideView.svelte`, the component currently has **no** `$props()` block (it is invoked as `<AgentGuideView />`). Add a props block immediately after the imports (between the `GuideMap` import on L.11 and the `lookup` const on L.14 — L.12 is blank and L.13 is the `// ── Cross-link lookup …` comment; insert the props line right after the GuideMap import, before that comment):

```svelte
  let { jumpTo: jumpToProp = null }: { jumpTo?: string | null } = $props();
```

- [ ] **Step 2: Add the consume-once `$effect`**

The component already has `hydrated` (`$state`, set true in `onMount`), `learningSummary` (`$state`, loaded by `refreshSummary()` in `onMount`), `untrack` (imported), and a `jumpTo(domId)` function (L.196-210). Add a tracking guard + effect. Insert this guard declaration right after the `let learningSummary = $state<LearningSummary | null>(null);` line (L.45):

```svelte
  let consumedJump = $state<string | null>(null);
```

Then add this `$effect` immediately after the search-force-open `$effect` block (after its closing `});` at L.172):

```svelte
  // Cross-component deep-link: when PortalSidekick forwards a `jumpTo` prop, open +
  // scroll the matching card ONCE — only after hydration AND after the summary load
  // (so the card's learned-state is rendered before we scroll). The consumedJump guard
  // + untrack writes mirror the search-force-open effect so this can never re-trigger.
  $effect(() => {
    if (!hydrated) return;
    if (!jumpToProp) return;
    if (learningSummary === null) return;           // wait for summary so the card is fully rendered
    if (jumpToProp === untrack(() => consumedJump)) return;
    const target = jumpToProp;
    untrack(() => { consumedJump = target; });
    jumpTo(target);
  });
```

- [ ] **Step 3: Add the 100 %-done state in the progress block**

In the same file, the progress block (L.229-236) renders `{learningSummary.pct}% — {learningSummary.done}/{learningSummary.total} erledigt`. Replace the `<span class="ag-progress-value">…</span>` line (L.234) with a conditional done-state:

```svelte
        {#if learningSummary.total > 0 && learningSummary.done >= learningSummary.total}
          <span class="ag-progress-value ag-progress-done">🎉 Alle {learningSummary.total} gelernt</span>
        {:else}
          <span class="ag-progress-value">{learningSummary.pct}% — {learningSummary.done}/{learningSummary.total} erledigt</span>
        {/if}
```

Add the style for the new done-state class. **Pre-resolved during recon:** `AgentGuideView.svelte` has **no `<style>` block** and the `.ag-progress-*` classes are global/unstyled (they come from a parent stylesheet, not a scoped block in this file). So: add a NEW `<style>` block at the very end of `AgentGuideView.svelte` containing just:

```svelte
<style>
  .ag-progress-done { color: var(--brass, #b8860b); font-weight: 600; }
</style>
```

(Svelte will scope it to this component, which is exactly what we want for the new class.)

- [ ] **Step 4: Verify it type-checks / builds**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx astro check 2>&1 | grep -iE "AgentGuideView|error" | head
```
Expected: no errors referencing `AgentGuideView.svelte`. (Astro check may emit pre-existing warnings elsewhere — only the AgentGuideView lines matter here.)

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/components/assistant/AgentGuideView.svelte
git commit -m "feat(agent-guide): consume jumpTo prop once + 100% done state"
```

---

## Task 6: `PortalSidekick` — navigate listener, fail-soft summary, FAB dot, prop forwarding

**Files:**
- Modify: `website/src/components/PortalSidekick.svelte`

- [ ] **Step 1: Import the helpers + add state**

In `website/src/components/PortalSidekick.svelte`, after the `import AgentGuideView` line (L.10) add:

```svelte
  import { parseNavigateEvent, shouldShowLearnDot } from '../lib/assistant/sidekick-nudge';
```

> **Note:** PortalSidekick does NOT import `decideBanner` and does NOT derive a `banner`. PortalSidekick renders no banner — it only forwards the `summary` prop to `SidekickHome` (which owns and derives its own banner via `decideBanner`) and renders the FAB attention dot. The dot's visibility comes entirely from the pure `shouldShowLearnDot` helper (extracted in Task 4) so it stays unit-tested rather than inline-duplicated.

After `let isMobile = $state(false);` (L.28) add:

```svelte
  // Summary-driven nudge (fail-soft: stays null if the fetch fails → no badge/dot).
  let learningSummary = $state<{ done: number; total: number; pct: number } | null>(null);
  let pendingJump = $state<string | null>(null);
  // FAB attention dot: derive from the pure helper + the local drawer-open state.
  // hasNumericBadge mirrors the FAB badge condition so the dot never doubles up with a count.
  const showLearnDot = $derived(
    !open &&
    shouldShowLearnDot(
      learningSummary,
      helpContext,
      pendingQuestionnaires > 0 || pendingTickets > 0 || inboxPending > 0,
    )
  );
```

- [ ] **Step 2: Fetch the summary fail-soft in the existing identity `$effect`**

Inside the existing identity `$effect` (the async IIFE at L.63-103), after the `if (!data.authenticated) return;` line (L.71), add a fail-soft summary fetch (it must not block, and must not abort the rest on error):

```svelte
        try {
          const sRes = await fetch('/api/portal/learning/summary');
          if (sRes.ok) {
            const s = await sRes.json() as { done?: number; total?: number; pct?: number };
            learningSummary = { done: s.done ?? 0, total: s.total ?? 0, pct: s.pct ?? 0 };
          }
        } catch { /* fail-soft: no badge/banner */ }
```

Also refresh on the existing `learning:updated` event so the FAB dot/banner update live after a card toggle. Add a dedicated `$effect` after the identity effect (after L.103):

```svelte
  $effect(() => {
    const refresh = async () => {
      try {
        const r = await fetch('/api/portal/learning/summary');
        if (r.ok) {
          const s = await r.json() as { done?: number; total?: number; pct?: number };
          learningSummary = { done: s.done ?? 0, total: s.total ?? 0, pct: s.pct ?? 0 };
        }
      } catch { /* fail-soft */ }
    };
    window.addEventListener('learning:updated', refresh);
    return () => window.removeEventListener('learning:updated', refresh);
  });
```

- [ ] **Step 3: Add the `sidekick:navigate` window listener (register + teardown)**

Add a new `$effect` after the resize `$effect` (after L.57). It must register in setup and remove in the returned teardown:

```svelte
  $effect(() => {
    const onNavigate = (e: Event) => {
      const intent = parseNavigateEvent((e as CustomEvent).detail);
      if (!intent) return;                       // defensive: ignore unknown/invalid
      open = true;
      view = intent.view;
      pendingJump = intent.jumpTo;
    };
    window.addEventListener('sidekick:navigate', onNavigate);
    return () => window.removeEventListener('sidekick:navigate', onNavigate);
  });
```

- [ ] **Step 4: Clear `pendingJump` on manual navigation (stale-jump UX bug fix)**

`AgentGuideView` lives inside `{#if view === 'agent-guide'}`, so it is **unmounted and re-mounted on every view switch** — its `consumedJump` guard resets to `null` each time. Without this fix the following sequence force-scrolls unexpectedly: user clicks a CTA → jumps to card A (consumed); navigates Home; then **manually** opens the "Agent-Anleitung" row. The manual open re-mounts `AgentGuideView` with the still-set `jumpToProp='ag-…-A'` and a fresh `consumedJump=null` → its `$effect` re-fires and scrolls to A again, even though the user just wanted to browse.

Fix: only the CTA window-event should set `pendingJump`; manual navigation must clear it. Update the existing manual-navigation handler `navigate` (`function navigate(v: View) { view = v; }` at L.108) to also null `pendingJump`:

```svelte
  function navigate(v: View) { pendingJump = null; view = v; }
```

(The `onNavigate` window-event path in Step 3 still sets `pendingJump`; this only affects `SidekickHome`'s manual row taps, which route through `navigate`.)

- [ ] **Step 5: Forward `pendingJump` to `AgentGuideView` and pass `summary` to `SidekickHome`**

Replace the `<AgentGuideView />` line (L.197) with:

```svelte
      <AgentGuideView jumpTo={pendingJump} />
```

Replace the `<SidekickHome ... />` block (L.182-189) so it also receives the summary:

```svelte
      <SidekickHome
        onNavigate={navigate}
        {pendingQuestionnaires}
        {helpSection}
        {helpContext}
        {pendingTickets}
        pendingInbox={inboxPending}
        summary={learningSummary}
      />
```

- [ ] **Step 6: Render the FAB attention dot**

Inside the FAB `<button>` (L.126-146), the badge currently renders for questionnaires/tickets/inbox (L.133-135). Add a learning attention dot. The `showLearnDot` derivation already folds in `!open` and the no-numeric-badge condition (via `shouldShowLearnDot`), so the template guard is simply `{#if showLearnDot}`. Insert right after the closing `{/if}` of the existing badge block (after L.135):

```svelte
  {#if showLearnDot}
    <span class="fab-dot" aria-hidden="true"></span>
  {/if}
```

Add the dot style inside the `<style>` block (after the `.fab-badge { … }` rule, around L.259):

```css
  .fab-dot {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: oklch(0.83 0.09 75);
    box-shadow: 0 0 0 2px #0f1623;
    pointer-events: none;
  }
```

- [ ] **Step 7: Verify it builds**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx astro check 2>&1 | grep -iE "PortalSidekick|error" | head
```
Expected: no errors referencing `PortalSidekick.svelte`.

- [ ] **Step 8: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/components/PortalSidekick.svelte
git commit -m "feat(sidekick): navigate listener + fail-soft summary + FAB learn dot"
```

---

## Task 7: `SidekickHome` — progress badge on rows + banner above the list

**Files:**
- Modify: `website/src/components/assistant/SidekickHome.svelte`

- [ ] **Step 1: Accept a `summary` prop + derive the banner**

In `website/src/components/assistant/SidekickHome.svelte`, extend the `$props()` block (L.4-18). Add `summary` to the destructure and the type:

```svelte
  import { decideBanner, type BannerDecision } from '../../lib/assistant/sidekick-nudge';

  let {
    onNavigate,
    pendingQuestionnaires = 0,
    helpSection = '',
    helpContext = 'portal',
    pendingTickets = 0,
    pendingInbox = 0,
    summary = null,
  }: {
    onNavigate: (view: View) => void;
    pendingQuestionnaires?: number;
    helpSection?: string;
    helpContext?: string;
    pendingTickets?: number;
    pendingInbox?: number;
    summary?: { done: number; total: number; pct: number } | null;
  } = $props();

  const banner = $derived<BannerDecision | null>(decideBanner(summary));
  const progressSub = $derived(
    summary && summary.total > 0 ? `${summary.done}/${summary.total} gelernt` : null
  );
```

(The `import` line goes at the very top of the `<script>` block, above the existing `type View` line on L.2.)

- [ ] **Step 2: Add a per-row progress sub-label for the learning rows**

The `items` list (L.24-32) has rows `agent-guide` ("Agent-Anleitung") and `loslernen` ("Lernpfad"). Add the live `done/total` sub to both by replacing their `sub` strings. Replace the `agent-guide` and `loslernen` entries (L.29-30) with:

```svelte
    { id: 'agent-guide',   no: isAdmin ? '05' : '03', title: 'Agent-Anleitung', sub: progressSub ? `Lernen · ${progressSub}` : 'Lernen, wie alles funktioniert', show: true },
    { id: 'loslernen',     no: isAdmin ? '06' : '04', title: 'Lernpfad',     sub: progressSub ?? 'Fortschritt verfolgen',            show: true, href: '/portal/loslernen' },
```

(Note: `items` is `$derived`, and `progressSub` is `$derived` — referencing it inside makes the rows reactive to summary updates. `total` is always the live summary value, never the literal 28.)

- [ ] **Step 3: Render the banner above the list**

Insert the banner block between the intro `</div>` (end of `.sk-intro`, L.48) and the `<div class="sk-list" ...>` opening (L.51):

```svelte
  {#if banner}
    {#if banner.cta}
      <button type="button" class="sk-banner sk-banner--{banner.kind}" onclick={() => onNavigate('agent-guide')}>
        <span class="sk-banner-label">{banner.label}</span>
        <span class="sk-banner-arrow" aria-hidden="true">→</span>
      </button>
    {:else}
      <div class="sk-banner sk-banner--done" role="status">
        <span class="sk-banner-label">{banner.label}</span>
      </div>
    {/if}
  {/if}
```

- [ ] **Step 4: Add banner styles**

Append inside the `<style>` block (before its closing `</style>`, after the `.sk-arrow--active` rule):

```css
  .sk-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: calc(100% - 44px);
    margin: 4px 22px 0;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid var(--brass, #b8860b);
    background: oklch(0.80 0.09 75 / 0.08);
    color: var(--fg);
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    transition: background 180ms var(--ease-out, ease);
  }
  .sk-banner:hover { background: oklch(0.80 0.09 75 / 0.16); }
  .sk-banner--done { cursor: default; opacity: 0.85; }
  .sk-banner-label { font-family: var(--serif); }
  .sk-banner-arrow { color: var(--brass, #b8860b); }
  @media (max-width: 480px) { .sk-banner { width: calc(100% - 36px); margin: 4px 18px 0; } }
```

- [ ] **Step 5: Verify it builds**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx astro check 2>&1 | grep -iE "SidekickHome|error" | head
```
Expected: no errors referencing `SidekickHome.svelte`.

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/components/assistant/SidekickHome.svelte
git commit -m "feat(sidekick-home): progress badge on learn rows + summary banner"
```

---

## Task 8: `loslernen.astro` — in-page CTA, done-state card, idempotent milestone

**Files:**
- Modify: `website/src/pages/portal/loslernen.astro`

- [ ] **Step 1: Replace the dead arena CTA with an in-page event button**

In `website/src/pages/portal/loslernen.astro`, replace the `<a href={`/portal/arena?jumpTo=${item.id}`} …>weiter lernen →</a>` block (L.102-108) with a button that carries the canonical domId. The domId prefix depends on the item type (`goal`/`tool`):

```astro
                    <button
                      type="button"
                      class="lp-cta"
                      data-testid="weiter-lernen"
                      data-jump-domid={`ag-${item.type}-${item.id}`}
                    >
                      weiter lernen →
                    </button>
```

(`.lp-cta` is currently styled as an `<a>`; the existing `.lp-cta` CSS rules apply to the `<button>` too. Add `border: 1px solid var(--brass, #b8860b); background: transparent; cursor: pointer; font: inherit;` defensively to the `.lp-cta` rule at L.242 if button defaults bleed through — verify visually, otherwise leave as-is.)

- [ ] **Step 2: Add a done-state "Geschafft" card above the groups**

Insert this block immediately after the `</header>` (L.76) and before `<div class="lp-groups">` (L.78):

```astro
    {summary.total > 0 && summary.done >= summary.total && (
      <section class="lp-done-card" data-testid="lernpfad-done">
        <span class="lp-done-emoji" aria-hidden="true">🎉</span>
        <div>
          <h2 class="lp-done-title">Geschafft</h2>
          <p class="lp-done-text">Du hast alle {summary.total} Bausteine gelernt.</p>
        </div>
      </section>
    )}
```

- [ ] **Step 3: Add the inline module script (event dispatch + milestone POST)**

Insert a `<script>` block immediately before the closing `</PortalLayout>` (L.118). Use the repo's Astro convention — a bare `<script define:vars={{ … }}>` (NO `type="module"`, NO `is:inline`; matches `src/pages/poll/[id].astro`, `admin/projekte/[id].astro`, `admin/fragebogen/[assignmentId].astro`, `admin/tickets/[id].astro`). It (a) wires the CTA buttons to dispatch `sidekick:navigate`, and (b) posts the `learning-complete` milestone exactly once when the server-rendered summary is already at 100 %:

```astro
  <script define:vars={{ done: summary.done, total: summary.total }}>
    // (a) In-page CTA → open the Sidekick on the Agent-Anleitung + scroll the card.
    document.querySelectorAll('[data-jump-domid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const jumpTo = btn.getAttribute('data-jump-domid');
        window.dispatchEvent(new CustomEvent('sidekick:navigate', {
          detail: { view: 'agent-guide', jumpTo },
        }));
      });
    });

    // (b) Idempotent 100% milestone (fail-soft; never blocks the page).
    if (total > 0 && done >= total) {
      fetch('/api/portal/onboarding/mark-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: 'learning-complete' }),
      }).catch(() => { /* fail-soft */ });
    }
  </script>
```

- [ ] **Step 4: Add done-card styles**

Append inside the `<style>` block (before `</style>`, after the `.lp-cta:hover` rule):

```css
  .lp-done-card {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
    padding: 20px 24px;
    border-radius: 10px;
    border: 1px solid var(--brass, #b8860b);
    background: oklch(0.80 0.09 75 / 0.10);
  }
  .lp-done-emoji { font-size: 32px; }
  .lp-done-title { margin: 0 0 2px; font-size: 18px; font-weight: 600; }
  .lp-done-text { margin: 0; font-size: 14px; color: var(--fg-soft, #64748b); }
```

- [ ] **Step 5: Verify it builds**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx astro check 2>&1 | grep -iE "loslernen|error" | head
```
Expected: no errors referencing `loslernen.astro`.

> **Executor verify note — hydration race (no code change expected).** The CTA dispatches `sidekick:navigate` on a `window` `CustomEvent`; `PortalSidekick` registers its `sidekick:navigate` listener inside an `onMount`-time `$effect` (Task 6 Step 3). If a user clicks a CTA *before* PortalSidekick has hydrated and registered, the event fires into the void and the Sidekick does not open. When manually verifying (or if the Playwright spec is flaky on the first click), confirm that a click **immediately after page load** still opens the Sidekick. If it is flaky, the listener-registration timing is the root cause — but this is a verify-only note: do **not** add code here speculatively. (The CustomEvent + window-listener channel is the agreed design; only revisit if a real race is observed.)

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/pages/portal/loslernen.astro
git commit -m "feat(lernpfad): in-page CTA via sidekick:navigate + done card + milestone"
```

---

## Task 9: Remove the dead `portal-onboarding-sequence` trigger

**Files:**
- Modify: `website/src/lib/assistant/triggers/portal.ts`

- [ ] **Step 1: Remove the trigger, the constant, and the now-unused import**

In `website/src/lib/assistant/triggers/portal.ts`:
1. Delete the import on L.11: `import { isOnboardingStepComplete } from '../../learning-db';` (confirmed used only by the trigger being removed — `grep` showed no other importer).
2. Delete the `ONBOARDING_STEPS` constant (L.216-244) and the entire `registerTrigger({ id: 'portal-onboarding-sequence', … })` block (L.246-285), including the explanatory comment block above it (L.211-215).

Leave triggers 1-6 (`portal-first-login`, `portal-signature-pending`, `portal-session-24h`, `portal-session-1h`, `portal-new-coach-message`, `portal-fragebogen-open`) and the `listFirstSeenAt`/`recordFirstSeen` import (still used by `portal-first-login`) untouched.

- [ ] **Step 2: Verify no dangling reference + it builds**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && grep -n "ONBOARDING_STEPS\|portal-onboarding-sequence\|isOnboardingStepComplete" src/lib/assistant/triggers/portal.ts; echo "---"; npx astro check 2>&1 | grep -iE "triggers/portal|error" | head
```
Expected: first grep prints nothing; astro check shows no errors referencing `triggers/portal.ts`.

- [ ] **Step 3: Run the existing assistant/trigger test suite (regression guard)**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx vitest run src/lib/assistant 2>&1 | tail -20
```
Expected: PASS (or "no test files" for triggers — the new `sidekick-nudge.test.ts` must pass). No reference errors.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/lib/assistant/triggers/portal.ts
git commit -m "refactor(triggers): remove dead portal-onboarding-sequence funnel"
```

---

## Task 10: Playwright E2E — Lernpfad CTA opens the Sidekick on the matching card

**Files:**
- Create: `tests/e2e/specs/fa-46-lernpfad-cta.spec.ts`
- Modify: `tests/e2e/playwright.config.ts` (register the glob in the `mentolder` project)

> Project = `mentolder` (authenticated, brand-targeted) per dev-flow-gotchas [T000418]. The spec must skip gracefully when the session is empty (`E2E_ADMIN_PASS` absent → empty storageState).

- [ ] **Step 1: Register the new glob in the `mentolder` project**

In `tests/e2e/playwright.config.ts`, the `mentolder` project's `testMatch` array (the block with `name: 'mentolder'`, `dependencies: ['mentolder-setup']`). Add `'**/fa-46-*.spec.ts',` as the first element of its `testMatch` array (right after the opening `[`):

```ts
      testMatch: [
        '**/fa-46-*.spec.ts',
        '**/fa-45-*.spec.ts',
        '**/nfa-infra-health-sweep.spec.ts',
        '**/sa-15-*.spec.ts',
        '**/fa-content-hub-price-ssot.spec.ts',
        '**/fa-content-hub-editability.spec.ts',
        '**/fa-content-hub-legal-ssot.spec.ts',
        '**/fa-content-hub-editor.spec.ts',
        '**/fa-content-hub-versioning.spec.ts',
        '**/fa-content-hub-service-consolidation.spec.ts',
      ],
```

- [ ] **Step 2: Write the failing E2E spec**

Create `tests/e2e/specs/fa-46-lernpfad-cta.spec.ts`:

```ts
/**
 * FA-46 — Lernpfad CTA durchspielbar.
 * Klick auf „weiter lernen →" auf /portal/loslernen öffnet den Sidekick auf der
 * Agent-Anleitung und scrollt/expandiert genau die zugehörige Karte (ag-<type>-<id>).
 * /portal/arena?jumpTo= wird NICHT mehr verlinkt.
 *
 * Runs in the authenticated `mentolder` project (storageState). Skips gracefully
 * when the session is empty (E2E_ADMIN_PASS absent → no auth cookie).
 */
import { test, expect } from '@playwright/test';

test.describe('FA-46 Lernpfad CTA', () => {
  test('weiter-lernen öffnet den Sidekick und expandiert die passende Karte', async ({ page }) => {
    const resp = await page.goto('/portal/loslernen');
    // If unauthenticated, the portal redirects to login → skip (no seeded session).
    if (!page.url().includes('/portal/loslernen')) {
      test.skip(true, 'no authenticated session (E2E_ADMIN_PASS not set)');
      return;
    }
    expect(resp?.status()).toBeLessThan(400);

    // The dead arena deep-link must be gone.
    await expect(page.locator('a[href*="/portal/arena?jumpTo="]')).toHaveCount(0);

    // Grab the first CTA + its target domId.
    const cta = page.locator('[data-testid="weiter-lernen"]').first();
    await expect(cta).toBeVisible();
    const domId = await cta.getAttribute('data-jump-domid');
    expect(domId).toBeTruthy();

    // Click → Sidekick opens on the Agent-Anleitung, the matching card expands + scrolls.
    await cta.click();
    await expect(page.locator('.sk-title')).toContainText('Agent-Anleitung', { timeout: 5_000 });
    const target = page.locator(`#${domId}`);
    await expect(target).toBeInViewport({ timeout: 5_000 });
    await expect(target.locator('.ag-card-head')).toHaveAttribute('aria-expanded', 'true');
  });

  test('Banner führt in die Agent-Anleitung', async ({ page }) => {
    await page.goto('/portal/loslernen');
    if (!page.url().includes('/portal/loslernen')) {
      test.skip(true, 'no authenticated session');
      return;
    }
    // Open the Sidekick via its FAB; the home banner (start/continue) routes to agent-guide.
    await page.locator('.fab').click();
    const banner = page.locator('.sk-banner');
    if (await banner.count()) {
      if (await banner.evaluate((el) => el.tagName === 'BUTTON')) {
        await banner.click();
        await expect(page.locator('.sk-title')).toContainText('Agent-Anleitung', { timeout: 5_000 });
      }
    }
  });
});
```

> Selector check: the Sidekick header title uses `.sk-title` (same selector the existing `agent-guide-walkthrough.spec.ts` asserts on L.15). The card head + `aria-expanded` come from `GuideCard.svelte`. The FAB is `.fab`, the banner is `.sk-banner` (Task 7). If `.sk-title` does not exist, grep `tests/e2e/lib/agent-guide.ts` for the actual title selector and adjust.

- [ ] **Step 3: Run the spec offline-aware (it skips without a live target — that is expected locally)**

Run (against a local dev server if available; otherwise it skips/redirects, which is acceptable for the offline gate):
```bash
cd /tmp/wt-lernpfad-knowledge-completable/tests/e2e && [ -d node_modules ] || npm ci
./node_modules/.bin/playwright test --project=mentolder fa-46-lernpfad-cta.spec.ts --list
```
Expected: the two tests are **listed** under the `mentolder` project (proves glob registration + project assignment are correct). Full execution requires a deployed brand (nightly `e2e.yml`); the listing is the local gate.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add tests/e2e/specs/fa-46-lernpfad-cta.spec.ts tests/e2e/playwright.config.ts
git commit -m "test(e2e): FA-46 Lernpfad CTA opens sidekick on matching card"
```

---

## Task 11: Regenerate the test inventory (CI hard requirement)

**Files:**
- Modify: `website/src/data/test-inventory.json`

> CI re-runs `task test:inventory` and **fails** if the committed JSON differs (see CLAUDE.md "Test inventory check"). The new FA-46 spec must land in the inventory.

- [ ] **Step 1: Regenerate**

Run (from worktree root):
```bash
cd /tmp/wt-lernpfad-knowledge-completable && task test:inventory
```
Expected: `Wrote N inventory entries to …/test-inventory.json`.

- [ ] **Step 2: Verify FA-46 is present**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable && grep -c "fa-46-lernpfad-cta" website/src/data/test-inventory.json
```
Expected: `1` (or more).

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git add website/src/data/test-inventory.json
git commit -m "chore(test): regenerate test-inventory for FA-46"
```

---

## Task 12: Full local verification (must be green before PR)

> Reproduce the full offline CI locally — not just the touched subtasks (memory: "Reproduce full CI locally before pushing"). Beware transient exit 128 on first run in a fresh worktree ([T000218]) — re-run once if so.
>
> **These are TWO independent CI gates — neither subsumes the other; both must be green:**
> 1. **Website Vitest gate** (Step 1, `npm --prefix website run test:unit`) — its own CI job in `ci.yml`. This is the ONLY gate that runs `learning-db.test.ts` / `sidekick-nudge.test.ts`.
> 2. **Offline gate** (Step 3, `task test:all`) — a SEPARATE CI job. Its subtasks are BATS / kustomize-manifests / factory / dry-run / docs-gen / agent-guide / code-quality. **`task test:all` does NOT run the website Vitest suite** — do not assume running it covers Steps 1–2.

- [ ] **Step 1: Run the website unit tests (the Website-Vitest gate)**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npm run test:unit 2>&1 | tail -25
```
Expected: all website test files PASS, including `learning-db.test.ts` and `sidekick-nudge.test.ts`. This is the standalone Website-Vitest gate (`ci.yml` runs it as `npm --prefix website run test:unit`); `task test:all` in Step 3 will NOT re-run it.

- [ ] **Step 2: Astro check (type safety on all touched components/pages)**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable/website && npx astro check 2>&1 | tail -20
```
Expected: 0 errors in the touched files (`learning-db.ts`, `sidekick-nudge.ts`, `AgentGuideView.svelte`, `PortalSidekick.svelte`, `SidekickHome.svelte`, `loslernen.astro`, `triggers/portal.ts`). Pre-existing unrelated warnings elsewhere are acceptable.

- [ ] **Step 3: Run the full offline test suite (the separate Offline gate)**

Run (from worktree root):
```bash
cd /tmp/wt-lernpfad-knowledge-completable && task test:all 2>&1 | tail -40
```
Expected: all `test:all` subtasks green: `test:unit` (**BATS** unit tests — assertion lib/scripts/configs, NOT the website Vitest), `test:factory`, `test:manifests`, `test:art-library`, `test:menu-gate`, `test:dry-run`, `test:docs-gen`, `test:agent-guide`, `test:code-quality`. If exit 128 on first run, re-run once.

> **Do not mistake `task test:all`'s `test:unit` for the website Vitest.** The Taskfile `test:unit` runs BATS (`tests/unit/**`); the website Vitest (`learning-db.test.ts`, `sidekick-nudge.test.ts`) is a **separate CI job** and is covered ONLY by Step 1 above. This change touches no BATS test, so the contribution of this PR to `test:all` is essentially nil — but the gate must still be green (no regressions), and the test-inventory check (Step 4) is part of CI.

- [ ] **Step 4: Confirm the inventory is in sync (the exact CI check)**

Run:
```bash
cd /tmp/wt-lernpfad-knowledge-completable && task test:inventory && git diff --exit-code website/src/data/test-inventory.json && echo "INVENTORY IN SYNC"
```
Expected: `INVENTORY IN SYNC` (no diff). If it prints a diff, commit the regenerated file.

- [ ] **Step 5: Final commit if anything was regenerated**

```bash
cd /tmp/wt-lernpfad-knowledge-completable && git status --porcelain
```
Expected: clean. If not, `git add -p` the regenerated artifacts and commit with `chore(test): sync generated artifacts`.

---

## Acceptance Criteria (final verification checklist — from the spec §Akzeptanzkriterien)

Run through each against the implemented branch:

- [ ] **AC1 — CTA opens the matching card.** On `/portal/loslernen`, clicking a row's „weiter lernen →" opens the Sidekick on „Agent-Anleitung" and scrolls+expands exactly `ag-<type>-<id>`. No `/portal/arena?jumpTo=` link remains. *(Verified by Task 10 E2E + `grep -rn "arena?jumpTo" website/src` → 0 hits.)*
  > **Documented residual risk:** the full chain — CTA `CustomEvent` → PortalSidekick window-listener → `pendingJump` prop → AgentGuideView's `$effect` → DOM scroll+expand — is **end-to-end DOM wiring that NO PR-gate test exercises**. The PR gates cover only the pure pieces (`parseNavigateEvent`, `shouldShowLearnDot`, `decideBanner` unit tests + the DML tests); there are no mounted-Svelte component tests in this repo (Deviation #3). The cross-component wiring is verified **only by the nightly Playwright e2e** (`fa-46-lernpfad-cta.spec.ts` in `e2e.yml`), not by the PR gate. To shrink this gap before pushing, the executor MAY run `fa-46-lernpfad-cta.spec.ts` against a local `npm run dev` with a seeded/authenticated session (see Notes for the executor) — optional, but it is the only way to catch a broken `$effect`/event wiring before the nightly run.
- [ ] **AC2 — Note never de-completes.** A note saved on a `● erledigt` item leaves `status` and `completed_at` unchanged. *(Task 1 test: "note-only save".)*
- [ ] **AC3 — Summary never overflows.** `getLearningSummary` never returns `done > total` or `pct > 100`, even with orphan rows. *(Task 3 test: "canonical cap".)*
- [ ] **AC4 — Start/continue nudge.** A logged-in portal user with `done === 0` sees the „Starte deinen Lernpfad" banner + a FAB attention dot, both routing to the Agent-Anleitung; `0 < done < total` shows „Weiter lernen · N/total". *(Tasks 6/7 + `decideBanner` test in Task 4.)*
- [ ] **AC5 — Done state + milestone.** At `done === total`: the „🎉 Geschafft" card shows on `/portal/loslernen`, no FAB dot, and an `onboarding_state` row `learning-complete` exists. *(Task 8; verify the row via `kubectl exec` to shared-db, or trust the idempotent POST + `mark-step` API.)*
- [ ] **AC6 — Dead funnel gone.** `portal-onboarding-sequence` is removed; no hanging „Willkommen bei deinem Sidekick" loop. *(Task 9 + `grep` shows 0 references.)*
- [ ] **AC7 — Both brands.** Works for mentolder + korczewski; brand always comes from the session (no new silent `'mentolder'` defaults beyond the pre-existing `?? 'mentolder'` last-resort, which Task 9 removed from the trigger). *(Confirm `track.ts`/`summary.ts`/`mark-step.ts` still read `session.brand ?? 'mentolder'` — unchanged signatures.)*

---

## Notes for the executor

- **Do not change** the signatures of `/api/portal/learning/track`, `/api/portal/learning/summary`, `/api/portal/onboarding/mark-step`, or any exported `learning-db.ts` function — the spec mandates stability. All fixes are internal.
- **Fail-soft everywhere new:** every new Sidekick fetch and the milestone POST must swallow errors (`try/catch` → `/* fail-soft */`). A failed summary fetch simply means no badge/banner; a failed milestone POST must not block the done-card.
- **Live `total`, never literal 28:** all UI reads `summary.total`. The only place 28 is structurally implied is the canonical guide JSON (13+15) inside `learning-db.ts`.
- **Squash-merge** the eventual PR; keep commits small as written. CI must be green ([Development Rules](../../../CLAUDE.md)).
- If `astro check` is unavailable/slow in the worktree, `npx svelte-check --workspace .` or a `npm run build` are acceptable substitutes for type verification of the `.svelte`/`.astro` files.
- **Residual risk — cross-component DOM wiring is NOT covered by the PR gate.** The unit/DML tests (Tasks 1–4) and `astro check` (type-level) are the only PR-gate signals. The actual runtime chain CTA → `sidekick:navigate` CustomEvent → `PortalSidekick` listener → `pendingJump` prop → `AgentGuideView` `$effect` → scroll/expand is verified **only by the nightly Playwright `e2e.yml`** (`fa-46-lernpfad-cta.spec.ts`). A regression in the `$effect` guards, the prop forwarding, or the event detail shape would pass the PR gate and only surface at the nightly run. This is an accepted, documented gap (no mounted-Svelte test infra exists — Deviation #3).
  - **Optional pre-push spec run against local dev (recommended to close the gap early):** start the site with `npm --prefix website run dev` (or `task` equivalent), obtain an authenticated portal session (seed/login so `/portal/loslernen` does not redirect), then run `cd tests/e2e && WEBSITE_URL=http://localhost:4321 ./node_modules/.bin/playwright test --project=mentolder fa-46-lernpfad-cta.spec.ts` against it. Without an authenticated session the spec **skips gracefully** (by design, Task 10), so this only adds value when a session is available. Not a hard gate — but it is the cheapest way to catch a broken `$effect`/event wiring before the nightly e2e.
