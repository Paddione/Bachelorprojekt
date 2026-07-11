---
title: "factory-provider-baseurl-routing — Implementation Plan"
ticket_id: T001681
domains: [factory, testing]
status: draft
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-provider-baseurl-routing — Implementation Plan

## File Structure

New and modified files, grouped by responsibility.

**Migration (already committed, scope correction only):**
- Modify: `scripts/migrations/2026-07-03-local-qwen35-seed.sql` — remove `factory-scout`, `factory-plan`, `lavish-artifact` from the demotion CTE `WHERE source IN (...)` and from the `INSERT ... VALUES` block; only `ticket-triage` remains seeded to `local-qwen35`.

**Guard helper (pure, offline-testable):**
- Modify: `scripts/factory/build-loop.cjs` — add exported `resolveAgentModel(route, fallbackTier, logFn)`; wire the one existing `model:` passthrough in `runTaskVerifyLoop` (line ~66) through it; add it to `module.exports`.

**Call-site wiring (harness `agent()` calls that currently pass a raw `X.modelId`):**
- Modify: `scripts/factory/pipeline.js` — 5 call sites (lines 151, 303, 419, 495, 543 per current `grep -n "model: .*\.modelId" scripts/factory/pipeline.js`) switched from `model: X.modelId` to `model: BL.resolveAgentModel(X, <fallbackTier>, log)`.

**Tests (already exist, RED — no new test file):**
- No change: `scripts/factory/build-loop.test.cjs` — the 4 `resolveAgentModel: ...` tests (lines ~125-157) already exist and are RED; this plan turns them GREEN. No new test cases are added.

**Unchanged (explicitly out of scope):** `scripts/factory/route-provider.sh`, `website/src/lib/ticket-triage.ts` (already correctly implements its own baseURL-aware SDK client), `scripts/factory/pipeline-decompose.cjs`.

---

**Goal:** Stop the silent loss of local-provider routing (`baseUrl` + custom `modelId`) when `pipeline.js`/`build-loop.cjs` call the harness `agent()` primitive, which only accepts `model ∈ {sonnet,opus,haiku,fable}`. Replace silent drop with a logged, deterministic fallback, and stop seeding DB rows for sources (`factory-scout`, `factory-plan`, `lavish-artifact`) where local routing can never take effect because they go through `agent()`, not a raw SDK client.

**Architecture:** `routeProviderSync(source, tier)` → `{ modelId, baseUrl, ... }` (possibly a local-qwen35 custom string + baseUrl) → **NEW:** `BL.resolveAgentModel(route, fallbackTier, log)` → a value guaranteed to be one of `sonnet|opus|haiku|fable` → `agent(prompt, { model, ... })`. `fallbackTier` at each call site is derived from the same tier value the route was originally requested with (`routerTier(prov.model)` for implement/batch/plan sites, the literal `'opus'` for the two review sites, `'sonnet'` as the last-resort default for the `build-loop.cjs` `runTaskVerifyLoop` site, since `prov` there is a `D.provision()` result with no explicit tier variable in scope).

**Tech Stack:** Node.js (CJS `build-loop.cjs`, ESM `pipeline.js` requiring it as `BL`), `node --test`, PostgreSQL (`tickets.provider_config`), BATS/Taskfile CI gates.

## Global Constraints

- `resolveAgentModel` is a **pure function** — no I/O, no DB, no network (S2: `build-loop.cjs` header already documents "pure, require-able... No DB/API imports").
- Do not invent new test cases — the 4 RED tests in `build-loop.test.cjs` (lines ~125-157) are the acceptance criteria; do not modify their assertions.
- Do not touch `website/src/lib/ticket-triage.ts` — it already works correctly and is out of scope.
- Migration file `scripts/migrations/2026-07-03-local-qwen35-seed.sql` must stay idempotent: keep the `ON CONFLICT (source, tier, priority) DO UPDATE` semantics and the `provider <> 'local-qwen35'` demotion guard, only narrow the `source` set.
- No new hardcoded hostnames introduced (S3 not applicable here — no `k3d/`/`prod*/`/`website/src/` files touched).

### S1 line-budget pre-flight (per touched, gated file)

Both files are **not baselined** (`docs/code-quality/baseline.json` has no `S1:scripts/factory/pipeline.js` or `S1:scripts/factory/build-loop.cjs` key) — effective threshold is the static extension limit.

