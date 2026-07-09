---
title: agent-model-slots
ticket_id: T001733
domains: [factory, website, database, tooling]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-model-slots — Implementation Plan

Per-phase Factory model slots (Postgres-backed, editable in the admin pipeline UI)
plus a versioned opencode agent-model config (Qwythos removed, `Qwen3-14B`
single-session slot added) with a sync script and an fzf picker. Build order:
**DB + router (Tasks 1–3) → API + UI (Tasks 4–5) → opencode config artifacts
(Tasks 6–8) → verification (Task 9)**. The DB migration precedes the API route
that reads it.

## File Structure

New files:
- `scripts/migrations/2026-07-09-factory-model-slots.sql` — mirror DDL for manual per-brand bring-up (follows the `2026-06-10-provider-routing.sql` convention).
- `website/src/lib/tickets/tables/factory-model-slots.ts` — authoritative idempotent DDL module (`applyFactoryModelSlotsSchema`), wired into `initTicketsSchema`.
- `website/src/lib/factory-model-slots.ts` — typed read/write helpers (`readAllSlots`, `writeSlot`, `PHASES`, `FactoryPhase`, `modelCatalog`).
- `website/src/lib/__tests__/factory-model-slots.test.ts` — Vitest for the helpers (red→green).
- `website/src/pages/api/factory-model-slots.ts` — admin GET+PUT endpoint.
- `website/src/components/factory/FactoryModelSlots.svelte` — one dropdown per phase.
- `.opencode/agent-models.jsonc` — versioned SoT for the opencode `agent` block + `provider.lmstudio.models`.
- `scripts/opencode-sync-agents.sh` — merges the versioned config into `~/.config/opencode/opencode.jsonc`.
- `scripts/agent-model-select.sh` — fzf picker → writes back to `.opencode/agent-models.jsonc` → calls the sync script.

Modified files (S1 status — `.js`/`tickets-schema.ts` are sanctioned `s1.ignore` exceptions per `docs/code-quality/gates.yaml`):
- `scripts/factory/route-provider.sh` — Ist 50 · unbaselined · `.sh` limit 500 → **Budget ~450** (comfortable).
- `scripts/factory/pipeline.js` — Ist 713 · **in `s1.ignore`** (sanctioned monolith, T000460) → no line budget; FA-SF-20 structural contract still applies.
- `website/src/lib/tickets-schema.ts` — Ist 57 · **in `s1.ignore`** → +1 import/call line is safe.
- `website/src/components/DevStatusTabs.svelte` — Ist 102 · unbaselined · `.svelte` limit 500 → **Budget ~398**.
- `website/src/pages/admin/pipeline.astro` — Ist 32 · unbaselined · `.astro` limit 400 → **Budget ~368** (expected: unchanged; the mount happens inside `DevStatusTabs`).
- `Taskfile.yml` — add `opencode:sync-agents` + `opencode:model-select` wrappers (S4: makes the two new scripts reachable → not orphans).

Delta spec: `openspec/changes/agent-model-slots/specs/agent-model-slots.md` (already authored; `task test:openspec` green).

---

## Task 1 — Postgres table `tickets.factory_model_slots` (schema module + mirror migration)

Create the per-phase slot table. Follow the existing split-DDL pattern: the
**authoritative** DDL is a table module wired into `initTicketsSchema`, and a
`scripts/migrations/*.sql` file **mirrors** it for manual per-brand bring-up
(exactly like `provider-config-schema.ts` mirrored by
`2026-06-10-provider-routing.sql`).

