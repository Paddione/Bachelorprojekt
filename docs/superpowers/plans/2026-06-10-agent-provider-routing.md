---
title: Agent Provider Routing Implementation Plan
ticket_id: T000595
domains: [website, infra, db, ops, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Agent Provider Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a central, DB-backed mechanism that decides which API provider (Anthropic, DeepSeek, Ollama, OpenAI-compatible) and how many concurrent subagents each LLM-using source (Factory phases, dev-flow-execute, website-llm) runs on, with a circuit-breaker for resilience and a hardcoded Anthropic guarantee for the `opus` tier.

**Architecture:** Two new tables (`tickets.provider_config`, `tickets.provider_health`) hold the runtime config + circuit-breaker state. A pure-ESM module `provider-router.js` (mirroring `provision.js`) implements `routeProvider()` / `recordFailure()` / `releaseSlot()` against those tables via a thin pg query layer. The Factory Workflow script (`pipeline.js`) cannot use ESM imports, so the router logic is **inlined** into `pipeline.js` (exactly as `provision.js` is already inlined) and the pure module is the testable single source of truth. dev-flow gets bash CLI wrappers (`route-provider.sh` / `release-slot.sh`); the website reads config through a new `getProviderConfig()` in `claude.ts`; the dashboard gets a Provider-Status widget in `FactoryFloor.svelte`.

**Tech Stack:** Node ESM + `node:test`, PostgreSQL 16 (schema `tickets`), Bash + `kubectl exec` (via `scripts/factory/lib.sh` → `factory_psql`), `jq`, BATS, TypeScript + `@anthropic-ai/sdk`, Svelte 5 (runes), Astro API routes, Vitest.

---

## CRITICAL CONTEXT — read before starting any task

These facts were verified against the live codebase. Violating them silently breaks things.

1. **There is NO `factory` Postgres schema.** The spec text writes `factory.provider_config`, but the codebase keeps every Factory table under the **`tickets`** schema (`tickets.factory_control`, `tickets.feature_flags`, `tickets.factory_phase_events`). This plan places the two new tables under **`tickets`** (`tickets.provider_config`, `tickets.provider_health`) for consistency. Do NOT create a `factory` schema.

2. **The project's "migration" home is `initTicketsSchema()` in `website/src/lib/tickets-db.ts`.** It is an idempotent `CREATE TABLE IF NOT EXISTS …` sequence run on boot under an advisory lock. New tables MUST be added there so the website/pipeline can rely on them existing. A standalone SQL file under `scripts/migrations/` is added too (for manual `factory_psql` bring-up and documentation), but `initTicketsSchema()` is the authoritative idempotent DDL.

3. **`pipeline.js` is a Claude Code *Workflow* script. NO ESM `import` is allowed** (the harness injects `agent`/`parallel`/`pipeline`/`phase`/`log`/`args` as globals; `import`/dynamic `import()` are forbidden — see the header comment in `pipeline.js` and MEMORY bug T000460). That is precisely why `provision.js`'s logic is **duplicated inline** at the top of `pipeline.js`. The router follows the same pattern: `provider-router.js` is the pure, unit-tested SSOT; an **inlined copy** of its DB-free decision logic + `require('child_process')`-based `factory_psql` shell-outs lives in `pipeline.js`. Inside a Workflow script you may use `require(...)` (CommonJS) — `pipeline.js` already does `require('child_process')`, `require('fs')`, `require('path')`. So the inlined router talks to the DB by shelling out to `bash scripts/factory/route-provider.sh` / `release-slot.sh` via `execFileSync` (NOT by importing pg).

4. **Provider selection currently happens at the PROCESS level, not per-`agent()`-call.** `scripts/factory/wakeup.sh` exports `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL` once for the whole `claude` process (DeepSeek autopilot). It is **unproven** that the Workflow `agent()` API honours a per-call `env: { ANTHROPIC_BASE_URL }` override the way the spec's pseudo-code assumes. **Task 9 is a spike that MUST verify this before the pipeline integration is trusted in real mode.** If per-call env override does not work, the fallback (documented in Task 9) is: the router still picks the provider/model, but `ANTHROPIC_BASE_URL` is set once per dispatcher tick from the highest-priority healthy provider, and only `model` varies per call. The plan is structured so this discovery does not block the DB + CLI + website + dashboard work.

5. **`opus` is hardcoded to Anthropic in CODE, never in the DB.** `routeProvider(source, 'opus')` returns `{provider:'anthropic', modelId: OPUS_MODEL, releaseSlot: noop}` WITHOUT touching the DB. The DB `CHECK` constraint on `provider_config.tier` forbids `opus` rows so a misconfig is impossible.

6. **DB access from bash uses `factory_psql`** (`scripts/factory/lib.sh`): `kubectl exec … psql -U website -d website -qtA -v ON_ERROR_STOP=1`. Pass values as bound params with `-v name=value` and reference them as `:'name'` in SQL (never string-interpolate user input). The `provider-config.sh` CLI and the two wrappers SOURCE `lib.sh` and reuse `factory_resolve` / `factory_psql`.

7. **Website DB access uses the per-brand `pool` from `website/src/lib/website-db.ts`** (`import { pool } from './website-db'`). `claude.ts` currently does none — Task 7 adds a `getProviderConfig()` that queries `pool` and falls back to env on any error.

8. **Run the FULL offline suite before pushing:** `task test:all` + `task freshness:regenerate` (regenerates `test-inventory.json`; CI fails on drift). New BATS tests must be registered so `task test:factory` picks them up (they live under `tests/local/FA-SF-*.bats` and are globbed).

---

## File Structure

**New files:**
- `scripts/factory/provider-router.js` — pure ESM SSOT: tier→provider decision, health/cooldown/capacity evaluation, SQL builders. No I/O in the pure decision functions; the DB-touching functions accept an injected `query` fn so they're unit-testable with a fake.
- `scripts/factory/provider-router.test.mjs` — `node:test` unit tests for the pure logic + fake-query DB logic.
- `scripts/factory/provider-config.sh` — operator CLI (`set` / `list` / `reset` / `health`) via `factory_psql`.
- `scripts/factory/route-provider.sh` — bash wrapper: emits `{modelId, baseUrl, provider, slotId}` JSON for one route claim (used by dev-flow AND by inlined pipeline.js).
- `scripts/factory/release-slot.sh` — bash wrapper: releases a slot by `slotId`, records failure when `success=false`.
- `scripts/migrations/2026-06-10-provider-routing.sql` — standalone idempotent DDL + seed rows (documentation + manual bring-up).
- `tests/local/FA-SF-70-provider-router.bats` — BATS coverage for the CLI + wrappers (offline-safe: mock `factory_psql`).
- `website/src/lib/provider-config.ts` — `getProviderConfig(source, tier)` querying `pool`, env fallback. (Kept out of `claude.ts` so it's independently testable and reusable.)
- `website/src/lib/provider-config.test.ts` — Vitest unit tests (pg-mem / mocked pool).

**Modified files:**
- `website/src/lib/tickets-db.ts` — add the two `CREATE TABLE IF NOT EXISTS` blocks + seed inside `initTicketsSchema()`.
- `scripts/factory/pipeline.js` — inline the router decision logic; replace `chooseModel`-only provisioning with `routeProvider` claim + `releaseSlot` around each non-opus `agent()` call.
- `website/src/lib/claude.ts` — use `getProviderConfig('website-llm','sonnet')` to build the `Anthropic` client + model.
- `website/src/lib/factory-floor.ts` — add `getProviderHealth()` returning the per-provider status rows; include in `FloorPayload`.
- `website/src/pages/api/factory-floor.ts` — (only if it doesn't already spread the whole `getFloor` payload) ensure provider rows are returned.
- `website/src/components/FactoryFloor.svelte` — Provider-Status widget (30s implicit via existing refresh/SSE).
- `website/src/lib/factory-floor.test.ts` — test for `getProviderHealth`.

---

## Data Model (authoritative DDL)

Both tables under schema `tickets`. This exact DDL is used in BOTH Task 1 (tickets-db.ts) and Task 2 (migration SQL) — keep them byte-identical.

```sql
-- Which providers serve which source/tier, in which order.
CREATE TABLE IF NOT EXISTS tickets.provider_config (
  id             BIGSERIAL PRIMARY KEY,
  source         TEXT NOT NULL,
  tier           TEXT NOT NULL CHECK (tier IN ('sonnet','haiku')),  -- opus is code-hardcoded, never here
  priority       INTEGER NOT NULL,
  provider       TEXT NOT NULL,
  model_id       TEXT NOT NULL,
  base_url       TEXT,                       -- NULL = Anthropic default
  max_concurrent INTEGER NOT NULL DEFAULT 3,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, tier, priority)
);

-- Circuit-breaker state per provider (global, not per source).
CREATE TABLE IF NOT EXISTS tickets.provider_health (
  provider       TEXT PRIMARY KEY,
  failure_count  INTEGER NOT NULL DEFAULT 0,
  last_failure   TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,                -- NULL = healthy
  active_agents  INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seed (idempotent): one wildcard sonnet + haiku row on Anthropic so the system is always functional even with an empty config.

```sql
INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url)
VALUES
  ('*', 'sonnet', 99, 'anthropic', 'claude-sonnet-4-6', NULL),
  ('*', 'haiku',  99, 'anthropic', 'claude-haiku-4-5',  NULL)
ON CONFLICT (source, tier, priority) DO NOTHING;
```

Constants (defined once in `provider-router.js`, re-declared inline in `pipeline.js`):
- `OPUS_MODEL = 'claude-opus-4-6'`
- `EMERGENCY_FALLBACK = { provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null }`
- `FAILURE_THRESHOLD = 3`
- `COOLDOWN_MINUTES = 10`
- `DEFAULT_MAX_CONCURRENT = 3`

---

## Task 1: DB tables in `initTicketsSchema()`

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (inside `initTicketsSchema`, after the `feature_flags` block ~line 445–465)
- Test: `website/src/lib/tickets-db.providerrouting.test.ts` (new)

- [x] **Step 1: Write the failing test**

Create `website/src/lib/tickets-db.providerrouting.test.ts`. Follow the pattern in `website/src/lib/questionnaire-db.ensure.test.ts` / `platform-db.ensure.test.ts` (they use the project's pg-mem harness). If those tests mock `pool`, mirror that exact setup.

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from './website-db';
import { initTicketsSchema } from './tickets-db';

describe('provider routing schema', () => {
  beforeAll(async () => { await initTicketsSchema(); });

  it('creates provider_config with a tier CHECK that forbids opus', async () => {
    await expect(
      pool.query(`INSERT INTO tickets.provider_config (source,tier,priority,provider,model_id) VALUES ('x','opus',1,'anthropic','m')`)
    ).rejects.toThrow();
  });

  it('seeds wildcard anthropic rows for sonnet and haiku', async () => {
    const { rows } = await pool.query(
      `SELECT tier FROM tickets.provider_config WHERE source='*' AND provider='anthropic' ORDER BY tier`
    );
    expect(rows.map((r: any) => r.tier)).toEqual(['haiku', 'sonnet']);
  });

  it('creates provider_health keyed by provider', async () => {
    await pool.query(`INSERT INTO tickets.provider_health (provider) VALUES ('deepseek') ON CONFLICT DO NOTHING`);
    const { rows } = await pool.query(`SELECT active_agents, failure_count FROM tickets.provider_health WHERE provider='deepseek'`);
    expect(rows[0]).toMatchObject({ active_agents: 0, failure_count: 0 });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/tickets-db.providerrouting.test.ts`
Expected: FAIL — relation `tickets.provider_config` does not exist.

- [x] **Step 3: Add the DDL inside `initTicketsSchema()`**

In `website/src/lib/tickets-db.ts`, immediately after the `feature_flags` table block (the one ending around line 465), add:

```ts
  // Provider routing (T-provider-routing): central DB-backed agent→provider routing
  // + circuit-breaker. opus is code-hardcoded to Anthropic, so tier CHECK forbids it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.provider_config (
      id             BIGSERIAL PRIMARY KEY,
      source         TEXT NOT NULL,
      tier           TEXT NOT NULL CHECK (tier IN ('sonnet','haiku')),
      priority       INTEGER NOT NULL,
      provider       TEXT NOT NULL,
      model_id       TEXT NOT NULL,
      base_url       TEXT,
      max_concurrent INTEGER NOT NULL DEFAULT 3,
      enabled        BOOLEAN NOT NULL DEFAULT true,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source, tier, priority)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.provider_health (
      provider       TEXT PRIMARY KEY,
      failure_count  INTEGER NOT NULL DEFAULT 0,
      last_failure   TIMESTAMPTZ,
      cooldown_until TIMESTAMPTZ,
      active_agents  INTEGER NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`
    INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url)
    VALUES
      ('*', 'sonnet', 99, 'anthropic', 'claude-sonnet-4-6', NULL),
      ('*', 'haiku',  99, 'anthropic', 'claude-haiku-4-5',  NULL)
    ON CONFLICT (source, tier, priority) DO NOTHING`);
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/tickets-db.providerrouting.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add website/src/lib/tickets-db.ts website/src/lib/tickets-db.providerrouting.test.ts
git commit -m "feat(provider-routing): provider_config + provider_health tables in initTicketsSchema"
```

---

## Task 2: Standalone migration SQL (manual bring-up + docs)

**Files:**
- Create: `scripts/migrations/2026-06-10-provider-routing.sql`

- [x] **Step 1: Write the migration file**

Create `scripts/migrations/2026-06-10-provider-routing.sql` with EXACTLY the DDL + seed from the Data Model section (byte-identical to Task 1's `CREATE TABLE`/`INSERT` so the two never drift). Wrap in a comment header:

```sql
-- 2026-06-10-provider-routing.sql
-- Central agent→provider routing + circuit-breaker (T-provider-routing).
-- Idempotent. Authoritative idempotent DDL lives in website/src/lib/tickets-db.ts
-- initTicketsSchema(); this file mirrors it for manual bring-up via factory_psql:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-10-provider-routing.sql'
-- Apply to BOTH brands (workspace AND workspace-korczewski) — separate per-brand DBs.
BEGIN;
CREATE TABLE IF NOT EXISTS tickets.provider_config ( /* …exact DDL… */ );
CREATE TABLE IF NOT EXISTS tickets.provider_health ( /* …exact DDL… */ );
INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url)
VALUES
  ('*', 'sonnet', 99, 'anthropic', 'claude-sonnet-4-6', NULL),
  ('*', 'haiku',  99, 'anthropic', 'claude-haiku-4-5',  NULL)
ON CONFLICT (source, tier, priority) DO NOTHING;
COMMIT;
```

(Replace the `/* …exact DDL… */` comments with the full column lists from the Data Model section.)

- [x] **Step 2: Validate it parses**

Run: `cd /tmp/wt-agent-provider-routing && grep -c 'CREATE TABLE IF NOT EXISTS tickets.provider' scripts/migrations/2026-06-10-provider-routing.sql`
Expected: `2`

- [x] **Step 3: Commit**

```bash
git add scripts/migrations/2026-06-10-provider-routing.sql
git commit -m "feat(provider-routing): standalone idempotent migration for manual bring-up"
```

---

## Task 3: Pure router module — tier/opus decision

**Files:**
- Create: `scripts/factory/provider-router.js`
- Test: `scripts/factory/provider-router.test.mjs`

- [x] **Step 1: Write the failing test**

Create `scripts/factory/provider-router.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideOpus, OPUS_MODEL, EMERGENCY_FALLBACK } from './provider-router.js'

test('decideOpus returns hardcoded Anthropic with a no-op releaseSlot', async () => {
  const r = decideOpus()
  assert.equal(r.provider, 'anthropic')
  assert.equal(r.modelId, OPUS_MODEL)
  assert.equal(r.baseUrl, null)
  // releaseSlot is a no-op that resolves regardless of args
  await r.releaseSlot(true)
  await r.releaseSlot(false)
})

test('EMERGENCY_FALLBACK is anthropic sonnet with no base url', () => {
  assert.equal(EMERGENCY_FALLBACK.provider, 'anthropic')
  assert.equal(EMERGENCY_FALLBACK.modelId, 'claude-sonnet-4-6')
  assert.equal(EMERGENCY_FALLBACK.baseUrl, null)
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /tmp/wt-agent-provider-routing && node --test scripts/factory/provider-router.test.mjs`
Expected: FAIL — cannot find module `./provider-router.js`.

- [x] **Step 3: Create the module with constants + opus decision**

Create `scripts/factory/provider-router.js`:

```js
// scripts/factory/provider-router.js
//
// Central agent→provider routing + circuit-breaker. PURE-DECISION + injected-query
// SSOT. The Factory Workflow script (pipeline.js) cannot ESM-import this (harness
// forbids imports) — it INLINES an equivalent copy and shells out to the bash
// wrappers. dev-flow + website use the wrappers / website/src/lib/provider-config.ts.
//
// Offline lint:  node --check scripts/factory/provider-router.js
// Unit tests:    node --test scripts/factory/provider-router.test.mjs

export const OPUS_MODEL = 'claude-opus-4-6'
export const EMERGENCY_FALLBACK = { provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null }
export const FAILURE_THRESHOLD = 3
export const COOLDOWN_MINUTES = 10
export const DEFAULT_MAX_CONCURRENT = 3

/** opus is hardcoded to Anthropic in CODE, never read from the DB. */
export function decideOpus() {
  return { provider: 'anthropic', modelId: OPUS_MODEL, baseUrl: null, releaseSlot: async () => {} }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd /tmp/wt-agent-provider-routing && node --test scripts/factory/provider-router.test.mjs`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add scripts/factory/provider-router.js scripts/factory/provider-router.test.mjs
git commit -m "feat(provider-routing): provider-router module with opus hardcode + constants"
```

---

## Task 4: Candidate ordering + health gating (pure logic)

**Files:**
- Modify: `scripts/factory/provider-router.js`
- Test: `scripts/factory/provider-router.test.mjs`

- [x] **Step 1: Add failing tests for ordering + gating**

Append to `provider-router.test.mjs`:

```js
import { orderCandidates, isUsable, openCircuit } from './provider-router.js'

test('orderCandidates: source-specific before wildcard, then priority asc', () => {
  const rows = [
    { source: '*', tier: 'sonnet', priority: 1, provider: 'anthropic' },
    { source: 'factory-implement', tier: 'sonnet', priority: 2, provider: 'ollama' },
    { source: 'factory-implement', tier: 'sonnet', priority: 1, provider: 'deepseek' },
  ]
  const ordered = orderCandidates(rows, 'factory-implement')
  assert.deepEqual(ordered.map(r => r.provider), ['deepseek', 'ollama', 'anthropic'])
})

test('isUsable: false during cooldown', () => {
  const future = new Date(Date.now() + 60_000).toISOString()
  assert.equal(isUsable({ cooldown_until: future, active_agents: 0 }, 3), false)
})

test('isUsable: false at capacity', () => {
  assert.equal(isUsable({ cooldown_until: null, active_agents: 3 }, 3), false)
})

test('isUsable: true when healthy and below cap', () => {
  const past = new Date(Date.now() - 60_000).toISOString()
  assert.equal(isUsable({ cooldown_until: past, active_agents: 2 }, 3), true)
  assert.equal(isUsable({ cooldown_until: null, active_agents: 0 }, 3), true)
})

test('openCircuit: opens at threshold, stays closed below', () => {
  assert.equal(openCircuit(2), false)
  assert.equal(openCircuit(3), true)
  assert.equal(openCircuit(5), true)
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /tmp/wt-agent-provider-routing && node --test scripts/factory/provider-router.test.mjs`
Expected: FAIL — `orderCandidates is not a function`.

- [x] **Step 3: Implement the pure helpers**

Append to `provider-router.js`:

```js
/**
 * Order config rows: source-specific entries before wildcard '*', then priority asc.
 * @param {Array} rows  provider_config rows for source IN (source,'*') AND enabled.
 * @param {string} source
 */
export function orderCandidates(rows, source) {
  return [...rows].sort((a, b) => {
    const aSpecific = a.source === source ? 0 : 1
    const bSpecific = b.source === source ? 0 : 1
    if (aSpecific !== bSpecific) return aSpecific - bSpecific
    return a.priority - b.priority
  })
}

/** Circuit closed (not in cooldown) AND below the concurrency cap. */
export function isUsable(health, maxConcurrent) {
  const h = health ?? {}
  const inCooldown = h.cooldown_until != null && new Date(h.cooldown_until).getTime() > Date.now()
  if (inCooldown) return false
  const active = Number(h.active_agents ?? 0)
  return active < Number(maxConcurrent ?? DEFAULT_MAX_CONCURRENT)
}

/** Circuit breaker opens once failures reach the threshold. */
export function openCircuit(failureCount) {
  return Number(failureCount ?? 0) >= FAILURE_THRESHOLD
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd /tmp/wt-agent-provider-routing && node --test scripts/factory/provider-router.test.mjs`
Expected: PASS (7 tests total).

- [x] **Step 5: Commit**

```bash
git add scripts/factory/provider-router.js scripts/factory/provider-router.test.mjs
git commit -m "feat(provider-routing): candidate ordering + circuit/capacity gating (pure)"
```

---

## Task 5: `routeProvider` + `releaseSlot` with injected query (testable DB logic)

**Files:**
- Modify: `scripts/factory/provider-router.js`
- Test: `scripts/factory/provider-router.test.mjs`

The DB-touching functions accept an injected async `query(sql, params)` returning `{ rows }` (so a fake is used in tests; the real wrappers pass a `factory_psql`-backed adapter). The actual atomic-claim SQL lives here as a string constant so the bash wrapper and the unit test share one definition.

- [x] **Step 1: Add failing tests with a fake query**

Append to `provider-router.test.mjs`:

```js
import { routeProvider, releaseSlot } from './provider-router.js'

// Minimal in-memory fake of the two tables + the atomic claim semantics.
function makeFakeDb(config, health) {
  const cfg = config
  const hp = new Map(health.map(h => [h.provider, { ...h }]))
  return {
    async query(kind, params) {
      if (kind === 'load-config') {
        const src = params.source
        return { rows: cfg.filter(r => (r.source === src || r.source === '*') && r.enabled !== false) }
      }
      if (kind === 'load-health') {
        const h = hp.get(params.provider) ?? { provider: params.provider, failure_count: 0, cooldown_until: null, active_agents: 0 }
        return { rows: [h] }
      }
      if (kind === 'claim-slot') {
        const h = hp.get(params.provider) ?? { provider: params.provider, failure_count: 0, cooldown_until: null, active_agents: 0 }
        if (Number(h.active_agents) >= Number(params.maxConcurrent)) return { rows: [] } // lost the race
        h.active_agents = Number(h.active_agents) + 1
        hp.set(params.provider, h)
        return { rows: [{ provider: params.provider }] }
      }
      if (kind === 'release-slot') {
        const h = hp.get(params.provider); if (h) h.active_agents = Math.max(0, h.active_agents - 1)
        return { rows: [] }
      }
      if (kind === 'record-failure') {
        const h = hp.get(params.provider) ?? { provider: params.provider, failure_count: 0 }
        h.failure_count = Number(h.failure_count) + 1
        if (h.failure_count >= 3) h.cooldown_until = new Date(Date.now() + 600000).toISOString()
        hp.set(params.provider, h)
        return { rows: [] }
      }
      throw new Error('unknown kind ' + kind)
    },
    _health: hp,
  }
}

test('routeProvider picks highest-priority healthy provider and claims a slot', async () => {
  const db = makeFakeDb(
    [{ source: 'factory-implement', tier: 'sonnet', priority: 1, provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1', max_concurrent: 3, enabled: true }],
    [{ provider: 'deepseek', failure_count: 0, cooldown_until: null, active_agents: 0 }],
  )
  const r = await routeProvider(db.query.bind(db), 'factory-implement', 'sonnet')
  assert.equal(r.provider, 'deepseek')
  assert.equal(r.modelId, 'deepseek-chat')
  assert.equal(r.baseUrl, 'https://api.deepseek.com/v1')
  assert.equal(db._health.get('deepseek').active_agents, 1)
})

test('routeProvider skips a provider in cooldown, falls to next priority', async () => {
  const future = new Date(Date.now() + 600000).toISOString()
  const db = makeFakeDb(
    [
      { source: '*', tier: 'sonnet', priority: 1, provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'x', max_concurrent: 3, enabled: true },
      { source: '*', tier: 'sonnet', priority: 2, provider: 'anthropic', model_id: 'claude-sonnet-4-6', base_url: null, max_concurrent: 3, enabled: true },
    ],
    [{ provider: 'deepseek', failure_count: 3, cooldown_until: future, active_agents: 0 }],
  )
  const r = await routeProvider(db.query.bind(db), 'factory-implement', 'sonnet')
  assert.equal(r.provider, 'anthropic')
})

test('routeProvider opus path never queries the DB', async () => {
  let called = false
  const r = await routeProvider(async () => { called = true; return { rows: [] } }, 'factory-plan', 'opus')
  assert.equal(r.provider, 'anthropic')
  assert.equal(called, false)
})

test('routeProvider emergency fallback when no provider usable', async () => {
  const future = new Date(Date.now() + 600000).toISOString()
  const db = makeFakeDb(
    [{ source: '*', tier: 'sonnet', priority: 1, provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'x', max_concurrent: 3, enabled: true }],
    [{ provider: 'deepseek', failure_count: 3, cooldown_until: future, active_agents: 0 }],
  )
  const r = await routeProvider(db.query.bind(db), 'factory-implement', 'sonnet')
  assert.equal(r.provider, 'anthropic')
  assert.equal(r.modelId, EMERGENCY_FALLBACK.modelId)
  assert.equal(r.emergency, true)
})

test('releaseSlot(false) records a failure; (true) does not', async () => {
  const db = makeFakeDb([], [{ provider: 'deepseek', failure_count: 0, cooldown_until: null, active_agents: 1 }])
  await releaseSlot(db.query.bind(db), 'deepseek', true)
  assert.equal(db._health.get('deepseek').active_agents, 0)
  assert.equal(db._health.get('deepseek').failure_count, 0)
  await releaseSlot(db.query.bind(db), 'deepseek', false)
  assert.equal(db._health.get('deepseek').failure_count, 1)
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /tmp/wt-agent-provider-routing && node --test scripts/factory/provider-router.test.mjs`
Expected: FAIL — `routeProvider is not a function`.

- [x] **Step 3: Implement `routeProvider` + `releaseSlot`**

Append to `provider-router.js`:

```js
/**
 * Claim a provider slot for (source, tier). `query` is an injected async fn
 * (kind, params) => { rows } so the same logic runs against the fake (tests) and
 * a factory_psql/pg adapter (wrappers). opus short-circuits to Anthropic (no DB).
 * Returns { provider, modelId, baseUrl, releaseSlot(success), emergency? }.
 */
export async function routeProvider(query, source, tier) {
  if (tier === 'opus') return decideOpus()

  const { rows: cfg } = await query('load-config', { source, tier })
  const candidates = orderCandidates((cfg ?? []).filter(r => r.tier === tier), source)

  for (const c of candidates) {
    const { rows: hrows } = await query('load-health', { provider: c.provider })
    const health = hrows && hrows[0]
    const cap = Number(c.max_concurrent ?? DEFAULT_MAX_CONCURRENT)
    if (!isUsable(health, cap)) continue
    // Atomic claim: UPDATE ... WHERE active_agents < cap RETURNING. Empty rows = lost race → next candidate.
    const { rows: claimed } = await query('claim-slot', { provider: c.provider, maxConcurrent: cap })
    if (!claimed || !claimed.length) continue
    const provider = c.provider
    return {
      provider,
      modelId: c.model_id,
      baseUrl: c.base_url ?? null,
      releaseSlot: (success) => releaseSlot(query, provider, success),
    }
  }

  // No provider usable → emergency Anthropic sonnet (no slot claimed, no DB write).
  return { ...EMERGENCY_FALLBACK, emergency: true, releaseSlot: async () => {} }
}

/** Release a claimed slot (always decrements); record a failure when success=false. */
export async function releaseSlot(query, provider, success) {
  await query('release-slot', { provider })
  if (!success) await query('record-failure', { provider })
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd /tmp/wt-agent-provider-routing && node --test scripts/factory/provider-router.test.mjs`
Expected: PASS (12 tests total).

- [x] **Step 5: Lint + commit**

```bash
node --check scripts/factory/provider-router.js
git add scripts/factory/provider-router.js scripts/factory/provider-router.test.mjs
git commit -m "feat(provider-routing): routeProvider + releaseSlot with injected query (testable)"
```

---

## Task 6: Bash CLI + wrappers (`provider-config.sh`, `route-provider.sh`, `release-slot.sh`)

**Files:**
- Create: `scripts/factory/provider-config.sh`
- Create: `scripts/factory/route-provider.sh`
- Create: `scripts/factory/release-slot.sh`
- Test: `tests/local/FA-SF-70-provider-router.bats`

These shell out to `factory_psql` (from `lib.sh`). The atomic claim is done in SQL (`UPDATE … WHERE active_agents < cap RETURNING`), so the wrappers do NOT re-implement the JS race logic — they implement the exact same SQL the injected-query adapter would issue.

- [ ] **Step 1: Write the failing BATS test (offline-safe via factory_psql mock)**

Create `tests/local/FA-SF-70-provider-router.bats`. Mirror the mocking style in `tests/local/FA-SF-35-factory-cli.bats` (it stubs `kubectl`/`factory_psql`). Minimum coverage:

```bash
#!/usr/bin/env bats
# FA-SF-70 — provider routing CLI + wrappers (offline; factory_psql mocked).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export REPO
  # Stub factory_psql by overriding lib.sh's pod resolution: point kubectl at a fake.
  PATH="$BATS_TEST_DIRNAME/../mocks:$PATH"; export PATH   # provides a `kubectl` stub if FA-SF-35 has one
}

@test "provider-config.sh prints usage and exits non-zero with no args" {
  run bash "$REPO/scripts/factory/provider-config.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "provider-config.sh set rejects tier=opus" {
  run bash "$REPO/scripts/factory/provider-config.sh" set --source x --tier opus --priority 1 --provider anthropic --model m
  [ "$status" -ne 0 ]
  [[ "$output" == *"opus"* ]]
}

@test "route-provider.sh emits valid JSON keys for opus without DB" {
  run bash "$REPO/scripts/factory/route-provider.sh" factory-plan opus
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.modelId and (.provider=="anthropic")'
}

@test "release-slot.sh requires a provider arg" {
  run bash "$REPO/scripts/factory/release-slot.sh"
  [ "$status" -ne 0 ]
}
```

If FA-SF-35 has no reusable `kubectl` mock dir, add a local stub under `tests/local/mocks/` and `chmod +x` it; the opus + usage paths above do NOT hit the DB so they pass offline regardless.

- [ ] **Step 2: Run to verify it fails**

Run: `cd /tmp/wt-agent-provider-routing && ./tests/runner.sh local FA-SF-70`
Expected: FAIL — scripts do not exist.

- [ ] **Step 3: Write `provider-config.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/provider-config.sh — operator CLI for tickets.provider_config / provider_health.
# SOURCE lib.sh for factory_resolve + factory_psql. Apply per-brand: BRAND=mentolder|korczewski.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"; factory_resolve

usage() { cat >&2 <<'EOF'
Usage:
  provider-config.sh set --source S --tier sonnet|haiku --priority N --provider P --model M [--base-url U] [--max-concurrent K]
  provider-config.sh list [--source S]
  provider-config.sh reset --provider P
  provider-config.sh health
EOF
exit 2; }

cmd="${1:-}"; shift || true
case "$cmd" in
  set)
    src= tier= prio= prov= model= burl= maxc=3
    while [[ $# -gt 0 ]]; do case "$1" in
      --source) src="$2"; shift 2;; --tier) tier="$2"; shift 2;;
      --priority) prio="$2"; shift 2;; --provider) prov="$2"; shift 2;;
      --model) model="$2"; shift 2;; --base-url) burl="$2"; shift 2;;
      --max-concurrent) maxc="$2"; shift 2;; *) usage;; esac; done
    [[ -n "$src" && -n "$tier" && -n "$prio" && -n "$prov" && -n "$model" ]] || usage
    if [[ "$tier" == "opus" ]]; then echo "ERROR: opus is code-hardcoded to Anthropic; not configurable." >&2; exit 2; fi
    factory_psql \
      -v src="$src" -v tier="$tier" -v prio="$prio" -v prov="$prov" \
      -v model="$model" -v burl="${burl:-}" -v maxc="$maxc" <<'SQL'
INSERT INTO tickets.provider_config (source,tier,priority,provider,model_id,base_url,max_concurrent,updated_at)
VALUES (:'src', :'tier', :'prio'::int, :'prov', :'model', NULLIF(:'burl',''), :'maxc'::int, now())
ON CONFLICT (source,tier,priority) DO UPDATE
SET provider=EXCLUDED.provider, model_id=EXCLUDED.model_id, base_url=EXCLUDED.base_url,
    max_concurrent=EXCLUDED.max_concurrent, enabled=true, updated_at=now();
SQL
    echo "ok";;
  list)
    src=
    while [[ $# -gt 0 ]]; do case "$1" in --source) src="$2"; shift 2;; *) usage;; esac; done
    if [[ -n "$src" ]]; then
      factory_psql -v src="$src" <<'SQL'
SELECT source,tier,priority,provider,model_id,COALESCE(base_url,''),max_concurrent,enabled
FROM tickets.provider_config WHERE source=:'src' ORDER BY tier,priority;
SQL
    else
      factory_psql <<'SQL'
SELECT source,tier,priority,provider,model_id,COALESCE(base_url,''),max_concurrent,enabled
FROM tickets.provider_config ORDER BY source,tier,priority;
SQL
    fi;;
  reset)
    prov=
    while [[ $# -gt 0 ]]; do case "$1" in --provider) prov="$2"; shift 2;; *) usage;; esac; done
    [[ -n "$prov" ]] || usage
    factory_psql -v prov="$prov" <<'SQL'
INSERT INTO tickets.provider_health (provider,failure_count,cooldown_until,updated_at)
VALUES (:'prov',0,NULL,now())
ON CONFLICT (provider) DO UPDATE SET failure_count=0, cooldown_until=NULL, updated_at=now();
SQL
    echo "reset $prov";;
  health)
    factory_psql <<'SQL'
SELECT provider,failure_count,COALESCE(to_char(cooldown_until,'YYYY-MM-DD HH24:MI'),'healthy'),active_agents
FROM tickets.provider_health ORDER BY provider;
SQL
    ;;
  *) usage;;
esac
```

- [ ] **Step 4: Write `route-provider.sh`**

Emits the claim as JSON. opus short-circuits without DB. The atomic claim loop walks ordered candidates; the SQL `UPDATE … RETURNING` enforces the cap.

```bash
#!/usr/bin/env bash
# scripts/factory/route-provider.sh <source> <tier>
# Emits JSON: {"provider":..,"modelId":..,"baseUrl":..|null,"slotId":..|null,"emergency":bool}
# opus → hardcoded Anthropic, no DB. Used by dev-flow AND inlined into pipeline.js.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"; factory_resolve
SOURCE="${1:?source required}"; TIER="${2:?tier required}"

OPUS_MODEL="claude-opus-4-6"
if [[ "$TIER" == "opus" ]]; then
  printf '{"provider":"anthropic","modelId":"%s","baseUrl":null,"slotId":null,"emergency":false}\n' "$OPUS_MODEL"
  exit 0
fi

# Ordered candidates: source-specific before '*', then priority asc.
CANDS=$(factory_psql -v src="$SOURCE" -v tier="$TIER" <<'SQL'
SELECT provider||'\t'||model_id||'\t'||COALESCE(base_url,'')||'\t'||max_concurrent
FROM tickets.provider_config
WHERE (source=:'src' OR source='*') AND tier=:'tier' AND enabled=true
ORDER BY (source=:'src') DESC, priority ASC;
SQL
)

while IFS=$'\t' read -r prov model burl maxc; do
  [[ -z "$prov" ]] && continue
  # Atomic claim: only succeeds if circuit closed AND below cap. RETURNING row = claimed.
  CLAIM=$(factory_psql -v prov="$prov" -v maxc="$maxc" <<'SQL'
INSERT INTO tickets.provider_health (provider) VALUES (:'prov') ON CONFLICT (provider) DO NOTHING;
UPDATE tickets.provider_health
SET active_agents = active_agents + 1, updated_at = now()
WHERE provider = :'prov'
  AND active_agents < :'maxc'::int
  AND (cooldown_until IS NULL OR cooldown_until <= now())
RETURNING provider;
SQL
)
  if [[ -n "$CLAIM" ]]; then
    BJSON=$([[ -n "$burl" ]] && printf '"%s"' "$burl" || printf 'null')
    printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":"%s","emergency":false}\n' "$prov" "$model" "$BJSON" "$prov"
    exit 0
  fi
done <<< "$CANDS"

# Emergency fallback: Anthropic sonnet, no slot claimed.
printf '{"provider":"anthropic","modelId":"claude-sonnet-4-6","baseUrl":null,"slotId":null,"emergency":true}\n'
```

Note: `slotId` is the provider name (slots are per-provider counters, not per-claim UUIDs — release just decrements that provider's counter). Document this in a comment.

- [ ] **Step 5: Write `release-slot.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/release-slot.sh <slotId(provider)> [success=true|false]
# Decrements active_agents for the provider; success=false records a failure (→ circuit).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/lib.sh"; factory_resolve
PROV="${1:?slotId/provider required}"; SUCCESS="${2:-true}"
# null slot (opus / emergency) → nothing to release.
[[ "$PROV" == "null" || -z "$PROV" ]] && exit 0

factory_psql -v prov="$PROV" <<'SQL'
UPDATE tickets.provider_health SET active_agents = GREATEST(0, active_agents - 1), updated_at = now()
WHERE provider = :'prov';
SQL

if [[ "$SUCCESS" != "true" ]]; then
  factory_psql -v prov="$PROV" -v thr="3" -v cd="10" <<'SQL'
UPDATE tickets.provider_health
SET failure_count = failure_count + 1,
    last_failure  = now(),
    cooldown_until = CASE WHEN failure_count + 1 >= :'thr'::int
                          THEN now() + (:'cd' || ' minutes')::interval ELSE cooldown_until END,
    updated_at = now()
WHERE provider = :'prov';
SQL
fi
echo "released $PROV (success=$SUCCESS)"
```

- [ ] **Step 6: chmod + run tests to verify they pass**

```bash
chmod +x scripts/factory/provider-config.sh scripts/factory/route-provider.sh scripts/factory/release-slot.sh
cd /tmp/wt-agent-provider-routing && ./tests/runner.sh local FA-SF-70
```
Expected: PASS (offline paths: usage, opus, arg-validation).

- [ ] **Step 7: Commit**

```bash
git add scripts/factory/provider-config.sh scripts/factory/route-provider.sh scripts/factory/release-slot.sh tests/local/FA-SF-70-provider-router.bats tests/local/mocks 2>/dev/null
git commit -m "feat(provider-routing): provider-config CLI + route/release bash wrappers + FA-SF-70"
```

---

## Task 7: Website `getProviderConfig()` + wire into `claude.ts`

**Files:**
- Create: `website/src/lib/provider-config.ts`
- Create: `website/src/lib/provider-config.test.ts`
- Modify: `website/src/lib/claude.ts`

- [ ] **Step 1: Write the failing test**

Create `website/src/lib/provider-config.test.ts` (mirror the pool-mocking style of `website/src/lib/tickets-db.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: queryMock } }));

