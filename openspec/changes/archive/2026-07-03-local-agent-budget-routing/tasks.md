---
title: "local-agent-budget-routing — Implementation Plan"
ticket_id: T001590
domains: [factory, database, website]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# local-agent-budget-routing — Implementation Plan

## File Structure

New and changed files (each with its S1 residual budget against the effective threshold; new
`.sql`/`.yaml`/`.bats`/spec files have no per-file line limit):

| Path | Ist | Budget |
| --- | --- | --- |
| `scripts/factory/route-provider.sh` | 48 | 452 |
| `scripts/factory/release-slot.sh` | 28 | 472 |
| `scripts/factory/provider-router.js` | 85 | 515 |
| `scripts/factory/provider-router.test.mjs` | 139 | 361 |
| `website/src/lib/provider-config.ts` | 78 | 522 |
| `website/src/lib/schema/provider-config-schema.ts` | 68 | 532 |
| `website/src/lib/ki-catalog.ts` | 164 | 436 |
| `website/src/lib/ki-services.ts` | 45 | 555 |

- **Create** `scripts/migrations/2026-07-03-context-budget.sql` — additive DDL mirror
  (`ADD COLUMN IF NOT EXISTS`) for the three new columns, applied to both brand DBs.
- **Create** `scripts/migrations/2026-07-03-local-qwen35-seed.sql` — prio-1 `local-qwen35` seeds +
  cloud demotion, applied to both brand DBs.
- **Modify** `scripts/factory/route-provider.sh` — read `context_window`/`context_budget` per
  candidate, add the budget guard to the atomic claim, emit `"ctx"` in the route JSON.
- **Modify** `scripts/factory/release-slot.sh` — accept an optional `ctx` arg and decrement
  `reserved_tokens` symmetrically.
- **Modify** `scripts/factory/provider-router.js` — export a pure `hasBudget()` and thread `ctx`
  through `routeProvider`/`releaseSlot` (injected-query SSOT).
- **Modify** `scripts/factory/provider-router.test.mjs` — budget grenzfälle (2×120k > 180k rejected,
  NULL unbounded, release restores).
- **Modify** `scripts/factory/pipeline.js` — thread `ctx` through the inline `routeProviderSync`/
  `releaseSlotSync` clone (minimal, near line-neutral; see the pipeline.js note below).
- **Modify** `website/src/lib/schema/provider-config-schema.ts` — idempotent `ADD COLUMN IF NOT
  EXISTS` for the three new columns.
- **Modify** `website/src/lib/schema/provider-config-schema.test.ts` — assert the new columns exist.
- **Modify** `website/src/lib/provider-config.ts` — select and pass through
  `context_window`/`context_budget`; map the four new provider API-key env names (read-only path,
  no claim).
- **Modify** `website/src/lib/provider-config.test.ts` — assert passthrough + env mapping.
- **Modify** `website/src/lib/ki-catalog.ts` — add `local-qwen35`, `openrouter`, `opencode-zen`,
  `google-gemini`, `github-models`.
- **Modify** `website/src/lib/ki-catalog.test.ts` — assert the five new catalog entries.
- **Modify** `website/src/lib/ki-services.ts` — register the `lavish-artifact` source.
- **Modify** `website/src/lib/ki-services.test.ts` — assert the new service.
- **Modify** `environments/schema.yaml` — declare `OPENROUTER_API_KEY`, `OPENCODE_API_KEY`,
  `GEMINI_API_KEY`, `GITHUB_MODELS_TOKEN`.
- **Modify** `tests/spec/software-factory.bats` — FA-SF-71 offline structural parity + budget
  contract (extends the existing FA-SF-70 provider-router block; no new ticket-numbered file).
- **Modify** `openspec/changes/local-agent-budget-routing/specs/software-factory.md` — delta spec
  (already authored alongside this plan).

**Goal:** Add a generic per-provider token-budget semaphore to agent routing and make a local
qwen3.5 LM-Studio endpoint the primary provider for context-light orchestration sources, with cloud
as an automatic priority-2 fallback.

**Architecture:** The existing atomic slot-claim (`UPDATE provider_health SET active_agents =
active_agents + 1 WHERE active_agents < max_concurrent`) is extended — never replaced — with token
arithmetic: a claim additionally reserves the candidate row's `context_window` on
`provider_health.reserved_tokens` under the guard `context_budget IS NULL OR reserved_tokens + ctx
<= context_budget`. The same arithmetic is mirrored into all four routing implementations; the
read-only website selection path only passes the new columns through.

**Tech Stack:** Bash + `factory_psql` (PostgreSQL 16), Node.js ESM (`provider-router.js`,
`node --test`), TypeScript (Astro website lib + Vitest), BATS.

## Global Constraints

- Budget semantics: `context_budget IS NULL` ⇒ unbounded (cloud rows unchanged; only
  `max_concurrent` applies there). The budget guard and the token reservation MUST live in the
  **same atomic UPDATE** as the `active_agents` claim.