1. New `website/src/lib/tickets/tables/factory-model-slots.ts`:
   ```ts
   import type { Pool, PoolClient } from 'pg';
   export async function applyFactoryModelSlotsSchema(c: Pool | PoolClient): Promise<void> {
     await c.query(`CREATE TABLE IF NOT EXISTS tickets.factory_model_slots (
       phase      TEXT PRIMARY KEY CHECK (phase IN ('scout','plan','implement','verify','deploy')),
       provider   TEXT NOT NULL,
       model_id   TEXT NOT NULL,
       base_url   TEXT,
       set_by     TEXT,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
   }
   ```
   (Per-brand DBs are separate, so a single row per phase suffices — no `brand`
   column, matching how `route-provider.sh` already scopes by the brand's own DB.)
2. Wire it into `website/src/lib/tickets-schema.ts`: add the import and call
   `await applyFactoryModelSlotsSchema(pool)` inside the `initTicketsSchema`
   advisory-locked block, alongside `applyFactoryControlSchema(pool)`.
3. New `scripts/migrations/2026-07-09-factory-model-slots.sql` mirroring the DDL,
   with the same header comment format as `2026-06-10-provider-routing.sql`
   (idempotent `CREATE TABLE IF NOT EXISTS`, `BEGIN;`/`COMMIT;`, note that the
   authoritative DDL lives in the table module and that it must be applied to
   BOTH brand DBs via `factory_psql`). No brand-domain literals (S3).

Verify: run `cd website && pnpm exec tsc --noEmit` (scoped fully in Task 9).
Confirm the migration references the table:
`grep -q "factory_model_slots" scripts/migrations/2026-07-09-factory-model-slots.sql`.

## Task 2 — Typed slot helpers + failing Vitest (red→green)

Create the read/write layer the API and router share, and lock its behavior with
a Vitest first.

1. New `website/src/lib/factory-model-slots.ts`:
   - `export const PHASES = ['scout','plan','implement','verify','deploy'] as const;`
   - `export type FactoryPhase = typeof PHASES[number];`
   - `export interface ModelSlot { phase: FactoryPhase; provider: string; modelId: string; baseUrl: string | null; }`
   - `export async function readAllSlots(): Promise<ModelSlot[]>` — `SELECT phase, provider, model_id, base_url FROM tickets.factory_model_slots`.
   - `export async function writeSlot(phase, provider, modelId, baseUrl, setBy): Promise<void>` — `INSERT … ON CONFLICT (phase) DO UPDATE`.
   - `export async function modelCatalog(): Promise<{provider:string; modelId:string}[]>` — `SELECT DISTINCT provider, model_id FROM tickets.provider_config WHERE enabled = true ORDER BY provider, model_id` (DB-driven dropdown source, analog to `ki-catalog`). Fully typed — no `any` (CQ02).
   - Import `pool` from `./db-pool` (avoid the `website-db` cycle → S2 clean).
2. New `website/src/lib/__tests__/factory-model-slots.test.ts` — mock `./db-pool`'s
   `pool.query` (see `db-pool.test.ts` for the mocking style) and assert:
   - `readAllSlots()` maps rows → `ModelSlot[]` (snake→camel `model_id`→`modelId`).
   - `writeSlot('implement', …)` issues an `ON CONFLICT (phase)` upsert.
   - An exported `isPhase(x)` guard rejects a phase outside `PHASES`.

   **Run the test before implementing the helper body — expected: FAIL**
   (`cd website && pnpm exec vitest run src/lib/__tests__/factory-model-slots.test.ts`).
   Then implement `factory-model-slots.ts` until green.

## Task 3 — Router reads the slot before tier logic

Make `route-provider.sh` and `routeProviderSync` consult `factory_model_slots`,
keeping the tier fallback intact for missing rows and the `emergency` path.

1. `scripts/factory/route-provider.sh`:
   - Accept an optional 3rd positional arg `PHASE` (`SOURCE`, `TIER`, `PHASE`).
     When absent, derive it from `SOURCE` via a reverse map
     (`factory-scout→scout`, `factory-plan→plan`, `factory-implement→implement`,
     `factory-review→verify`).
   - After the `opus` short-circuit and before the `provider_config` candidate
     query, if `PHASE` is non-empty, look it up:
     ```sql
     SELECT provider||E'\t'||model_id||E'\t'||COALESCE(base_url,'')
     FROM tickets.factory_model_slots WHERE phase = :'phase';
     ```
     If a row is returned, emit the same JSON shape with `"emergency":false`,
     `"slotId":null`, `"ctx":0` and `exit 0`. If no row, fall through to the
     existing tier-based claim loop **unchanged**.
   - Keep `set -euo pipefail` and the `factory_psql` sourcing intact.
2. `scripts/factory/pipeline.js` — in `routeProviderSync(source, tier)`, thread the
   phase through: add an optional `phase` param (callers already know it — e.g.
   the `implement`/`plan`/`verify` phase strings near lines 139/290/395/491) and
   pass it as the 3rd `execFileSync` arg. Preserve the existing
   `ANTHROPIC_MODEL`/`opus`/emergency branches. (File is `s1.ignore`; keep the
   FA-SF-20 structural invariants — no top-level import added.)
3. Extend `tests/spec/software-factory.bats` with a structural guard test
   (grep-based, like `FA-SF-36`): assert `route-provider.sh` references
   `factory_model_slots` and handles a phase argument. Run it before the edit —
   expected: FAIL — then green after Task 3.1.

Verify: `bash -n scripts/factory/route-provider.sh` and
`node --check scripts/factory/pipeline.js`.

## Task 4 — Admin API endpoint `GET`/`PUT /api/factory-model-slots`

Model the handler on `website/src/pages/api/admin/factory-control.ts` (auth guard,
JSON responses, `locals.requestLogger` on error).

1. New `website/src/pages/api/factory-model-slots.ts`:
   - `export const prerender = false;`
   - `authGuard(session)` → 401 (no session) / 403 (non-admin) via
     `getSession` + `isAdmin` from `../../lib/auth`.
   - `GET`: return `{ slots: await readAllSlots(), catalog: await modelCatalog() }`.
   - `PUT`: parse JSON body `{ phase, provider, modelId, baseUrl? }`; reject with
     400 `invalid_value` when `phase` is not accepted by `isPhase` or
     `provider`/`modelId` empty; call `writeSlot(...)` with
     `session.preferred_username` as `setBy`; return the refreshed
     `readAllSlots()`. Fully typed handler — no `any` (CQ02).
2. Add a Vitest case to `website/src/lib/__tests__/factory-model-slots.test.ts`
   (or a sibling `factory-model-slots-api.test.ts` if the auth import is heavy):
   assert PUT rejects an unknown phase with 400 and never calls `writeSlot`.

## Task 5 — Svelte slot editor + mount in the pipeline admin surface

1. New `website/src/components/factory/FactoryModelSlots.svelte`:
   - `onMount` → `fetch('/api/factory-model-slots')` → render one row per phase
     with a `<select>` populated from `catalog`, current value from `slots`.
   - On change → `PUT` the `{ phase, provider, modelId }` and optimistically update.
   - Style with existing `factory-tokens.css` vars (`--ink-*`, `--brass*`,
     `--line`, `--fg*`) — clear typographic hierarchy, calm surfaces, one accent.
     Add new tokens to `website/src/styles/factory-tokens.css` only if a needed
     value is absent. No `KiProviderDrawer` reuse (style inspiration only).
   - Keep well under the `.svelte` 500 limit (target ~200 lines).
2. Mount it in `website/src/components/DevStatusTabs.svelte` under the existing
   `control` tab (import at top alongside `ControlPanel`; render inside the
   `{#if activeTab === 'control'}` block). `pipeline.astro` needs no change (it
   already renders `DevStatusTabs`) — confirm it stays byte-identical to keep its
   S1 budget untouched.

