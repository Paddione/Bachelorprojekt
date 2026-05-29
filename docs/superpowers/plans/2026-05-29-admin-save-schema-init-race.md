---
title: Admin Save Schema-Init Race — Implementation Plan
ticket_id: T000304
domains: []
status: active
pr_number: null
---

# Admin Save Schema-Init Race — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the website DB layer from running schema-init DDL on every read/write request, so admin content saves (homepage, prices/Leistungen, services) persist reliably instead of silently failing after a `tuple concurrently updated` catalog race poisons a pooled connection.

**Architecture:** Introduce a process-level run-once guard (`ensureSchemaOnce`) that memoises each schema-init promise, and wrap the actual DDL in a Postgres transaction-scoped advisory lock so concurrent requests/replicas on a cold database serialise instead of racing the system catalog. Apply it to every `init*` function currently invoked on the request hot path in `website/src/lib/website-db.ts` and `website/src/lib/tickets-db.ts`. No schema changes; behaviour-preserving for callers.

**Tech Stack:** TypeScript, `pg` (node-postgres) Pool, Astro SSR endpoints, vitest + pg-mem (unit tests).

**Ticket:** T000304

**Background (forensic summary):**
- `site_settings` / `leistungen_config` / `service_config` were empty across all 30 days of `db-backup` snapshots; the DB itself accepts writes (probe insert as the `website` role succeeded, full grants, no RLS, FK to `brands` satisfied).
- Prod log showed `error: tuple concurrently updated at initTicketsSchema` at pod startup. `getSiteSetting`/`setSiteSetting` call `initSiteSettingsTable()` on every call; `initTicketsSchema()` is called per-request at ~5 sites.
- A pod restart at ~19:12 UTC cleared the poisoned pool; the next save (19:25) persisted — confirming a fix-on-restart bug, not data deletion.

---

## Task 0: Failing test (ALREADY WRITTEN — verify only)

The failing regression test was authored on this branch before planning.

**Files:**
- Test (exists): `website/src/lib/website-db-init-hotpath.test.ts`

- [ ] **Step 1: Confirm the test exists and is RED against current code**

Run:
```bash
cd /tmp/wt-admin-save-schema-init-race/website && node_modules/.bin/vitest run src/lib/website-db-init-hotpath.test.ts
```
Expected: FAIL — `AssertionError: expected 3 to be less than or equal to 1` on the two hot-path-init invariant tests (`site_settings` init DDL runs once per call → 3 calls = 3 inits). The third test (`persists the value`) passes.

The test asserts the structural invariant: schema-init DDL for `site_settings` must run **at most once** across N read/write calls. pg-mem cannot reproduce the real Postgres catalog race (single-threaded), so this invariant is the faithful, deterministic proxy for the fix.

---

## Task 1: Add `ensureSchemaOnce` guard and apply to `initSiteSettingsTable`

**Files:**
- Modify: `website/src/lib/website-db.ts` (add helper near the top after the `pool` export; modify `initSiteSettingsTable` ~line 931)
- Test: `website/src/lib/website-db-init-hotpath.test.ts` (already RED)

- [ ] **Step 1: Add the run-once helper**

Add immediately after `export const pool = new Pool(poolConfig);` (around line 30):

```ts
// Schema initialisation must run ONCE per process, not on every request.
// Running idempotent DDL (CREATE TABLE IF NOT EXISTS / ALTER ... ADD CONSTRAINT)
// on the hot path races concurrent requests on the Postgres system catalog,
// throwing "tuple concurrently updated" and poisoning the pooled connection
// (every later save then fails until the pod restarts). The map memoises the
// init promise per logical schema key; a rejected init is evicted so a later
// request can retry. See ticket T000304.
const _schemaInitOnce = new Map<string, Promise<void>>();
export function ensureSchemaOnce(key: string, init: () => Promise<void>): Promise<void> {
  let p = _schemaInitOnce.get(key);
  if (!p) {
    p = init().catch((err) => {
      _schemaInitOnce.delete(key);
      throw err;
    });
    _schemaInitOnce.set(key, p);
  }
  return p;
}

// Test-only: reset the run-once cache so each test starts cold.
export function __resetSchemaInitCacheForTests(): void {
  _schemaInitOnce.clear();
}
```