- A claim reserves the claimed row's `context_window`; the matching release decrements
  `reserved_tokens` by that same `ctx` (floored at 0). `ctx` therefore travels with the route (in
  the route JSON / return object) so the release can subtract the correct amount — a provider may
  hold mixed-size claims concurrently (3×60k OR 1×120k+1×60k OR 1×180k).
- Migrations and seeds MUST be applied to **both** per-brand DBs (BRAND=mentolder and
  BRAND=korczewski) via `factory_psql`; dev (k3d) via `kubectl exec`.
- Pure modules only (S2): `ki-catalog.ts`, `ki-services.ts`, and the new `hasBudget()` stay
  import-free of DB/API layers. No brand-domain literals in any snippet (S3). No new `any` types
  (CQ02): all new fields and functions are explicitly typed.
- Endpoint SSOT is the mesh IP `http://100.102.71.114:1234/v1` (reachable from WSL and cluster) —
  it is a bare IP, not a brand domain.
- `scripts/factory/pipeline.js` is a sanctioned S1 exception listed in `docs/code-quality/gates.yaml`
  `s1.ignore` (T000460): the Claude Workflow harness forbids top-level imports and dynamic
  `import()`, so the routing logic is inlined and a module split/extract is architecturally
  impossible there. The change here is the minimal `ctx` threading through the existing inline clone
  — near line-neutral, and `check.mjs` skips the file regardless. The FA-SF-20 structural contract
  test continues to guard its invariants.

---

### Task 1: Schema columns + additive migration

**Files:**
- Modify: `website/src/lib/schema/provider-config-schema.ts`
- Modify: `website/src/lib/schema/provider-config-schema.test.ts`
- Create: `scripts/migrations/2026-07-03-context-budget.sql`

**Interfaces:**
- Consumes: existing `initProviderConfigSchema(c: PoolClient): Promise<void>` and the
  `tickets.provider_config` / `tickets.provider_health` tables.
- Produces: three new columns — `provider_config.context_window INTEGER`,
  `provider_config.context_budget INTEGER` (nullable ⇒ unbounded),
  `provider_health.reserved_tokens INTEGER NOT NULL DEFAULT 0`.

- [ ] **Step 1: Write the failing test.** Add to `provider-config-schema.test.ts` a case asserting
      that after `initProviderConfigSchema` the three columns exist (follow the file's existing
      information_schema query pattern):

```ts
it('adds context_window, context_budget, reserved_tokens columns (T001590)', async () => {
  await initProviderConfigSchema(client);
  const cfgCols = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='tickets' AND table_name='provider_config'
        AND column_name IN ('context_window','context_budget')`,
  );
  expect(cfgCols.rows.map((r) => r.column_name).sort()).toEqual(['context_budget', 'context_window']);
  const healthCol = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='tickets' AND table_name='provider_health' AND column_name='reserved_tokens'`,
  );
  expect(healthCol.rows).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test to verify it fails.**

```bash
cd website && npx vitest run src/lib/schema/provider-config-schema.test.ts
# Expected: FAIL — the three columns do not exist yet.
```

- [ ] **Step 3: Add the idempotent DDL.** In `provider-config-schema.ts`, after the
      `COACHING_COLUMNS` loop and before the `DROP CONSTRAINT`, add:

```ts
// Token-Budget-Semaphor (T001590): context_window pro Row, context_budget pro Provider
// (NULL = unbegrenzt), reserved_tokens laufende Reservierung pro Provider.
await c.query(`ALTER TABLE tickets.provider_config ADD COLUMN IF NOT EXISTS context_window INTEGER`);
await c.query(`ALTER TABLE tickets.provider_config ADD COLUMN IF NOT EXISTS context_budget INTEGER`);
await c.query(`ALTER TABLE tickets.provider_health ADD COLUMN IF NOT EXISTS reserved_tokens INTEGER NOT NULL DEFAULT 0`);
```

- [ ] **Step 4: Create the migration mirror** `scripts/migrations/2026-07-03-context-budget.sql`:

```sql
-- 2026-07-03-context-budget.sql
-- Additive token-budget columns for the provider routing semaphore (T001590).
-- Idempotent (ADD COLUMN IF NOT EXISTS). Mirror of provider-config-schema.ts.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-context-budget.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-context-budget.sql'
-- Dev (k3d): kubectl exec -n workspace <shared-db-pod> -- psql -U website website
BEGIN;
ALTER TABLE tickets.provider_config  ADD COLUMN IF NOT EXISTS context_window INTEGER;
ALTER TABLE tickets.provider_config  ADD COLUMN IF NOT EXISTS context_budget INTEGER;
ALTER TABLE tickets.provider_health  ADD COLUMN IF NOT EXISTS reserved_tokens INTEGER NOT NULL DEFAULT 0;
COMMIT;
```

- [ ] **Step 5: Run the test to verify it passes.**

```bash
cd website && npx vitest run src/lib/schema/provider-config-schema.test.ts
# Expected: PASS
```

- [ ] **Step 6: Commit.**

```bash
git add website/src/lib/schema/provider-config-schema.ts \
        website/src/lib/schema/provider-config-schema.test.ts \
        scripts/migrations/2026-07-03-context-budget.sql