| Datei | Limit (Ext.) | Ist (`wc -l`) | Budget | Strategie |
|-------|-------------:|---------------:|-------:|-----------|
| `scripts/factory/pipeline.js` (`.js`) | 600 | 713 | **already over static limit, but unbaselined → ratchet only blocks on baseline growth for baselined files; new/unbaselined files over their static limit still fail S1** — keep the diff net-zero-or-negative (5 one-line `model:` value changes, no new lines) so this task does not newly trip the check beyond its pre-existing state. | One-line change per call site: `model: X.modelId` → `model: BL.resolveAgentModel(X, <fallbackTier>, log)`. Zero net new lines. |
| `scripts/factory/build-loop.cjs` (`.cjs`) | 200 | 72 | 128 | Add `resolveAgentModel` (~10 lines) + wire `runTaskVerifyLoop` (0 net new lines, edit in place) + export entry (0 net new lines, extend existing `module.exports` line). Net growth ≈ +10 lines, well inside budget. |

`pipeline.js` is already 713 lines (over the static 600 limit) but **not present in `baseline.json`** — confirm with `task freshness:check` in the final verification task that this pre-existing state does not newly regress. If `check.mjs` treats "unbaselined + over static limit" as a hard block regardless of this plan's changes, that is a pre-existing condition outside this ticket's scope (T001681 is a routing bug fix, not a pipeline.js size reduction); the final verification step must confirm this explicitly and, if it blocks, escalate rather than silently paper over it with a baseline exception (Gate S1 rule 6: never add a baseline/ignore exception to bypass the threshold).

---

### Task 1: Guard helper `resolveAgentModel` in `build-loop.cjs`

**Files:**
- Modify: `scripts/factory/build-loop.cjs`

**Interfaces:**
- Produces: `resolveAgentModel(route, fallbackTier, logFn)` — exported pure function.
- Consumed by: Task 2 (`pipeline.js` call sites) and this same file's `runTaskVerifyLoop`.

- [ ] **Step 1: Confirm the existing RED tests.**

```bash
node --test scripts/factory/build-loop.test.cjs 2>&1 | grep -A3 "resolveAgentModel"
# Expected: FAIL — TypeError: BL.resolveAgentModel is not a function (4 failing tests, lines ~125-157 of build-loop.test.cjs)
```

- [ ] **Step 2: Add `resolveAgentModel` to `scripts/factory/build-loop.cjs`**, placed after `feedbackBlock` and before `runTaskVerifyLoop`:

```js
const VALID_TIERS = new Set(['sonnet', 'opus', 'haiku', 'fable'])

function resolveAgentModel(route, fallbackTier, logFn) {
  if (!route) return fallbackTier
  if (!route.baseUrl && VALID_TIERS.has(route.modelId)) return route.modelId
  if (typeof logFn === 'function') {
    logFn(`resolveAgentModel: dropped custom modelId "${route.modelId}" (baseUrl set or not a harness tier) — falling back to "${fallbackTier}"`)
  }
  return fallbackTier
}
```

- [ ] **Step 3: Wire the guard into `runTaskVerifyLoop`** (currently line ~66):

```js
// before:
const result = await agentFn(prompt, { label: `impl:${t.id}:${i}`, phase: 'Implement', ...(prov && i === 0 ? { model: prov.modelId || prov.model } : {}) })

// after:
const model = i === 0 ? resolveAgentModel({ modelId: prov?.modelId || prov?.model, baseUrl: prov?.baseUrl }, prov?.model || 'sonnet', globalThis.log) : null
const result = await agentFn(prompt, { label: `impl:${t.id}:${i}`, phase: 'Implement', ...(model ? { model } : {}) })
```

`prov` here is a `D.provision()` result (`{ model, effort, contextHints }`, no `baseUrl` field) — `route.baseUrl` is `undefined` for it, which the guard already treats as falsy, so this call is a no-op today and only activates once/if `prov`-shaped objects gain a `baseUrl` field. `globalThis.log` mirrors the harness-injected `log` global documented in `pipeline.js`'s header comment; `build-loop.cjs` has no harness-injected `log` of its own, so guard against it being undefined by only calling `logFn` when it is a function (already handled inside `resolveAgentModel`).

- [ ] **Step 4: Add `resolveAgentModel` to `module.exports`**:

```js
module.exports = { normalize, sigHash, decide, feedbackBlock, runTaskVerifyLoop, resolveAgentModel, ESCALATE_CLASSES, ALLOWED_CLASSES, MAX_DEFAULT }
```