import { getProviderConfig } from './provider-config';

describe('getProviderConfig', () => {
  beforeEach(() => { queryMock.mockReset(); process.env.ANTHROPIC_API_KEY = 'k'; });

  it('returns the highest-priority healthy provider row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [
      { provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1' },
    ]});
    const c = await getProviderConfig('website-llm', 'sonnet');
    expect(c.modelId).toBe('deepseek-chat');
    expect(c.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('falls back to anthropic sonnet on DB error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    const c = await getProviderConfig('website-llm', 'sonnet');
    expect(c.provider).toBe('anthropic');
    expect(c.modelId).toBe('claude-sonnet-4-6');
    expect(c.baseUrl).toBeNull();
  });

  it('opus tier never queries the DB', async () => {
    const c = await getProviderConfig('website-llm', 'opus');
    expect(c.provider).toBe('anthropic');
    expect(queryMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd website && pnpm vitest run src/lib/provider-config.test.ts`
Expected: FAIL — cannot resolve `./provider-config`.

- [ ] **Step 3: Implement `getProviderConfig`**

Create `website/src/lib/provider-config.ts`. The website path is read-only (it does NOT claim circuit-breaker slots — concurrency capping is a Factory concern; the website just picks the top healthy non-cooldown provider). It still honours cooldown so a dead provider isn't used.

```ts
import { pool } from './website-db';

export interface ProviderChoice {
  provider: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string;
}

const OPUS_MODEL = 'claude-opus-4-6';
const FALLBACK: Omit<ProviderChoice, 'apiKey'> = {
  provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null,
};

/** Read the configured provider for (source, tier). opus → hardcoded Anthropic.
 *  Any DB error → Anthropic-sonnet fallback (the website must never hard-fail on routing). */
export async function getProviderConfig(source: string, tier: 'sonnet' | 'haiku' | 'opus'): Promise<ProviderChoice> {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (tier === 'opus') return { provider: 'anthropic', modelId: OPUS_MODEL, baseUrl: null, apiKey };
  try {
    const { rows } = await pool.query(
      `SELECT pc.provider, pc.model_id, pc.base_url
         FROM tickets.provider_config pc
         LEFT JOIN tickets.provider_health ph ON ph.provider = pc.provider
        WHERE (pc.source = $1 OR pc.source = '*') AND pc.tier = $2 AND pc.enabled = true
          AND (ph.cooldown_until IS NULL OR ph.cooldown_until <= now())
        ORDER BY (pc.source = $1) DESC, pc.priority ASC
        LIMIT 1`,
      [source, tier],
    );
    if (rows.length) {
      return { provider: rows[0].provider, modelId: rows[0].model_id, baseUrl: rows[0].base_url ?? null, apiKey };
    }
  } catch (err) {
    console.error('[provider-config] DB lookup failed, falling back to anthropic:', err);
  }
  return { ...FALLBACK, apiKey };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd website && pnpm vitest run src/lib/provider-config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `claude.ts`**

Modify `website/src/lib/claude.ts`. Replace the hardcoded client + model with the router. Keep the early-return when no API key is configured.

```ts
import Anthropic from '@anthropic-ai/sdk';
import { getProviderConfig } from './provider-config';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
```

In `generateMeetingInsights`, replace the client construction and the `model:` literal:

```ts
  if (!ANTHROPIC_API_KEY) {
    console.log('[claude] No API key configured. Skipping insights generation.');
    return null;
  }

  const cfg = await getProviderConfig('website-llm', 'sonnet');
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
  });
```

and:

```ts
    const response = await client.messages.create({
      model: cfg.modelId,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
```

- [ ] **Step 6: Typecheck + commit**

```bash
cd website && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'claude|provider-config' || echo "no type errors in touched files"
cd /tmp/wt-agent-provider-routing
git add website/src/lib/provider-config.ts website/src/lib/provider-config.test.ts website/src/lib/claude.ts
git commit -m "feat(provider-routing): website getProviderConfig + claude.ts uses DB-configured provider"
```

---

## Task 8: Dashboard Provider-Status widget

**Files:**
- Modify: `website/src/lib/factory-floor.ts` (add `getProviderHealth`, extend `FloorPayload`)
- Modify: `website/src/lib/factory-floor.test.ts`
- Modify: `website/src/components/FactoryFloor.svelte`
- Verify: `website/src/pages/api/factory-floor.ts` returns the new field (it spreads `getFloor`'s payload — confirm).

- [ ] **Step 1: Write the failing test**

Append to `website/src/lib/factory-floor.test.ts` a test for `getProviderHealth` (mirror the existing `getControl`/`getHall` test setup in that file — reuse its pool mock):

```ts
import { getProviderHealth } from './factory-floor';

it('getProviderHealth maps rows to status objects with cooldown flag', async () => {
  // configure the file's existing pool mock to return:
  // provider_config join provider_health → deepseek healthy 2/3, ollama cooldown.
  const rows = await getProviderHealth();
  expect(rows.find(r => r.provider === 'deepseek')).toMatchObject({ activeAgents: 2, maxConcurrent: 3, status: 'healthy' });
  expect(rows.find(r => r.provider === 'ollama')?.status).toBe('cooldown');
});
```

(Adapt the mock-row injection to whatever mechanism `factory-floor.test.ts` already uses — do not invent a new harness.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: FAIL — `getProviderHealth` is not exported.

- [ ] **Step 3: Implement `getProviderHealth` + extend payload**

In `website/src/lib/factory-floor.ts`, add the interface + function and include it in `getFloor`'s returned payload:

```ts
export interface ProviderStatus {
  provider: string;
  status: 'healthy' | 'cooldown';
  activeAgents: number;
  maxConcurrent: number;
  cooldownUntil: string | null;
  tiers: string[];        // tiers this provider serves (from provider_config)
}

export async function getProviderHealth(): Promise<ProviderStatus[]> {
  const { rows } = await pool.query(`
    SELECT ph.provider,
           ph.active_agents,
           ph.cooldown_until,
           COALESCE(MAX(pc.max_concurrent), 3) AS max_concurrent,
           COALESCE(array_agg(DISTINCT pc.tier) FILTER (WHERE pc.tier IS NOT NULL), '{}') AS tiers
      FROM tickets.provider_health ph
      LEFT JOIN tickets.provider_config pc ON pc.provider = ph.provider AND pc.enabled = true
     GROUP BY ph.provider, ph.active_agents, ph.cooldown_until
     ORDER BY ph.provider`);
  const now = Date.now();
  return rows.map((r: any) => ({
    provider: r.provider,
    status: r.cooldown_until && new Date(r.cooldown_until).getTime() > now ? 'cooldown' : 'healthy',
    activeAgents: Number(r.active_agents),
    maxConcurrent: Number(r.max_concurrent),
    cooldownUntil: r.cooldown_until ?? null,
    tiers: r.tiers ?? [],
  }));
}
```

Add `providerHealth: ProviderStatus[]` to the `FloorPayload` interface, and in `getFloor` add it to the `Promise.all`/returned object:

```ts
  const providerHealth = await getProviderHealth();
  // … include `providerHealth` in the returned payload object …
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the widget in `FactoryFloor.svelte`**

In `website/src/components/FactoryFloor.svelte`:

(a) Extend the `FloorPayload` interface (line ~11) with `providerHealth: ProviderStatus[];` and add the type:

```ts
  interface ProviderStatus { provider: string; status: 'healthy'|'cooldown'; activeAgents: number; maxConcurrent: number; cooldownUntil: string | null; tiers: string[]; }
```

(b) Add a `cooldownLabel` helper near `relTime`:

```ts
  function cooldownLabel(iso: string | null): string {
    if (!iso) return '';
    const min = Math.ceil((new Date(iso).getTime() - Date.now()) / 60000);
    return min > 0 ? `wieder in ${min}min` : '';
  }
```

(c) Insert the widget right after the Leitstand grid (after the closing `</div>` of `data-testid="floor-leitstand"`, ~line 205):

```svelte
    <!-- Provider-Status -->
    <div class="mb-6 rounded-xl bg-white/5 p-3" data-testid="floor-provider-status">
      <h3 class="font-semibold mb-2 text-sm">Provider-Status</h3>
      {#if !data.providerHealth || data.providerHealth.length === 0}
        <p class="text-muted text-xs">Keine Provider-Telemetrie.</p>
      {:else}
        <ul class="space-y-1 text-sm">
          {#each data.providerHealth as p (p.provider)}
            <li class="flex items-center gap-3" data-testid="provider-row">
              <span class="h-2 w-2 rounded-full {p.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'}"
                    title={p.status}></span>
              <span class="font-mono w-24">{p.provider}</span>
              <span class="text-muted w-20">{p.activeAgents}/{p.maxConcurrent} aktiv</span>
              <span class="text-muted flex-1">{p.tiers.join(', ') || '—'}</span>
              {#if p.status === 'cooldown'}<span class="text-amber-400/90 text-xs">{cooldownLabel(p.cooldownUntil)}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
```

The existing SSE/`refresh()` already repaints `data` on every poll, so the widget updates without new wiring.

- [ ] **Step 6: Confirm the API route forwards the field**

Read `website/src/pages/api/factory-floor.ts`. If it returns `await getFloor(cap)` verbatim, no change is needed (the new field rides along). If it cherry-picks fields, add `providerHealth`. Make the minimal edit only if required.

- [ ] **Step 7: Typecheck + commit**

```bash
cd website && pnpm vitest run src/lib/factory-floor.test.ts
cd /tmp/wt-agent-provider-routing
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts website/src/components/FactoryFloor.svelte website/src/pages/api/factory-floor.ts
git commit -m "feat(provider-routing): provider-status widget on the factory floor"
```

---

## Task 9: SPIKE — verify per-`agent()` provider override, then integrate `pipeline.js`

**This is the highest-risk task. Do the spike FIRST; its result decides the integration shape.** See CRITICAL CONTEXT #3 and #4.

**Files:**
- Modify: `scripts/factory/pipeline.js`

- [ ] **Step 1: Spike — determine how a Workflow `agent()` call selects model + base URL**

Investigate (do NOT guess):
1. Re-read the header + existing `agent(..., { model })` call sites in `pipeline.js` (the `provision().model` usage at the Implement/Verify lenses). Confirm that `{ model }` is already an accepted per-call option.
2. Search the harness/skill docs for whether `agent(prompt, { env })` or a per-call `baseURL`/`provider` option exists:
   `grep -ridE 'ANTHROPIC_BASE_URL|baseURL|agent\(.*env' scripts/factory .claude 2>/dev/null | head` and check `scripts/factory/wakeup.sh` (process-level export) + `dispatcher.js`.
3. Record the verdict in a comment block at the top of the integration in `pipeline.js`.

**Decision rule:**
- **If per-call `env`/`baseURL` override IS supported:** route each non-opus `agent()` call individually (full design).
- **If NOT supported (likely — current DeepSeek routing is process-level via `wakeup.sh`):** the `baseURL` cannot vary per call within one process. Then the integration is: at the **start of the pipeline**, call `route-provider.sh <source> sonnet` ONCE to pick the dominant provider; export its `ANTHROPIC_BASE_URL`/model into `process.env` for the run; still call `routeProvider` per phase to claim/release slots + record failures (resilience/capacity tracking stays live), but only the `model` field varies per `agent()` call. Document this limitation inline and in the plan's Notes.

Pick the branch that matches reality. The rest of this task assumes per-call `model` always works (it does — see point 1) and treats `baseURL` per the decision.

- [ ] **Step 2: Inline the router helpers into `pipeline.js`**

After the existing inlined `provision()` block (~line 92), add an inlined router that shells out to the wrappers (Workflow scripts cannot `import`; `require('child_process')` is allowed and already used):

```js
// ── Inlined provider router (provider-router.js is the unit-tested SSOT; the
//    Workflow harness forbids ESM imports, so we shell out to the bash wrappers
//    which talk to tickets.provider_config / provider_health). opus → no DB. ──
function routeProviderSync(source, tier) {
  // returns { provider, modelId, baseUrl, slotId, emergency }
  if (tier === 'opus') return { provider: 'anthropic', modelId: 'claude-opus-4-6', baseUrl: null, slotId: null, emergency: false }
  // Autopilot manual override (spec "Autopilot Override"): ANTHROPIC_MODEL in autopilot.env
  // wins over the DB router for ALL non-opus factory calls — fast manual intervention without DB.
  // wakeup.sh already strips [1m]; here we just honour a non-empty value (no slot claimed).
  if (process.env.ANTHROPIC_MODEL) {
    return { provider: 'anthropic-compat', modelId: process.env.ANTHROPIC_MODEL,
             baseUrl: process.env.ANTHROPIC_BASE_URL || null, slotId: null, emergency: false }
  }
  try {
    const { execFileSync } = require('child_process')
    const out = execFileSync('bash', [`${REPO}/scripts/factory/route-provider.sh`, source, tier],
      { encoding: 'utf8', timeout: 20000, env: { ...process.env, BRAND: brand } }).trim()
    return JSON.parse(out)
  } catch (e) {
    log(`routeProvider(${source},${tier}) failed → emergency anthropic-sonnet: ${e.message}`)
    return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null, slotId: null, emergency: true }
  }
}
function releaseSlotSync(slotId, success) {
  if (!slotId) return
  try {
    const { execFileSync } = require('child_process')
    execFileSync('bash', [`${REPO}/scripts/factory/release-slot.sh`, String(slotId), success ? 'true' : 'false'],
      { stdio: 'ignore', timeout: 20000, env: { ...process.env, BRAND: brand } })
  } catch (e) { log(`releaseSlot(${slotId}) failed (non-fatal): ${e.message}`) }
}
// Map a role/phase to a provider-router `source`.
function routerSource(phaseKey) {
  return ({ scout: 'factory-scout', design: 'factory-plan', plan: 'factory-plan',
            implement: 'factory-implement', verify: 'factory-review', deploy: 'factory-implement' })[phaseKey] || '*'
}
// Map provision()'s tier (haiku|sonnet|opus|null) to a router tier (default sonnet for null).
function routerTier(model) { return model === 'opus' ? 'opus' : (model === 'haiku' ? 'haiku' : 'sonnet') }
```

(`brand` and `REPO` are already defined in the `main()` scope above this point.)

- [ ] **Step 3: Wrap the Implement-phase `agent()` call with claim/release**

Replace the per-task implement block (~lines 366–386). Keep `provision()` for `effort`/`contextHints`; use the router for `model` + slot:

```js
  for (const t of tasks) {
    const prov = provision({ complexity: featureComplexity, role: 'implement', risk: (t.target_files?.some((f) => /\.sql$|^k3d\/|^environments\/|realm.*\.json/.test(f)) ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: t.target_files, gpuEmbeddings: false })
    const route = routeProviderSync('factory-implement', routerTier(prov.model))
    let impl = null
    try {
      impl = await agent(
        `…(unchanged implement prompt)…` + consumeInjections('implement'),
        { label: `impl:${t.id}`, phase: 'Implement', model: route.modelId },
      )
      releaseSlotSync(route.slotId, impl != null)   // null return = agent died → record failure
    } catch (err) {
      releaseSlotSync(route.slotId, false)
      throw err
    }
    if (impl == null) continue
    const verify = await agent( /* unchanged self-verify */ )
    if (verify != null) implemented.push(verify)
  }
```

Keep the implement prompt body byte-for-byte identical to the current one — only the `{ ...prov.model ? {model} : {} }` option is replaced by `{ model: route.modelId }` and the try/finally release is added.

- [ ] **Step 4: Wrap the Verify review-lens `agent()` calls**

The review/security lenses are opus-tier (correctness-critical) — route them through `routeProviderSync('factory-review', 'opus')`, which returns the Anthropic-opus no-DB choice (slotId null → release no-op). This keeps the opus invariant explicit and uniform:

```js
  reviews = (await parallel(lenses.map((l) => () => {
    const route = routeProviderSync('factory-review', 'opus')   // opus → anthropic, slotId null
    return agent(
      `…(unchanged review prompt)…` + consumeInjections('verify'),
      { label: `review:${l.key}`, phase: 'Verify', ...(l.key === 'agents-md' ? {} : { schema: REVIEW_SCHEMA }), model: route.modelId },
    )
  }))).filter(Boolean)
```

The coordinator call similarly uses `routeProviderSync('factory-review','opus').modelId` for `model`. Since opus → no slot, no release is needed, but keeping the router call documents intent and routes through one code path.

- [ ] **Step 5: Plan/Design phase routing**

The Plan-decompose `agent()` call currently uses `planProv.model`. Replace with `routeProviderSync('factory-plan', routerTier(planProv.model)).modelId` for `model`, and release its slot after the call (opus complexity → no-op). The Design call has no explicit model today — leave it inheriting the loop default (do NOT add a route unless it already set `model`). Keep changes minimal and surgical.

- [ ] **Step 6: Offline lint + contract test**

```bash
cd /tmp/wt-agent-provider-routing
node --check scripts/factory/pipeline.js
./tests/runner.sh local FA-SF-20
```
Expected: `node --check` clean; FA-SF-20 (pipeline structure contract) PASS. If FA-SF-20 asserts specific `agent()` option shapes, update those assertions to match the new `model: route.modelId` form.

- [ ] **Step 7: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(provider-routing): pipeline.js routes agents via provider-router (slot claim/release)"
```

---

## Task 10: dev-flow-execute integration (documentation + optional wrapper call)

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (or the implement-substep doc it references)

dev-flow-execute spawns subagents interactively, not via the Workflow `agent()` API, so the integration is a documented convention: before spawning an implementation subagent, the skill calls `route-provider.sh dev-flow-execute sonnet`, uses the returned `modelId`/`baseUrl`, and calls `release-slot.sh` after.

- [ ] **Step 1: Locate the subagent-spawn step**

Run: `grep -n 'subagent\|model\|spawn\|dispatch' .claude/skills/dev-flow-execute/SKILL.md | head`
Identify where the skill provisions the implementation subagent.

- [ ] **Step 2: Add the routing convention**

Insert a short block in the implementation step:

````markdown
### Provider-Routing (Kosten/Resilienz)

Vor dem Spawnen eines Implementierungs-Subagenten den Provider routen:

```bash
ROUTE=$(bash scripts/factory/route-provider.sh dev-flow-execute sonnet)
MODEL=$(echo "$ROUTE" | jq -r .modelId)
SLOT=$(echo "$ROUTE" | jq -r .slotId)
BASE_URL=$(echo "$ROUTE" | jq -r '.baseUrl // empty')
```

Subagent mit `--model "$MODEL"` (und, falls `$BASE_URL` gesetzt, `ANTHROPIC_BASE_URL="$BASE_URL"`) spawnen.
Danach den Slot freigeben:

```bash
bash scripts/factory/release-slot.sh "$SLOT" true   # false bei Fehlschlag → Circuit-Breaker
```

`opus`/plan-kritische Subagenten IMMER ohne Routing (hardcodiert Anthropic).
````

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "docs(provider-routing): dev-flow-execute routes implementation subagents via wrappers"
```

---

## Task 11: Full offline suite + freshness + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full offline test suite**

Run: `cd /tmp/wt-agent-provider-routing && task test:all`
Expected: GREEN. Investigate any red (likely culprits: FA-SF-20 option-shape assertions, test-inventory drift).

- [ ] **Step 2: Run the factory unit + contract subset explicitly**

```bash
node --test scripts/factory/provider-router.test.mjs
./tests/runner.sh local FA-SF-70
./tests/runner.sh local FA-SF-20
```
Expected: all PASS.

- [ ] **Step 3: Website unit tests**

```bash
cd website && pnpm vitest run src/lib/provider-config.test.ts src/lib/factory-floor.test.ts src/lib/tickets-db.providerrouting.test.ts
```
Expected: all PASS.

- [ ] **Step 4: Regenerate freshness artifacts**

Run: `cd /tmp/wt-agent-provider-routing && task freshness:regenerate`
Then: `git status --porcelain` — if `test-inventory.json` or other generated files changed, commit them:

```bash
git add -A && git commit -m "chore: refresh generated artifacts (provider-routing)"
```

- [ ] **Step 5: Manifest validation (touched no manifests, but confirm)**

Run: `task workspace:validate`
Expected: PASS (no manifest changes in this feature, but the suite is cheap insurance).

- [ ] **Step 6: Final summary**

Confirm every spec file in the "Dateien" table is implemented:
- `provider-router.js` ✓ (Task 3–5), `provider-config.sh` ✓ (Task 6), `route-provider.sh`/`release-slot.sh` ✓ (Task 6)
- `pipeline.js` ✓ (Task 9), `claude.ts` ✓ (Task 7), `FactoryFloor.svelte` ✓ (Task 8), DB migration ✓ (Task 1–2)

---

## Notes / Deviations from the spec

1. **Schema is `tickets.*`, not `factory.*`** — there is no `factory` Postgres schema in this codebase; every Factory table lives under `tickets`. (CRITICAL CONTEXT #1.)
2. **`pipeline.js` inlines the router** (shells out to the bash wrappers) because Workflow scripts cannot ESM-import. The pure `provider-router.js` is the unit-tested SSOT. (CRITICAL CONTEXT #3.)
3. **Per-call `baseURL` override is spiked in Task 9.** If the Workflow harness only honours a process-level `ANTHROPIC_BASE_URL`, the implementer falls back to set-once-per-run base URL + per-call `model` + per-phase slot claim/release. The DB/CLI/website/dashboard work is independent of this discovery. (CRITICAL CONTEXT #4.)
4. **`slotId` == provider name** — slots are per-provider integer counters (`active_agents`), not per-claim UUIDs; release decrements the named provider's counter. Simpler than UUID bookkeeping and matches the per-provider `max_concurrent` cap.
5. **Website path does not claim circuit-breaker slots** — concurrency capping is a Factory concern. The website only reads the top healthy (non-cooldown) provider; it does honour cooldown so a dead provider isn't selected.
6. **Apply the migration to BOTH brands** (`workspace` AND `workspace-korczewski`) — separate per-brand DBs (standard fleet gotcha). `initTicketsSchema()` handles this automatically on website boot per brand; manual `factory_psql` bring-up must be run twice (`BRAND=mentolder` and `BRAND=korczewski`).
7. **Not in scope** (per spec): token/budget tracking, cost reporting, model benchmarking, >2 concurrent providers.