git commit -m "feat(db): add token-budget columns to provider routing schema [T001590]"
```

---

### Task 2: Budget arithmetic in the bash claim/release wrappers

**Files:**
- Modify: `scripts/factory/route-provider.sh`
- Modify: `scripts/factory/release-slot.sh`
- Modify: `tests/spec/software-factory.bats` (extend the FA-SF-70 block)

**Interfaces:**
- Consumes: the candidate SELECT and the atomic claim UPDATE in `route-provider.sh`; the release
  UPDATE in `release-slot.sh`; `factory_psql` variable binding (`-v name=value` → `:'name'`).
- Produces: route JSON now carries `"ctx":<int>`; `release-slot.sh <provider> [success] [ctx]`
  decrements `reserved_tokens` by `ctx`.

- [ ] **Step 1: Extend the candidate SELECT** in `route-provider.sh` to also emit
      `context_window` and `context_budget` (empty string when NULL):

```bash
CANDS=$(factory_psql -v src="$SOURCE" -v tier="$TIER" <<'SQL'
SELECT provider||E'\t'||model_id||E'\t'||COALESCE(base_url,'')||E'\t'||max_concurrent
       ||E'\t'||COALESCE(context_window,0)||E'\t'||COALESCE(context_budget::text,'')
FROM tickets.provider_config
WHERE (source=:'src' OR source='*') AND tier=:'tier' AND enabled=true
ORDER BY (source=:'src') DESC, priority ASC;
SQL
)
```

- [ ] **Step 2: Add the budget guard to the atomic claim.** Replace the read loop + claim so the
      guard rides in the same UPDATE (note the added `ctx`/`budget` fields and psql vars):

```bash
while IFS=$'\t' read -r prov model burl maxc ctx budget; do
  [[ -z "$prov" ]] && continue
  # Atomic claim: circuit closed AND below cap AND (unbounded budget OR fits reservation).
  CLAIM=$(factory_psql -v prov="$prov" -v maxc="$maxc" -v ctx="${ctx:-0}" -v budget="$budget" <<'SQL'
INSERT INTO tickets.provider_health (provider) VALUES (:'prov') ON CONFLICT (provider) DO NOTHING;
UPDATE tickets.provider_health
SET active_agents = active_agents + 1, reserved_tokens = reserved_tokens + :'ctx'::int, updated_at = now()
WHERE provider = :'prov'
  AND active_agents < :'maxc'::int
  AND (cooldown_until IS NULL OR cooldown_until <= now())
  AND (nullif(:'budget','')::int IS NULL OR reserved_tokens + :'ctx'::int <= nullif(:'budget','')::int)
RETURNING provider;
SQL
)
  if [[ -n "$CLAIM" ]]; then
    BJSON=$([[ -n "$burl" ]] && printf '"%s"' "$burl" || printf 'null')
    printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":"%s","ctx":%s,"emergency":false}\n' "$prov" "$model" "$BJSON" "$prov" "${ctx:-0}"
    exit 0
  fi
done <<< "$CANDS"
```

- [ ] **Step 3: Emit `ctx:0` on the opus and emergency branches** so every route object has the key:

```bash
# opus branch:
printf '{"provider":"anthropic","modelId":"%s","baseUrl":null,"slotId":null,"ctx":0,"emergency":false}\n' "$OPUS_MODEL"
# emergency fallback:
printf '{"provider":"anthropic","modelId":"claude-sonnet-4-6","baseUrl":null,"slotId":null,"ctx":0,"emergency":true}\n'
```

- [ ] **Step 4: Decrement `reserved_tokens` in `release-slot.sh`.** Accept the optional `ctx` arg
      and subtract it in the release UPDATE:

```bash
PROV="${1:?slotId/provider required}"; SUCCESS="${2:-true}"; CTX="${3:-0}"
# null slot (opus / emergency) → nothing to release.
[[ "$PROV" == "null" || -z "$PROV" ]] && exit 0

factory_psql -v prov="$PROV" -v ctx="$CTX" <<'SQL'
UPDATE tickets.provider_health
SET active_agents = GREATEST(0, active_agents - 1),
    reserved_tokens = GREATEST(0, reserved_tokens - :'ctx'::int),
    updated_at = now()
WHERE provider = :'prov';
SQL
```

- [ ] **Step 5: Write the offline structural contract test** in the FA-SF-70 block of
      `tests/spec/software-factory.bats`:

```bash
@test "FA-SF-71: route-provider.sh reserves tokens under a NULL-safe budget guard" {
  grep -Eq 'reserved_tokens = reserved_tokens \+ :.?ctx' scripts/factory/route-provider.sh
  grep -Eq "nullif\(:'budget',''\)::int IS NULL OR reserved_tokens \+ :'ctx'::int <=" scripts/factory/route-provider.sh
  grep -q '"ctx":%s' scripts/factory/route-provider.sh
}