- [ ] **Step 2: Wrap `initSiteSettingsTable` body in `ensureSchemaOnce` + advisory lock**

Replace the current `initSiteSettingsTable` (~line 931) with:

```ts
export async function initSiteSettingsTable(): Promise<void> {
  return ensureSchemaOnce('site_settings', async () => {
    // Transaction-scoped advisory lock serialises concurrent processes/replicas
    // racing the same DDL on a cold DB. The lock auto-releases at COMMIT/ROLLBACK.
    await pool.query(`
      BEGIN;
      SELECT pg_advisory_xact_lock(hashtext('init:site_settings'));
      CREATE TABLE IF NOT EXISTS site_settings (
        brand      TEXT REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        key        TEXT,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (brand, key)
      );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_brand_fkey') THEN
          ALTER TABLE site_settings ADD CONSTRAINT site_settings_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
        END IF;
      END $$;
      COMMIT;
    `);
  });
}
```

> Note: pg-mem does not implement `pg_advisory_xact_lock`. The existing test mock (`CountingPool`) already swallows `site_settings` init DDL, so this is fine for unit tests; the advisory lock only matters against real Postgres. If a future test executes this DDL against pg-mem directly, stub the lock call.

- [ ] **Step 3: Run the hot-path test to verify it passes**

Run:
```bash
cd /tmp/wt-admin-save-schema-init-race/website && node_modules/.bin/vitest run src/lib/website-db-init-hotpath.test.ts
```
Expected: PASS (3/3). `setSiteSetting`/`getSiteSetting` called N times now trigger init DDL once.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-admin-save-schema-init-race
git add website/src/lib/website-db.ts website/src/lib/website-db-init-hotpath.test.ts
git commit -m "fix(website): run site_settings schema-init once, not per request [T000304]"
```

---

## Task 2: Apply the guard to the other per-request `init*` functions in website-db.ts

The same hot-path pattern exists for the other content tables. Apply `ensureSchemaOnce` so none re-run DDL per call.

**Files:**
- Modify: `website/src/lib/website-db.ts`

- [ ] **Step 1: Identify every per-request init function**

Run:
```bash
cd /tmp/wt-admin-save-schema-init-race/website
grep -nE "export async function init[A-Za-z]+\(\): Promise<void>" src/lib/website-db.ts
```
Expected to include at least: `initServiceConfigTable` (~855), `initLeistungenConfigTable` (~893), `initSiteSettingsTable` (done in Task 1), `initLegalPagesTable` (~995), `initReferenzenConfigTable` (~1057). Treat the full list from the grep output as the work set.

- [ ] **Step 2: Wrap each remaining init function body in `ensureSchemaOnce`**

For each `initXxxTable`, wrap its existing `await pool.query(...)` DDL in `ensureSchemaOnce('<table>', async () => { ... })`, using the table name as the key. Pattern (example for `initLeistungenConfigTable`):

```ts
export async function initLeistungenConfigTable(): Promise<void> {
  return ensureSchemaOnce('leistungen_config', async () => {
    await pool.query(`
      /* existing CREATE TABLE IF NOT EXISTS leistungen_config ... DDL, unchanged */
    `);
  });
}
```

Do NOT change the DDL text — only wrap it. Keep one `ensureSchemaOnce` key per table.

- [ ] **Step 3: Run the full website unit suite**

Run:
```bash
cd /tmp/wt-admin-save-schema-init-race/website && node_modules/.bin/vitest run
```
Expected: PASS (no regressions; the hot-path test still green).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-admin-save-schema-init-race
git add website/src/lib/website-db.ts
git commit -m "fix(website): memoise remaining content-table schema-init off the hot path [T000304]"
```

---

## Task 3: Apply the guard to `initTicketsSchema` (the function that threw in prod)