- [ ] **Step 5: Confirm the tests now pass.**

```bash
node --test scripts/factory/build-loop.test.cjs
# Expected: PASS — all tests including the 4 resolveAgentModel cases green
node --check scripts/factory/build-loop.cjs
# Expected: exit 0 (offline syntax check, per file header comment)
```

- [ ] **Step 6: Commit.**

```bash
git add scripts/factory/build-loop.cjs
git commit -m "fix(factory): add resolveAgentModel guard against baseUrl passthrough [T001681]"
```

---

### Task 2: Wire the guard into all 5 `pipeline.js` call sites

**Files:**
- Modify: `scripts/factory/pipeline.js`

**Interfaces:**
- Consumes: `BL.resolveAgentModel` from Task 1 (`pipeline.js` already imports `build-loop.cjs` as `BL` at line 19 — no new require).
- Consumes: harness-injected `log` global (already used throughout `pipeline.js`, e.g. `log(\`Batch: ...\`)`).

- [ ] **Step 1: Re-verify the exact call-site line numbers** (they may have shifted since the design spec was written):

```bash
grep -n "model: .*\.modelId" scripts/factory/pipeline.js
```

- [ ] **Step 2: Batch sub-features (line ~151)** — inside `subResults = await parallel(A.sub_features.map(...))`, `sfRoute = routeProviderSync('factory-implement', routerTier(sfProv.model))` is already in scope:

```js
// before:
{ label: `batch:${sf.id}`, phase: 'Implement', model: sfRoute.modelId },
// after:
{ label: `batch:${sf.id}`, phase: 'Implement', model: BL.resolveAgentModel(sfRoute, routerTier(sfProv.model), log) },
```

- [ ] **Step 3: Plan decompose (line ~303)** — `planRoute = routeProviderSync('factory-plan', routerTier(planProv.model))` is already in scope:

```js
// before:
{ model: planRoute.modelId, label: 'plan:decompose', phase: 'Plan', schema: {...} },
// after:
{ model: BL.resolveAgentModel(planRoute, routerTier(planProv.model), log), label: 'plan:decompose', phase: 'Plan', schema: {...} },
```

- [ ] **Step 4: Implement task loop (line ~419)** — `route = routeProviderSync('factory-implement', routerTier(prov.model))` is already in scope:

```js
// before:
{ label: `impl:${t.id}`, phase: 'Implement', model: route.modelId },
// after:
{ label: `impl:${t.id}`, phase: 'Implement', model: BL.resolveAgentModel(route, routerTier(prov.model), log) },
```

- [ ] **Step 5: Review lenses (line ~495)** — inside `reviews = (await parallel(lenses.map((l) => () => { const route = routeProviderSync('factory-review', 'opus'); ... })))`, the tier is the literal `'opus'`:

```js
// before:
{ label: `review:${l.key}`, phase: 'Verify', ...(l.key === 'agents-md' ? {} : { schema: REVIEW_SCHEMA }), model: route.modelId },
// after:
{ label: `review:${l.key}`, phase: 'Verify', ...(l.key === 'agents-md' ? {} : { schema: REVIEW_SCHEMA }), model: BL.resolveAgentModel(route, 'opus', log) },
```

- [ ] **Step 6: Review coordinator (line ~543)** — `coordRoute = routeProviderSync('factory-review', 'opus')` is already in scope, tier is the literal `'opus'`:

```js
// before:
{ label: 'review:coordinator', phase: 'Verify', schema: COORDINATOR_SCHEMA, model: coordRoute.modelId },
// after:
{ label: 'review:coordinator', phase: 'Verify', schema: COORDINATOR_SCHEMA, model: BL.resolveAgentModel(coordRoute, 'opus', log) },
```

- [ ] **Step 7: Offline syntax + import check.**

```bash
node --check scripts/factory/pipeline.js
# Expected: exit 0
node -e "require('./scripts/factory/build-loop.cjs').resolveAgentModel({modelId:'x',baseUrl:'y'}, 'sonnet', console.log)"
# Expected: prints the log line and no throw (sanity check that BL.resolveAgentModel is reachable the same way pipeline.js reaches it)
```

- [ ] **Step 8: Commit.**

```bash
git add scripts/factory/pipeline.js
git commit -m "fix(factory): route all agent() model args through resolveAgentModel guard [T001681]"
```

---

### Task 3: Migration scope correction — drop factory-scout/factory-plan/lavish-artifact