## Task 6 — Versioned `.opencode/agent-models.jsonc` (Qwythos out, Qwen3-14B in)

1. New `.opencode/agent-models.jsonc` capturing, as SoT:
   - `provider.lmstudio.models`: keep `qwen3.5-9b@iq4_xs`, `qwen3.5-9b@q4_k_m`,
     `qwen3.5-9b@q4_k_xl`, `google/gemma-4-12b-qat`; **remove both `qwythos-*`
     models**; **add** `qwen3-14b@q4_k_m` →
     `{ "name": "Qwen3-14B (1 session, Q4_K_M, lmstudio-community/Qwen3-14B-GGUF)", "limit": { "context": 32768, "output": 8192 } }`.
   - `agent`: keep `qwen35-iq4`, `qwen35`, `qwen35-hq` unchanged; **remove
     `qwythos` and `qwythos-hq`**; **add** a single-session
     implementation/planning agent (e.g. `qwen3-14b`) →
     `mode: "subagent"`, `model: "lmstudio/qwen3-14b@q4_k_m"`, distinct `color`,
     `permission: { edit: "deny", write: "deny", bash: "deny" }`.
   - Base URL stays `http://127.0.0.1:1234/v1` (localhost — no brand domain, S3).
   Reference the current live block in `~/.config/opencode/opencode.jsonc` for
   exact existing field values.