@test "FA-SF-71: release-slot.sh decrements reserved_tokens by ctx (floored at 0)" {
  grep -Eq 'reserved_tokens = GREATEST\(0, reserved_tokens - :.?ctx' scripts/factory/release-slot.sh
}

@test "FA-SF-71: release-slot.sh still no-ops on null slot with a ctx arg" {
  run bash scripts/factory/release-slot.sh null true 60000
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 6: Run the new BATS tests.**

```bash
tests/unit/lib/bats-core/bin/bats --filter 'FA-SF-71' tests/spec/software-factory.bats
# Expected: PASS (the grep targets now exist after Steps 1–4)
```

- [ ] **Step 7: Commit.**

```bash
git add scripts/factory/route-provider.sh scripts/factory/release-slot.sh tests/spec/software-factory.bats
git commit -m "feat(factory): token-budget guard in bash claim/release wrappers [T001590]"
```

---

### Task 3: Budget arithmetic in provider-router.js (executable grenzfälle)

**Files:**
- Modify: `scripts/factory/provider-router.js`
- Modify: `scripts/factory/provider-router.test.mjs`

**Interfaces:**
- Consumes: `routeProvider(query, source, tier)`, `releaseSlot(query, provider, success)`,
  `isUsable(health, maxConcurrent)`, and the injected `query(kind, params)` contract.
- Produces: `export function hasBudget(health, ctx, budget): boolean`; `routeProvider` now passes
  `{ provider, maxConcurrent, ctx, budget }` to `claim-slot` and returns `{ ..., ctx, releaseSlot }`;
  `releaseSlot(query, provider, success, ctx)` forwards `{ provider, ctx }` to `release-slot`.

- [ ] **Step 1: Write the failing tests** in `provider-router.test.mjs` (import `hasBudget`):

```js
import { hasBudget } from './provider-router.js'

test('hasBudget: NULL budget is unbounded', () => {
  assert.equal(hasBudget({ reserved_tokens: 999999 }, 180000, null), true)
})

test('hasBudget: 2×120k exceeds a 180k budget once one 120k is reserved', () => {
  assert.equal(hasBudget({ reserved_tokens: 0 }, 120000, 180000), true)
  assert.equal(hasBudget({ reserved_tokens: 120000 }, 120000, 180000), false)
})

test('routeProvider rejects a claim over budget and falls through to the cloud row', async () => {
  const db = makeFakeDb(
    [
      { source: 'factory-scout', tier: 'sonnet', priority: 1, provider: 'local-qwen35', model_id: 'qwen3.5-9b@iq4_xs', base_url: 'http://100.102.71.114:1234/v1', max_concurrent: 3, enabled: true, context_window: 120000, context_budget: 180000 },
      { source: '*', tier: 'sonnet', priority: 2, provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'x', max_concurrent: 3, enabled: true, context_window: 0, context_budget: null },
    ],
    [{ provider: 'local-qwen35', failure_count: 0, cooldown_until: null, active_agents: 1, reserved_tokens: 120000 }],
  )
  const r = await routeProvider(db.query.bind(db), 'factory-scout', 'sonnet')
  assert.equal(r.provider, 'deepseek')
})

test('release restores reserved_tokens by ctx', async () => {
  const db = makeFakeDb([], [{ provider: 'local-qwen35', failure_count: 0, cooldown_until: null, active_agents: 1, reserved_tokens: 60000 }])
  await releaseSlot(db.query.bind(db), 'local-qwen35', true, 60000)
  assert.equal(db._health.get('local-qwen35').reserved_tokens, 0)
})
```

- [ ] **Step 2: Extend the fake DB** in `provider-router.test.mjs` so `claim-slot` enforces the
      budget and `release-slot` subtracts `ctx`:

```js
// inside makeFakeDb, replace the claim-slot / release-slot branches:
if (kind === 'claim-slot') {
  const h = hp.get(params.provider) ?? { provider: params.provider, active_agents: 0, reserved_tokens: 0 }
  const ctx = Number(params.ctx ?? 0)
  const budget = params.budget == null ? null : Number(params.budget)
  if (Number(h.active_agents) >= Number(params.maxConcurrent)) return { rows: [] }
  if (budget != null && Number(h.reserved_tokens ?? 0) + ctx > budget) return { rows: [] }
  h.active_agents = Number(h.active_agents) + 1
  h.reserved_tokens = Number(h.reserved_tokens ?? 0) + ctx
  hp.set(params.provider, h)
  return { rows: [{ provider: params.provider }] }
}
if (kind === 'release-slot') {
  const h = hp.get(params.provider)
  if (h) { h.active_agents = Math.max(0, h.active_agents - 1); h.reserved_tokens = Math.max(0, Number(h.reserved_tokens ?? 0) - Number(params.ctx ?? 0)) }
  return { rows: [] }
}
```

- [ ] **Step 3: Run the tests to verify they fail.**

```bash
node --test scripts/factory/provider-router.test.mjs
# Expected: FAIL — hasBudget is not exported and routeProvider ignores the budget.
```

- [ ] **Step 4: Implement `hasBudget` and thread `ctx`/`budget`** in `provider-router.js`:

```js
/** Budget guard: NULL budget = unbounded; else reserved + ctx must fit the budget. */
export function hasBudget(health, ctx, budget) {
  if (budget == null) return true
  const reserved = Number((health && health.reserved_tokens) ?? 0)
  return reserved + Number(ctx ?? 0) <= Number(budget)
}
```

  In the `routeProvider` candidate loop, after the `isUsable` check:

```js
const ctx = Number(c.context_window ?? 0)
const budget = c.context_budget == null ? null : Number(c.context_budget)
if (!isUsable(health, cap)) continue
if (!hasBudget(health, ctx, budget)) continue
const { rows: claimed } = await query('claim-slot', { provider: c.provider, maxConcurrent: cap, ctx, budget })
if (!claimed || !claimed.length) continue
const provider = c.provider
return {
  provider,
  modelId: c.model_id,
  baseUrl: c.base_url ?? null,
  ctx,
  releaseSlot: (success) => releaseSlot(query, provider, success, ctx),
}
```

  And extend `releaseSlot` to forward `ctx`:

```js
export async function releaseSlot(query, provider, success, ctx = 0) {
  await query('release-slot', { provider, ctx })
  if (!success) await query('record-failure', { provider })
}
```

- [ ] **Step 5: Run the tests to verify they pass.**

```bash
node --test scripts/factory/provider-router.test.mjs
# Expected: PASS (all budget grenzfälle green)
node --check scripts/factory/provider-router.js
```

- [ ] **Step 6: Commit.**

```bash
git add scripts/factory/provider-router.js scripts/factory/provider-router.test.mjs
git commit -m "feat(factory): token-budget arithmetic in provider-router SSOT [T001590]"
```

---

### Task 4: Thread ctx through the pipeline.js inline clone + parity assertion

**Files:**
- Modify: `scripts/factory/pipeline.js`
- Modify: `tests/spec/software-factory.bats` (FA-SF-71 parity assertions)

**Interfaces:**
- Consumes: the inline `routeProviderSync(source, tier)` (returns the parsed route JSON, now with
  `ctx`) and `releaseSlotSync(slotId, success)`.
- Produces: `releaseSlotSync(slotId, success, ctx)` forwards `ctx` to `release-slot.sh`; all three
  call sites pass `route.ctx`.

- [ ] **Step 1: Add `ctx:0` to the non-DB branches** of `routeProviderSync` so the shape matches the
      wrapper (opus + `ANTHROPIC_MODEL` + catch branches each gain `ctx: 0`), e.g.:

```js
if (tier === 'opus') return { provider: 'anthropic', modelId: 'claude-opus-4-6', baseUrl: null, slotId: null, ctx: 0, emergency: false }
```

- [ ] **Step 2: Extend `releaseSlotSync`** to accept and forward `ctx`:

```js
function releaseSlotSync(slotId, success, ctx = 0) {
  if (!slotId) return
  try {
    const { execFileSync } = require('child_process')
    execFileSync('bash', [`${REPO}/scripts/factory/release-slot.sh`, String(slotId), success ? 'true' : 'false', String(ctx || 0)],
      { stdio: 'ignore', timeout: 20000, env: { ...process.env, BRAND: brand } })
  } catch (e) { log(`releaseSlot(${slotId}) failed (non-fatal): ${e.message}`) }
}
```

- [ ] **Step 3: Pass `route.ctx` at the three call sites** (lines ~309, ~421, ~423): change
      `releaseSlotSync(planRoute.slotId, plan != null)` → `releaseSlotSync(planRoute.slotId, plan != null, planRoute.ctx)`,
      `releaseSlotSync(route.slotId, impl != null)` → `releaseSlotSync(route.slotId, impl != null, route.ctx)`,
      and `releaseSlotSync(route.slotId, false)` → `releaseSlotSync(route.slotId, false, route.ctx)`.

- [ ] **Step 4: Add the parity assertions** to the FA-SF-71 block in
      `tests/spec/software-factory.bats`:

```bash
@test "FA-SF-71: pipeline.js inline clone threads ctx to release-slot.sh" {
  grep -Eq 'function releaseSlotSync\(slotId, success, ctx' scripts/factory/pipeline.js
  grep -Eq 'release-slot.sh.*String\(ctx' scripts/factory/pipeline.js
  grep -Eq 'releaseSlotSync\(planRoute.slotId, plan != null, planRoute.ctx\)' scripts/factory/pipeline.js
}

@test "FA-SF-71: node --test provider-router budget suite passes" {
  run node --test scripts/factory/provider-router.test.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-71: pipeline.js stays offline-parseable after ctx threading" {
  run node --check scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 5: Run the checks.**

```bash
node --check scripts/factory/pipeline.js
tests/unit/lib/bats-core/bin/bats --filter 'FA-SF-71' tests/spec/software-factory.bats
# Expected: PASS
```

- [ ] **Step 6: Commit.**

```bash
git add scripts/factory/pipeline.js tests/spec/software-factory.bats
git commit -m "feat(factory): thread ctx through pipeline inline route/release clone [T001590]"
```

---

### Task 5: Read-only passthrough + API-key env mapping in provider-config.ts

**Files:**
- Modify: `website/src/lib/provider-config.ts`
- Modify: `website/src/lib/provider-config.test.ts`

**Interfaces:**
- Consumes: `getProviderConfig(source, tier)` and `apiKeyForProvider(provider)`.
- Produces: `ProviderChoice` gains `contextWindow: number | null` and `contextBudget: number | null`
  (passthrough only, no claim); `apiKeyForProvider` maps the four new providers to their env vars.

- [ ] **Step 1: Write the failing tests** in `provider-config.test.ts`:

```ts
it('maps new cloud providers to their API-key env vars (T001590)', () => {
  process.env.OPENROUTER_API_KEY = 'or-key';
  process.env.GEMINI_API_KEY = 'gm-key';
  expect(apiKeyForProvider('openrouter')).toBe('or-key');
  expect(apiKeyForProvider('google-gemini')).toBe('gm-key');
  expect(apiKeyForProvider('local-qwen35')).toBe('not-required');
});
```

  (Export `apiKeyForProvider` from `provider-config.ts` if the test cannot import it — change its
  declaration to `export function apiKeyForProvider`.)

- [ ] **Step 2: Run the test to verify it fails.**

```bash
cd website && npx vitest run src/lib/provider-config.test.ts
# Expected: FAIL — the new providers return 'not-required' and apiKeyForProvider is not exported.
```

- [ ] **Step 3: Extend `apiKeyForProvider`** with the four new env branches (local stays
      `not-required`):

```ts
export function apiKeyForProvider(provider: string): string {
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY || '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || '';
  if (provider === 'opencode-zen') return process.env.OPENCODE_API_KEY || '';
  if (provider === 'google-gemini') return process.env.GEMINI_API_KEY || '';
  if (provider === 'github-models') return process.env.GITHUB_MODELS_TOKEN || '';
  // local-cluster, local-lmstudio, local-ollama, local-qwen35: no key needed
  return 'not-required';
}
```

- [ ] **Step 4: Pass the budget columns through** `getProviderConfig` (read-only; add to the
      `ProviderChoice` interface and the SELECT):

```ts
export interface ProviderChoice {
  provider: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string;
  contextWindow: number | null;
  contextBudget: number | null;
}
```

  In the query add `pc.context_window, pc.context_budget` to the SELECT list and map them:

```ts
const { provider, model_id, base_url, api_key, context_window, context_budget } = rows[0];
const apiKey = (typeof api_key === 'string' && api_key) ? api_key : apiKeyForProvider(provider);
return {
  provider, modelId: model_id, baseUrl: base_url ?? null, apiKey,
  contextWindow: context_window ?? null, contextBudget: context_budget ?? null,
};
```

  Add `contextWindow: null, contextBudget: null` to the opus early-return and the `FALLBACK`
  return so every `ProviderChoice` is complete.

- [ ] **Step 5: Run the test to verify it passes.**

```bash
cd website && npx vitest run src/lib/provider-config.test.ts
# Expected: PASS
```

- [ ] **Step 6: Commit.**

```bash
git add website/src/lib/provider-config.ts website/src/lib/provider-config.test.ts
git commit -m "feat(website): passthrough budget columns + new provider key env mapping [T001590]"
```

---

### Task 6: Catalog + service registry + env schema

**Files:**
- Modify: `website/src/lib/ki-catalog.ts`
- Modify: `website/src/lib/ki-catalog.test.ts`
- Modify: `website/src/lib/ki-services.ts`
- Modify: `website/src/lib/ki-services.test.ts`
- Modify: `environments/schema.yaml`

**Interfaces:**
- Consumes: `KI_CATALOG: InterfaceDef[]`, `interfaceById(id)`, `KI_SERVICES: ServiceDef[]`,
  `SOURCE`.
- Produces: five new catalog entries; a `lavish-artifact` service/source; four new env-var
  declarations.

- [ ] **Step 1: Write the failing catalog + service tests.** In `ki-catalog.test.ts`:

```ts
it('registers local-qwen35 (no key) and the four new cloud providers (T001590)', () => {
  const local = interfaceById('local-qwen35');
  expect(local?.defaultBaseUrl).toBe('http://100.102.71.114:1234/v1');
  expect(local?.apiKeyEnv).toBeUndefined();
  expect(interfaceById('openrouter')?.apiKeyEnv).toBe('OPENROUTER_API_KEY');
  expect(interfaceById('opencode-zen')?.apiKeyEnv).toBe('OPENCODE_API_KEY');
  expect(interfaceById('google-gemini')?.apiKeyEnv).toBe('GEMINI_API_KEY');
  expect(interfaceById('github-models')?.apiKeyEnv).toBe('GITHUB_MODELS_TOKEN');
});
```

  In `ki-services.test.ts`:

```ts
it('registers the lavish-artifact source (T001590)', () => {
  const svc = KI_SERVICES.find((s) => s.source === 'lavish-artifact');
  expect(svc?.tier).toBe('sonnet');
  expect(svc?.brandScoped).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

```bash
cd website && npx vitest run src/lib/ki-catalog.test.ts src/lib/ki-services.test.ts
# Expected: FAIL — the new entries do not exist.
```

- [ ] **Step 3: Add the five catalog entries** to `KI_CATALOG` in `ki-catalog.ts` (before the
      `custom` entry):

```ts
  {
    id: 'local-qwen35',
    label: 'Lokales qwen3.5 (LM Studio, Mesh)',
    kinds: ['chat'],
    suggestedModels: [{ id: 'qwen3.5-9b@iq4_xs', label: 'Qwen 3.5 9B (iq4_xs)' }],
    defaultBaseUrl: 'http://100.102.71.114:1234/v1',
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kinds: ['chat'],
    suggestedModels: [],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'opencode-zen',
    label: 'opencode Zen',
    kinds: ['chat'],
    suggestedModels: [],
    apiKeyEnv: 'OPENCODE_API_KEY',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'google-gemini',
    label: 'Google Gemini',
    kinds: ['chat'],
    suggestedModels: [],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'github-models',
    label: 'GitHub Models',
    kinds: ['chat'],
    suggestedModels: [],
    defaultBaseUrl: 'https://models.github.ai/inference',
    apiKeyEnv: 'GITHUB_MODELS_TOKEN',
    perRowApiKey: true,
    supportsParams: COMMON_PARAMS,
  },
```

- [ ] **Step 4: Register the `lavish-artifact` source** in `ki-services.ts` — add to `SOURCE` and
      `KI_SERVICES`:

```ts
export const SOURCE = {
  websiteLlm: 'website-llm',
  assistantChat: 'assistant-chat',
  ticketTriage: 'ticket-triage',
  lavishArtifact: 'lavish-artifact',
  coaching: 'coaching',
} as const;
```

```ts
  { key: 'lavish-artifact', label: 'Lavish-Artefakt', icon: '🎨', source: SOURCE.lavishArtifact, tier: 'sonnet', brandScoped: false, paramSet: 'routing' },
```

- [ ] **Step 5: Declare the four env vars** in `environments/schema.yaml` (in the API-key block,
      alongside `DEEPSEEK_API_KEY`), following the existing entry shape:

```yaml
  - name: OPENROUTER_API_KEY
    required: false
    generate: false
    description: "OpenRouter API key for the OpenRouter provider in provider_config routing. Injected into the website pod via website-secrets."
    extra_namespaces:
      - namespace: website
        secret: website-secrets

  - name: OPENCODE_API_KEY
    required: false
    generate: false
    description: "opencode Zen API key (covers the opencode Go subscription) for provider_config routing. Injected into the website pod via website-secrets."
    extra_namespaces:
      - namespace: website
        secret: website-secrets

  - name: GEMINI_API_KEY
    required: false
    generate: false
    description: "Google Gemini API key for the google-gemini provider in provider_config routing. Injected into the website pod via website-secrets."
    extra_namespaces:
      - namespace: website
        secret: website-secrets

  - name: GITHUB_MODELS_TOKEN
    required: false
    generate: false
    description: "GitHub Models token for the github-models provider in provider_config routing. Injected into the website pod via website-secrets."
    extra_namespaces:
      - namespace: website
        secret: website-secrets
```

- [ ] **Step 6: Run the tests + env schema validation.**

```bash
cd website && npx vitest run src/lib/ki-catalog.test.ts src/lib/ki-services.test.ts
# Expected: PASS
cd /tmp/wt-local-agent-budget-routing && task env:validate ENV=mentolder
```

- [ ] **Step 7: Commit.**

```bash
git add website/src/lib/ki-catalog.ts website/src/lib/ki-catalog.test.ts \
        website/src/lib/ki-services.ts website/src/lib/ki-services.test.ts environments/schema.yaml
git commit -m "feat(website): add local-qwen35 + 4 cloud providers, lavish-artifact source [T001590]"
```

---

### Task 7: Priority seeds for orchestration sources

**Files:**
- Create: `scripts/migrations/2026-07-03-local-qwen35-seed.sql`

**Interfaces:**
- Consumes: the new `context_window`/`context_budget` columns (Task 1) and the existing
  `UNIQUE (source, tier, priority)` constraint.
- Produces: priority-1 `local-qwen35` rows for `factory-scout`, `factory-plan`, `ticket-triage`,
  `lavish-artifact` (`context_window=60000`, `context_budget=180000`); existing cloud rows of those
  sources demoted to priority 2.

- [ ] **Step 1: Create the seed** `scripts/migrations/2026-07-03-local-qwen35-seed.sql`, modelled on
      `2026-06-14-llm-availability-seed.sql` (note: `factory-scout`/`factory-plan` route at tier
      `sonnet`, `ticket-triage` at `haiku`; `lavish-artifact` at `sonnet`):

```sql
-- 2026-07-03-local-qwen35-seed.sql
-- Routes context-light orchestration sources to the local qwen3.5 LM-Studio endpoint at
-- priority 1 (context_window=60000, context_budget=180000) and demotes existing rows to
-- priority 2. Idempotent (ON CONFLICT DO UPDATE). Depends on 2026-07-03-context-budget.sql.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-local-qwen35-seed.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-03-local-qwen35-seed.sql'
-- Dev (k3d): kubectl exec -n workspace <shared-db-pod> -- psql -U website website
BEGIN;

-- Demote every existing enabled row of the four sources to priority 2 (frees priority 1).
UPDATE tickets.provider_config
  SET priority = 2, updated_at = now()
  WHERE source IN ('factory-scout','factory-plan','ticket-triage','lavish-artifact')
    AND priority = 1;

-- Priority-1 local-qwen35 rows. base_url is the mesh IP endpoint (no key required).
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, context_window, context_budget, enabled)
VALUES
  ('factory-scout',   'sonnet', 1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true),
  ('factory-plan',    'sonnet', 1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true),
  ('ticket-triage',   'haiku',  1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true),
  ('lavish-artifact', 'sonnet', 1, 'local-qwen35', 'qwen3.5-9b@iq4_xs', 'http://100.102.71.114:1234/v1', 60000, 180000, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider       = EXCLUDED.provider,
      model_id       = EXCLUDED.model_id,
      base_url       = EXCLUDED.base_url,
      context_window = EXCLUDED.context_window,
      context_budget = EXCLUDED.context_budget,
      enabled        = EXCLUDED.enabled,
      updated_at     = now();

COMMIT;
```

- [ ] **Step 2: Write the failing seed-shape test** in the FA-SF-71 block of
      `tests/spec/software-factory.bats` (offline grep contract — no DB):

```bash
@test "FA-SF-71: local-qwen35 seed sets prio-1 rows for the four orchestration sources" {
  local f=scripts/migrations/2026-07-03-local-qwen35-seed.sql
  grep -Eq "'factory-scout', *'sonnet', *1, *'local-qwen35'" "$f"
  grep -Eq "'factory-plan', *'sonnet', *1, *'local-qwen35'" "$f"
  grep -Eq "'ticket-triage', *'haiku', *1, *'local-qwen35'" "$f"
  grep -Eq "'lavish-artifact', *'sonnet', *1, *'local-qwen35'" "$f"
  grep -Eq '60000, *180000' "$f"
}
```

- [ ] **Step 3: Run the test to verify it fails then passes.**

```bash
tests/unit/lib/bats-core/bin/bats --filter 'FA-SF-71' tests/spec/software-factory.bats
# Expected: FAIL before Step 1's file exists; PASS after the seed file is created.
```

- [ ] **Step 4: Commit.**

```bash
git add scripts/migrations/2026-07-03-local-qwen35-seed.sql tests/spec/software-factory.bats
git commit -m "feat(factory): seed local-qwen35 as prio-1 for orchestration sources [T001590]"
```

---

### Task 8: OpenSpec delta spec + validation

**Files:**
- Modify: `openspec/changes/local-agent-budget-routing/specs/software-factory.md`

**Interfaces:**
- Consumes: the parent SSOT `openspec/specs/software-factory.md` (H2 `## Requirements`, H3
  `### Requirement:`).
- Produces: a validated delta with two `### Requirement:` blocks under `## ADDED Requirements`.

- [ ] **Step 1: Confirm the delta content** (authored alongside this plan): two requirements —
      "Token-Budget-Semaphor für Agent-Provider-Claims" and "Erweiterter Provider-Katalog und
      lokales qwen3.5-Primär-Routing" — each with German Purpose prose plus English
      GIVEN/WHEN/THEN scenarios under `#### Scenario:` headers.

- [ ] **Step 2: Validate the OpenSpec change.**

```bash
bash scripts/openspec.sh validate
# Expected: PASS (green) — delta parses against the parent SSOT spec.
```

- [ ] **Step 3: Commit.**

```bash
git add openspec/changes/local-agent-budget-routing/specs/software-factory.md
git commit -m "docs(openspec): delta spec for local-agent-budget-routing [T001590]"
```

---

### Task 9: Final verification + freshness gates

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green CI-equivalent local run.

- [ ] **Step 1: Regenerate the test inventory** (tests were added/changed):

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] **Step 2: Run the three mandatory CI gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

  `task test:changed` runs the changed-domain vitest + BATS selection + quality gate;
  `task freshness:check` runs the S1–S4 ratchet and the baseline key-count assertion (which must not
  grow — this plan adds no baseline entries). Expected: all green.

- [ ] **Step 3: Commit any regenerated freshness artefacts.**

```bash
git add -A
git commit -m "chore: regenerate freshness artefacts + test inventory [T001590]"
```