**Files:**
- Modify: `scripts/migrations/2026-07-03-local-qwen35-seed.sql`

**Interfaces:**
- Produces: a migration that seeds `local-qwen35` priority-1 routing **only** for `ticket-triage` (the one source with a real baseURL-aware SDK client, `website/src/lib/ticket-triage.ts`).

- [ ] **Step 1: Narrow the demotion CTE's `WHERE source IN (...)`** from:

```sql
WHERE source IN ('factory-scout','factory-plan','ticket-triage','lavish-artifact')
```

to:

```sql
WHERE source IN ('ticket-triage')
```

- [ ] **Step 2: Narrow the `INSERT ... VALUES` block** from 4 rows to 1 row — remove the `factory-scout`, `factory-plan`, `lavish-artifact` lines, keep only:

```sql
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, context_window, context_budget, enabled)
VALUES
  ('ticket-triage', 'haiku', 1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider       = EXCLUDED.provider,
      model_id       = EXCLUDED.model_id,
      base_url       = EXCLUDED.base_url,
      context_window = EXCLUDED.context_window,
      context_budget = EXCLUDED.context_budget,
      enabled        = EXCLUDED.enabled,
      updated_at     = now();
```

- [ ] **Step 3: Update the file's own header comment** ("Routes context-light orchestration sources...") to reflect the narrowed scope — replace any reference to the four sources with "the `ticket-triage` source" and add a one-line note: `-- Scope-corrected 2026-07-09 (T001681): factory-scout/factory-plan/lavish-artifact removed —`
  `-- they call the harness agent() primitive, which has no baseUrl support; only ticket-triage`
  `-- uses its own baseURL-aware SDK client (website/src/lib/ticket-triage.ts) and benefits from this row.`

- [ ] **Step 4: Confirm idempotency is preserved by inspection** (no live DB apply required for this plan — it is re-run manually per the file's own header instructions against both brand DBs when staged):

```bash
grep -n "ON CONFLICT (source, tier, priority) DO UPDATE" scripts/migrations/2026-07-03-local-qwen35-seed.sql
grep -n "provider <> 'local-qwen35'" scripts/migrations/2026-07-03-local-qwen35-seed.sql
# Expected: both patterns still present — idempotency guard untouched
grep -cE "^\s*\('factory-scout'|^\s*\('factory-plan'|^\s*\('lavish-artifact'" scripts/migrations/2026-07-03-local-qwen35-seed.sql
# Expected: FAIL if any of these three source literals still appear in a VALUES row — command should print 0
```

- [ ] **Step 5: Commit.**

```bash
git add scripts/migrations/2026-07-03-local-qwen35-seed.sql
git commit -m "fix(factory): narrow local-qwen35 seed migration to ticket-triage only [T001681]"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full targeted test run.**

```bash
node --test scripts/factory/build-loop.test.cjs
# Expected: PASS — all tests green, including the 4 resolveAgentModel cases
node --check scripts/factory/pipeline.js scripts/factory/build-loop.cjs
# Expected: exit 0 for both
```

- [ ] **Step 2: Confirm no remaining unguarded `model: X.modelId` passthrough.**

```bash
grep -n "model: .*\.modelId" scripts/factory/pipeline.js
# Expected: no output (every call site now routes through BL.resolveAgentModel)
```

- [ ] **Step 3: S1 sanity check — confirm net line growth stayed inside the Task-1/Task-2 budget.**

```bash
wc -l scripts/factory/build-loop.cjs scripts/factory/pipeline.js
jq -r '."S1:scripts/factory/build-loop.cjs".metric // "nicht-baselined"' docs/code-quality/baseline.json
jq -r '."S1:scripts/factory/pipeline.js".metric // "nicht-baselined"' docs/code-quality/baseline.json
```

- [ ] **Step 4: Run the three mandatory CI gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Expected: `task test:changed` detects `scripts/factory/` changes and runs `task test:factory` (which includes `node --test scripts/factory/build-loop.test.cjs`) plus `quality:check`, all green; `task freshness:regenerate` leaves the tree clean (no test-inventory change — no test files were added or removed); `task freshness:check` passes the S1–S4 ratchet and baseline key-count assertion (no new baseline entries, since both files are unbaselined and the change is line-budget-neutral per the Task-1 table).

- [ ] **Step 5: Commit any freshness artifacts.**

```bash
git add -A && git commit -m "chore(factory): freshness artifacts [T001681]" || echo "nothing to regenerate"
```