## Task 7 — `scripts/opencode-sync-agents.sh` (idempotent merge)

1. New `scripts/opencode-sync-agents.sh` (`set -euo pipefail`, `.sh` ≤500):
   - Read `.opencode/agent-models.jsonc` (repo) and the target
     `~/.config/opencode/opencode.jsonc` (override via `$OPENCODE_CONFIG` for
     testability), both via `jq` (strip `//` line comments before parsing, or
     keep the emitted blocks comment-free).
   - **Replace** the target `.agent` block wholesale with the source `.agent`
     (this is how `qwythos` disappears), and **additively merge**
     `.provider.lmstudio.models` (source keys overwrite same-named target keys;
     other target model keys are preserved). Leave every other top-level key
     (`mcp`, `plugin`, `experimental`, `model`, …) untouched:
     `jq -s '.[1].agent = .[0].agent | .[1].provider.lmstudio.models = (.[1].provider.lmstudio.models // {}) + .[0].provider.lmstudio.models | .[1]'`.
   - Write atomically (temp file + `mv`). Idempotent: a second run yields an
     identical file.
2. S4: reference this script from a new `Taskfile.yml` task `opencode:sync-agents`.

Verify: `bash -n scripts/opencode-sync-agents.sh`, and an idempotency smoke test
against a `$OPENCODE_CONFIG` fixture copy — run twice, `diff` the two outputs
(must be empty), and assert the result has no `qwythos` key.

## Task 8 — `scripts/agent-model-select.sh` (fzf picker)

1. New `scripts/agent-model-select.sh` (`set -euo pipefail`, `.sh` ≤500):
   - List agents from `.opencode/agent-models.jsonc`; on selection, list candidate
     models (the `provider.lmstudio.models` keys) via `fzf`.
   - Write the chosen `lmstudio/<modelKey>` back into the agent's `model` field in
     `.opencode/agent-models.jsonc` (atomic `jq` + `mv`).
   - Then invoke `scripts/opencode-sync-agents.sh`.
   - Guard: if `fzf` is missing, print an install hint and exit non-zero.
2. S4: reference this script from a new `Taskfile.yml` task `opencode:model-select`.

Verify: `bash -n scripts/agent-model-select.sh`; structural check that it calls
the sync script (`grep -q opencode-sync-agents scripts/agent-model-select.sh`).

## Task 9 — Verification & freshness

1. Regenerate the test inventory (new Vitest files were added):
   ```bash
   task test:inventory   # regenerates website/src/data/test-inventory.json
   ```
   Commit `website/src/data/test-inventory.json` alongside the tests.
2. Targeted tests for the changed domains:
   ```bash
   task test:changed
   ```
   (runs `vitest --changed` for the new website lib/API + BATS selection incl. the
   `software-factory.bats` router guard + `quality:check`.)
3. OpenSpec gate:
   ```bash
   task test:openspec
   ```
4. Freshness + S1–S4 ratchet + baseline assertion:
   ```bash
   task freshness:regenerate
   task freshness:check
   ```
5. Confirm the `any` budget did not grow:
   ```bash
   bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
   ```

All commands must pass before opening the PR.