`initTicketsSchema` lives in `tickets-db.ts` and is the exact function the prod log named. It is called per-request at ~5 sites in website-db.ts.

**Files:**
- Modify: `website/src/lib/tickets-db.ts`

- [ ] **Step 1: Inspect `initTicketsSchema`**

Run:
```bash
cd /tmp/wt-admin-save-schema-init-race/website
grep -n "export async function initTicketsSchema" src/lib/tickets-db.ts
```

- [ ] **Step 2: Import the guard and wrap the body**

At the top of `tickets-db.ts`, import the helper from `website-db`:

```ts
import { ensureSchemaOnce } from './website-db';
```

> If this creates a circular import (website-db imports tickets-db at line 7), instead move `ensureSchemaOnce` + `_schemaInitOnce` into a new leaf module `website/src/lib/schema-init.ts` and import it from BOTH website-db.ts and tickets-db.ts. Prefer the leaf module if `grep -n "from './website-db'" src/lib/tickets-db.ts` shows any existing import cycle risk.

Wrap the existing `initTicketsSchema` DDL body in `ensureSchemaOnce('tickets', async () => { ... })`, wrapping the DDL in the same `BEGIN; SELECT pg_advisory_xact_lock(hashtext('init:tickets')); ... COMMIT;` envelope.

- [ ] **Step 3: Run the full suite + typecheck**

```bash
cd /tmp/wt-admin-save-schema-init-race/website
node_modules/.bin/vitest run
npx tsc --noEmit
```
Expected: tests PASS, no type errors (resolve any circular-import type error by using the leaf module from Step 2).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-admin-save-schema-init-race
git add website/src/lib/tickets-db.ts website/src/lib/website-db.ts website/src/lib/schema-init.ts 2>/dev/null
git commit -m "fix(website): run tickets schema-init once, not per request [T000304]"
```

---

## Task 4: Build verification

**Files:** none (verification only)

- [ ] **Step 1: Production build**

```bash
cd /tmp/wt-admin-save-schema-init-race/website && npm run build
```
Expected: build succeeds (the dist server bundles without error).

- [ ] **Step 2: Run the repo offline test suite for affected areas**

```bash
cd /tmp/wt-admin-save-schema-init-race && task test:all
```
Expected: green.

---

## Task 5: Post-merge live verification (run during dev-flow-execute deploy step)

These confirm the user's actual goal: saved changes persist and reach backups.

- [ ] **Step 1: Deploy website to both prod clusters** via `task feature:website` (per CLAUDE.md post-merge deploy table for `website/src/**`).

- [ ] **Step 2: On web.mentolder.de admin, save the Startseite tab and the Angebote/Leistungen tab.**

- [ ] **Step 3: Confirm rows persisted, including `site_settings` key `homepage`:**

```bash
kubectl --context mentolder -n workspace exec deploy/shared-db -- \
  psql -U postgres -d website -c \
  "SELECT brand, key, updated_at FROM site_settings ORDER BY updated_at DESC;"
```
Expected: a `homepage` row appears (it was missing after the 19:25 partial save), plus `price_list_url`.

- [ ] **Step 4: Confirm no schema-init error after a fresh rollout:**

```bash
kubectl --context mentolder -n website logs deploy/website --since=10m | grep -i "tuple concurrently updated" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 5: Hand off to dev-flow-e2e** for a Playwright save-persistence regression on web.mentolder.de admin (authenticated `mentolder` project).

---

## Self-Review notes

- **Coverage:** Tasks 1–3 cover every per-request `init*` site named in the forensic analysis (`site_settings`, the other content tables, and `initTicketsSchema`). Task 5 closes the `homepage`-key gap observed in prod.
- **Type consistency:** Helper is `ensureSchemaOnce(key, init)` everywhere; reset helper is `__resetSchemaInitCacheForTests()`. If extracted to a leaf module, import path is `./schema-init` in both files.
- **No new schema/behaviour:** DDL text is unchanged; only its invocation cadence (once per process) and concurrency safety (advisory lock) change. Callers' signatures are untouched.
