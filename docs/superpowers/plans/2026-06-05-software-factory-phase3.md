---
title: Software Factory — Phase 3 (Full Auto-Pilot) Implementation Plan
ticket_id: T000429
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Software Factory — Phase 3 (Full Auto-Pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per task, provision the implementer per `.claude/skills/references/subagent-provisioning.md` (model · effort · context).

**Goal:** Turn the live P1+P2 Software Factory into a Full Auto-Pilot — a new `type=feature` backlog ticket is scouted → planned → implemented → merged (PR squash) → deployed to **both brands** → live-smoked **without human intervention**, behind hard guards, observable on an internal dashboard, with self-healing CI/test/lint retries and auto-rollback.

**Architecture:** The persistent dispatcher runs on the always-on WSL host via a **systemd USER timer → headless `claude -p`** that nests the existing `dispatcher.js`/`pipeline.js` Workflow scripts (the only locus with repo + git-crypt key + fleet kubeconfig + Workflow tool — CronCreate/remote `/schedule` are rejected; **Task A.0 is a Go/No-Go spike** proving headless Workflow nesting, fallback = local `/loop`). "Inversion of Intelligence": the wakeup is dumb (carries only `dry_run` policy); **all** gates (kill-switch, daily-deploy-cap, dry-run-first) are read **fresh per tick** from each brand's own `shared-db` via `kubectl-exec-psql`, fail-closed. Schema lives in app-managed TS DDL (`tickets-db.ts` `initTicketsSchema()`, no migration runner) and must reach **both** brand DBs at pod boot. The trigger is **cron-poll** (LISTEN/NOTIFY is inert plumbing — the one-shot psql layer can't hold a LISTEN). Layer-4 canary is **net-new** (`feature-promote.sh` smokes DEV and targets dead contexts): capture pre-deploy revision → live-prod unauth smoke (~5 min) → `rollout undo` to that revision, with a default-OFF feature flag as the first reversibility layer. Adaptive `provision()` picks model/effort/context per spawned subagent.

**Tech Stack:** Bash (factory `*.sh`, `kubectl-exec-psql` via `lib.sh`), Node/ESM Workflow scripts (`dispatcher.js`/`pipeline.js`/`provision.js`, harness globals `agent`/`parallel`/`pipeline`/`workflow`), TypeScript (`tickets-db.ts`, website `/api` + `src/lib`, `pg`, pgvector 0.8.0), Astro + Svelte (dashboard), BATS (`tests/local/FA-SF-*`, offline), vitest + `node --test`, systemd user units, `task` (go-task), `kubectl --context fleet`.

---

## Sequencing & dependency order (H1: autonomy-core first)

```
Phase 0  A.0 Spike (Go/No-Go) ─────────────────────────────────────────────┐
Phase 1  A schema+ticket.sh → B classifiers+conflict → C guards+escalation  │ autonomy-core
         → D retry+canary → E adaptive provisioning                         │
Phase 2  F persistent dispatcher (systemd timer + wakeup) + cron-poll       │ trigger/service
Phase 3  G dashboard + dark-launch flags                                    │ visibility
```

Hard order: **A.0 first** (gates everything). Within Phase 1, A → B → C → D → E (D consumes B's `paths_are_escalate_class`/`classify_failure` and A's `retry-count`/`ticket.sh`; C consumes A's `factory_control`). F and G depend on A (schema) + C (escalation capture). Deploy + verify **both** namespaces (`workspace` + `workspace-korczewski`) for every schema/script change.

## New BATS test IDs (collision-free; existing taken: FA-SF-01/04/20–27/30/31)

`32` classify-paths · `33` classify-failure · `34` prefix-conflict · `35` factory-cli · `36` guards · `37` retry · `38` canary · `39` canary-wire · `40` provision · `41` wakeup · `42` dashboard-route. Existing `04`/`20`/`30` are **extended** in place. Every new bats → register in `website/src/data/test-inventory.json` (CI `task test:inventory` diff-gated).

## File Structure

| File | New/Mod | Responsibility | Tasks |
|---|---|---|---|
| `website/src/lib/tickets-db.ts` | Mod | `retry_count` col, `factory_control` + `feature_flags` tables, `isFeatureEnabled()` | A.1–A.4, F (inert notify) |
| `scripts/ticket.sh` | Mod | `retry-count` / `factory-control` / `dryrun-*` / `feature-flag` subcommands | A.5–A.7 |
| `scripts/factory/shared-state-allowlist.txt` | New | single source of truth for escalate-class/shared-state prefixes | B.1 |
| `scripts/factory/classify-paths.sh` | New | `paths_are_escalate_class` (escalate-not-retry + sequential-conflict matcher) | B.2 |
| `scripts/factory/classify-failure.sh` | New | `classify_failure` CI-log → class | B.3 |
| `scripts/factory/conflict-check.sh` | Mod | augment `@>` with directory-prefix for the allowlist | B.4 |
| `scripts/factory/guards.sh` | New | `guard_killswitch_on` / `_daily_cap_reached` / `_dryrun_ok` / `_check_diff_size` | C.1 |
| `scripts/factory/dispatcher.js` | Mod | PREP guard gate (fail-closed) + capture `parallel()` result + PushNotification | C.2–C.4 |
| `scripts/factory/pipeline.js` | Mod | deploy-phase guards, retry loop, canary wire, `provision()` wiring, flag gating | C, D, E, G |
| `scripts/feature-promote.sh` | Mod | `observe_prod()` live-prod canary + capture-revision rollback | D.2 |
| `tests/e2e/smoke/website.txt` | New | unauth-only canary smoke greps | D.1 |
| `scripts/factory/provision.js` (+ `.test.mjs`) | New | `chooseModel`/`chooseEffort`/`provision` (model · effort · context) | E.1–E.4 |
| `scripts/factory/wakeup.sh`, `factory.service`, `factory.timer` | New | persistent headless dispatcher wakeup (systemd user timer) | F.1–F.x |
| `Taskfile.factory.yml` | Mod | `factory:autopilot:install\|uninstall\|status` | F |
| `website/src/lib/factory-metrics.ts` (+ test) | New | `listFactoryMetrics`/`listActiveFeatures`/`listActiveFlags` (per-brand pool) | G.1–G.2 |
| `website/src/pages/api/factory-metrics.ts` | New | GET, `getSession`+`isAdmin()` → 401 | G.3 |
| `website/src/components/FactoryDashboard.svelte` | New | KPI island, ~15s polling (LiveCockpit pattern) | G.4 |
| `website/src/pages/dev-status.astro` | New | server gate + SSR-seed + island | G.5 |
| `scripts/factory/README.md`, `docs/superpowers/references/factory-usage.md` | Mod | honest status (cron-poll primary, reject CronCreate/remote) | F |

## Conventions for every task

- **Worktree:** `/tmp/wt-sf-phase3`, branch `feature/software-factory-phase3`. Never `.claude/worktrees/`.
- **Run a bats:** `./tests/runner.sh local <FA-SF-ID>` (needs a reachable fleet for live-cluster ones; offline ones run anywhere).
- **Run vitest:** `cd website && npx vitest run src/lib/<name>.test.ts` · **node test:** `node --test scripts/factory/provision.test.mjs` · **JS lint:** `node --check scripts/factory/<f>.js` · **kustomize:** `task workspace:validate`.
- **Schema reaches a brand only on that brand's website redeploy** — verify `workspace` AND `workspace-korczewski` explicitly.
- **PushNotification** is a deferred harness tool — `ToolSearch select:PushNotification` first; call only from `dispatcher.js`/`pipeline.js`, never from `.sh`.
- **Commit after every green step group.** Conventional commits tagged `[T000413]`.

---


## Phase 0 + Phase 1A — Spike Gate & Schema/ticket.sh Foundation (Segment A)

This segment runs FIRST. Task A.0 is a Go/No-Go gate (headless Workflow nesting); A.1–A.8 lay the schema + `ticket.sh` contract that every later segment depends on. All paths are relative to the repo root inside the worktree `/tmp/wt-sf-phase3` (branch `feature/software-factory-phase3`).

**Contract symbols this segment DEFINES** (consumed elsewhere): DB columns/tables `tickets.tickets.retry_count`, `tickets.factory_control`, `tickets.feature_flags`; TS helper `isFeatureEnabled(brand, key)`; `ticket.sh` subcommands `retry-count`, `factory-control`, `dryrun-mark`, `dryrun-check`, `feature-flag`. Views `tickets.v_factory_metrics` / `tickets.v_active_features` are READ targets only (already exist, FA-SF-04) — do not recreate.

---

### Task A.0: Phase 0 SPIKE — prove headless Workflow nesting (Go/No-Go gate)
**Files:**
- Create: `scripts/factory/headless-workflow-spike.sh`
- Create: `scripts/factory/pipeline.spike.js` (throwaway 0-agent dry_run probe target)
- Create: `docs/superpowers/specs/2026-06-05-phase0-spike-result.md` (Go/No-Go record)

This task gates the rest. It is a manual/interactive verification (a headless `claude -p` invocation cannot be unit-tested), so Steps 1–2 are a build/lint VERIFICATION and Step 4 is the live spike run + decision record.

- [x] **Step 1: Write the probe target + spike runner.**

  `scripts/factory/pipeline.spike.js`:
  ```js
  // scripts/factory/pipeline.spike.js — THROWAWAY Phase 0 probe.
  // A 0-agent dry_run "pipeline" used only to prove that a headless
  // `claude -p` session can call the Workflow tool and nest
  // workflow({scriptPath}) WITHOUT a permission prompt. Delete after the
  // Go/No-Go decision is recorded. [T000413]
  export default async function run({ dry_run = true } = {}) {
    if (!dry_run) throw new Error('spike target is dry_run-only');
    console.log(JSON.stringify({ spike: 'pipeline', nested: true, agents: 0, dry_run }));
    return { ok: true, agents: 0, dry_run };
  }
  ```

  `scripts/factory/headless-workflow-spike.sh`:
  ```bash
  #!/usr/bin/env bash
  # scripts/factory/headless-workflow-spike.sh — Phase 0 Go/No-Go spike. [T000413]
  # Proves: (a) the Workflow tool is exposed to a headless `claude -p` session,
  # and (b) workflow({scriptPath:'scripts/factory/pipeline.spike.js'}) nests
  # WITHOUT triggering an interactive permission prompt. 0 agents, dry_run only.
  #
  # No-Go fallback: local `/loop` (weaker persistence) — the rest of the spec
  # stays valid; only the dispatcher's trigger mechanism changes.
  set -euo pipefail
  REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  cd "$REPO"

  PROMPT='Call the Workflow tool exactly once with scriptPath "scripts/factory/pipeline.spike.js" and input {"dry_run": true}. Do not ask for confirmation. Report the JSON the workflow returned, then stop.'

  echo "== headless workflow spike: invoking claude -p (allowlisted Workflow) ==" >&2
  claude -p "$PROMPT" \
    --allowedTools 'Workflow Bash(node:*) Read' \
    --permission-mode acceptEdits
  ```
  Make it executable: `chmod +x scripts/factory/headless-workflow-spike.sh`.

- [x] **Step 2 (VERIFY syntax, offline): lint both JS/Bash before any live run.**
  ```bash
  cd /tmp/wt-sf-phase3 && node --check scripts/factory/pipeline.spike.js && bash -n scripts/factory/headless-workflow-spike.sh && echo SPIKE_LINT_OK
  ```
  Expected output (last line): `SPIKE_LINT_OK`

- [x] **Step 3 (record the decision template):** create `docs/superpowers/specs/2026-06-05-phase0-spike-result.md`:
  ```markdown
  # Phase 0 Spike — Headless Workflow Nesting (Go/No-Go) [T000413]

  ## Hypothesis
  A headless `claude -p --allowedTools 'Workflow …'` session can call the
  Workflow tool and nest `workflow({scriptPath:'scripts/factory/pipeline.spike.js'})`
  WITHOUT an interactive permission prompt, returning cleanly with 0 agents.

  ## How to run
  `bash scripts/factory/headless-workflow-spike.sh`

  ## Result: <GO | NO-GO>   (date: 2026-06-__)
  - Workflow tool exposed headless: <yes/no>
  - Nested workflow() ran without permission prompt: <yes/no>
  - Returned JSON: `<paste {"spike":"pipeline","nested":true,"agents":0,"dry_run":true}>`

  ## Decision
  - GO  → build the systemd-user-timer dispatcher (Segment …, `scripts/factory/wakeup.sh` + `factory.timer`).
  - NO-GO → fall back to local `/loop`; the rest of the spec is unchanged.

  ## Cleanup
  Delete `scripts/factory/pipeline.spike.js` + `headless-workflow-spike.sh` once recorded.
  ```

- [x] **Step 4 (LIVE spike + decision):** run the spike and fill the result file with the observed JSON.
  ```bash
  cd /tmp/wt-sf-phase3 && bash scripts/factory/headless-workflow-spike.sh
  ```
  Expected (GO): the session prints the workflow's return JSON containing `"spike":"pipeline","nested":true,"agents":0,"dry_run":true` and NO permission prompt blocks it. If a prompt blocks or the Workflow tool is unavailable, record **NO-GO** and proceed with the `/loop` fallback noted in the result file. Either way the schema/contract work (A.1+) proceeds unchanged.

- [x] **Step 5: Commit.**
  ```bash
  git add scripts/factory/headless-workflow-spike.sh scripts/factory/pipeline.spike.js docs/superpowers/specs/2026-06-05-phase0-spike-result.md && git commit -m "chore(factory): phase 0 headless-workflow nesting spike + Go/No-Go record [T000413]"
  ```

---

### Task A.1: Add `retry_count` column to `tickets.tickets`
**Files:** Modify `website/src/lib/tickets-db.ts` (right after the `pipeline_slot` ALTER, ~:105). Test: extend `tests/local/FA-SF-04-db-schema.bats`.

- [x] **Step 1: Write the failing test** — append to `tests/local/FA-SF-04-db-schema.bats`:
  ```bash
  @test "FA-SF-04: tickets.tickets has retry_count column (NOT NULL DEFAULT 0)" {
    run psql_tickets "SELECT column_default FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='retry_count'"
    [ "$status" -eq 0 ]
    [[ "$output" =~ "0" ]]
  }
  ```

- [x] **Step 2: Run it, expect FAIL** (column not yet created on the live DB / fresh schema):
  ```bash
  cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-04
  ```
  Expected: the new `retry_count` test fails — `output` is empty, `[[ "" =~ "0" ]]` is false (`not ok ... retry_count column`).

- [x] **Step 3: Implement** — in `website/src/lib/tickets-db.ts`, immediately after the `pipeline_slot` ALTER at line 105, insert:
  ```ts
  // Phase 3 Software Factory: retry_count tracks how many times the pipeline
  // has retried a failed feature. Reset to 0 on slot-claim; >=2 => block +
  // PushNotification (see pipeline.js CI-red handling). [T000413]
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`);
  ```

- [x] **Step 4: Run it, expect PASS** (after the schema re-inits per-pod; for a fresh local DB the next init applies it). Verify the source landed and lint:
  ```bash
  cd /tmp/wt-sf-phase3 && grep -n "retry_count INTEGER NOT NULL DEFAULT 0" website/src/lib/tickets-db.ts && cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "tickets-db.ts" 
  ```
  Expected: the grep prints the matching line; the `grep -c` prints `0` (no type errors in `tickets-db.ts`). After the website pod re-inits the schema in both namespaces, `./tests/runner.sh local FA-SF-04` passes the `retry_count` test.

- [x] **Step 5: Commit.**
  ```bash
  git add website/src/lib/tickets-db.ts tests/local/FA-SF-04-db-schema.bats && git commit -m "feat(factory): add tickets.retry_count column + FA-SF-04 assertion [T000413]"
  ```

---

### Task A.2: Create `tickets.factory_control` table (kill-switch / daily-cap / dry-run marker)
**Files:** Modify `website/src/lib/tickets-db.ts` (after the `retry_count` ALTER from A.1). Test: extend `tests/local/FA-SF-04-db-schema.bats`.

- [x] **Step 1: Write the failing test** — append to `tests/local/FA-SF-04-db-schema.bats`:
  ```bash
  @test "FA-SF-04: tickets.factory_control table exists with UNIQUE(key,brand)" {
    run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='factory_control'"
    [ "$status" -eq 0 ]
    [ "$output" = "factory_control" ]
  }
  @test "FA-SF-04: factory_control has a UNIQUE(key,brand) constraint" {
    run psql_tickets "SELECT conname FROM pg_constraint WHERE conrelid='tickets.factory_control'::regclass AND contype='u'"
    [ "$status" -eq 0 ]
    [ -n "$output" ]
  }
  ```

- [x] **Step 2: Run it, expect FAIL:**
  ```bash
  cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-04
  ```
  Expected: `not ok ... factory_control table exists` — `output` is empty (table absent).

- [x] **Step 3: Implement** — in `website/src/lib/tickets-db.ts`, directly after the `retry_count` ALTER added in A.1:
  ```ts
  // Phase 3 Software Factory: factory_control is the runtime control plane —
  // global kill-switch, per-brand daily-deploy cap counter, dry-run markers.
  // brand NULL = global. Read fresh per dispatcher tick, fail-closed on error.
  // [T000413]
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.factory_control (
      key        TEXT NOT NULL,
      brand      TEXT,
      value      TEXT NOT NULL,
      set_by     TEXT,
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (key, brand)
    )
  `);
  ```

- [x] **Step 4: Run it, expect PASS** — verify source + types:
  ```bash
  cd /tmp/wt-sf-phase3 && grep -n "CREATE TABLE IF NOT EXISTS tickets.factory_control" website/src/lib/tickets-db.ts && cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "tickets-db.ts"
  ```
  Expected: grep prints the matching line; `grep -c` prints `0`. After per-pod schema re-init the two new FA-SF-04 tests pass in both namespaces.

- [x] **Step 5: Commit.**
  ```bash
  git add website/src/lib/tickets-db.ts tests/local/FA-SF-04-db-schema.bats && git commit -m "feat(factory): add tickets.factory_control control-plane table [T000413]"
  ```

---

### Task A.3: Create `tickets.feature_flags` table (+ brand FK via the tags DO-block idiom)
**Files:** Modify `website/src/lib/tickets-db.ts` (place near `tickets.tags`, ~:350-363, mirroring its `id` + brand-FK DO-block idiom). Test: extend `tests/local/FA-SF-04-db-schema.bats`.

- [x] **Step 1: Write the failing test** — append to `tests/local/FA-SF-04-db-schema.bats`:
  ```bash
  @test "FA-SF-04: tickets.feature_flags table exists" {
    run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='feature_flags'"
    [ "$status" -eq 0 ]
    [ "$output" = "feature_flags" ]
  }
  @test "FA-SF-04: feature_flags has brand FK to public.brands" {
    run psql_tickets "SELECT conname FROM pg_constraint WHERE conname='feature_flags_brand_fkey'"
    [ "$status" -eq 0 ]
    [ "$output" = "feature_flags_brand_fkey" ]
  }
  @test "FA-SF-04: feature_flags has UNIQUE(brand,key)" {
    run psql_tickets "SELECT count(*) FROM pg_constraint WHERE conrelid='tickets.feature_flags'::regclass AND contype='u'"
    [ "$status" -eq 0 ]
    [ "$output" = "1" ]
  }
  ```

- [x] **Step 2: Run it, expect FAIL:**
  ```bash
  cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-04
  ```
  Expected: `not ok ... feature_flags table exists` (table absent; `output` empty).

- [x] **Step 3: Implement** — in `website/src/lib/tickets-db.ts`, immediately after the `tickets.tags` block (the one ending at the `END $$;` near line 363), add the table using the SAME DO-block ADD CONSTRAINT idiom as `tags_brand_fkey`:
  ```ts
  // Phase 3 Software Factory: feature_flags powers dark-launch / canary. Each
  // implement-agent gates new behaviour behind isFeatureEnabled(brand,'<slug>');
  // a flag flipped on enables it. Mirrors the tickets.tags id + brand-FK idiom.
  // [T000413]
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.feature_flags (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      brand      TEXT NOT NULL,
      key        TEXT NOT NULL,
      enabled    BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      set_by     TEXT,
      UNIQUE (brand, key)
    );
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_brand_fkey') THEN
          ALTER TABLE tickets.feature_flags ADD CONSTRAINT feature_flags_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
  `);
  ```

- [x] **Step 4: Run it, expect PASS** — verify source + types:
  ```bash
  cd /tmp/wt-sf-phase3 && grep -n "feature_flags_brand_fkey" website/src/lib/tickets-db.ts && cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "tickets-db.ts"
  ```
  Expected: grep prints two lines (the IF-NOT-EXISTS check + the ADD CONSTRAINT); `grep -c` prints `0`. After per-pod re-init the three new FA-SF-04 tests pass in both namespaces.

- [x] **Step 5: Commit.**
  ```bash
  git add website/src/lib/tickets-db.ts tests/local/FA-SF-04-db-schema.bats && git commit -m "feat(factory): add tickets.feature_flags table with brand FK [T000413]"
  ```

---

### Task A.4: `isFeatureEnabled(brand, key)` TS helper (+ vitest)
**Files:** Modify `website/src/lib/tickets-db.ts` (export the helper; place it right after `initTicketsSchema`, ~ after the closing brace near where other exports live). Create `website/src/lib/tickets-db.featureflag.test.ts`.

- [x] **Step 1: Write the failing test** — `website/src/lib/tickets-db.featureflag.test.ts`:
  ```ts
  // website/src/lib/tickets-db.featureflag.test.ts [T000413]
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  const query = vi.fn();
  vi.mock('./website-db', () => ({
    pool: { query: (...a: unknown[]) => query(...a), connect: vi.fn() },
    ensureSchemaOnce: vi.fn(),
  }));
  vi.mock('./knowledge-db', () => ({ MixedEmbeddingModelError: class {} }));

  import { isFeatureEnabled } from './tickets-db';

  describe('isFeatureEnabled', () => {
    beforeEach(() => query.mockReset());

    it('returns true when an enabled row exists for (brand,key)', async () => {
      query.mockResolvedValueOnce({ rows: [{ enabled: true }] });
      await expect(isFeatureEnabled('mentolder', 'new-hero')).resolves.toBe(true);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('FROM tickets.feature_flags'),
        ['mentolder', 'new-hero'],
      );
    });

    it('returns false when no row exists', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await expect(isFeatureEnabled('korczewski', 'missing')).resolves.toBe(false);
    });

    it('fails closed (false) when the query throws', async () => {
      query.mockRejectedValueOnce(new Error('db down'));
      await expect(isFeatureEnabled('mentolder', 'x')).resolves.toBe(false);
    });
  });
  ```

- [x] **Step 2: Run it, expect FAIL** (no export yet):
  ```bash
  cd /tmp/wt-sf-phase3/website && npx vitest run src/lib/tickets-db.featureflag.test.ts
  ```
  Expected: import/type failure — `"isFeatureEnabled" is not exported by "src/lib/tickets-db.ts"` (suite errors / fails).

- [x] **Step 3: Implement** — in `website/src/lib/tickets-db.ts`, add this exported function immediately after the `initTicketsSchema` function's closing `}` (top-level, alongside the other exports):
  ```ts
  /** Dark-launch gate. Returns true only when an ENABLED flag row exists for
   *  (brand,key). Fails CLOSED (false) on any DB error so a flag-table outage
   *  can never accidentally turn a gated feature on. [T000413] */
  export async function isFeatureEnabled(brand: string, key: string): Promise<boolean> {
    try {
      const { rows } = await pool.query(
        `SELECT enabled FROM tickets.feature_flags WHERE brand = $1 AND key = $2 LIMIT 1`,
        [brand, key],
      );
      return rows.length > 0 && rows[0].enabled === true;
    } catch {
      return false;
    }
  }
  ```

- [x] **Step 4: Run it, expect PASS:**
  ```bash
  cd /tmp/wt-sf-phase3/website && npx vitest run src/lib/tickets-db.featureflag.test.ts
  ```
  Expected: `3 passed` — all three `isFeatureEnabled` cases green.

- [x] **Step 5: Commit.**
  ```bash
  git add website/src/lib/tickets-db.ts website/src/lib/tickets-db.featureflag.test.ts && git commit -m "feat(factory): isFeatureEnabled() dark-launch helper (fail-closed) [T000413]"
  ```

---

### Task A.5: `ticket.sh retry-count` + `factory-control` subcommands
**Files:** Modify `scripts/ticket.sh` (add `cmd_retry_count` + `cmd_factory_control`; register in dispatch case :431-442 and the usage line :426). Test: create `tests/local/FA-SF-35-factory-cli.bats`.

- [x] **Step 1: Write the failing test** — `tests/local/FA-SF-35-factory-cli.bats`:
  ```bash
  #!/usr/bin/env bats
  # FA-SF-35: offline arg-validation for Phase 3 factory ticket.sh subcommands. [T000413]
  setup() { load 'test_helper.bash'; }

  @test "FA-SF-35: retry-count requires an action verb" {
    run bash scripts/ticket.sh retry-count --id T000001
    [ "$status" -eq 2 ]
    [[ "$output" =~ "get|incr|reset" ]]
  }
  @test "FA-SF-35: retry-count get requires --id" {
    run bash scripts/ticket.sh retry-count get
    [ "$status" -eq 2 ]
    [[ "$output" =~ "--id" ]]
  }
  @test "FA-SF-35: factory-control set requires --key and --value" {
    run bash scripts/ticket.sh factory-control set --key killswitch
    [ "$status" -eq 2 ]
    [[ "$output" =~ "--value" ]]
  }
  @test "FA-SF-35: factory-control get requires --key" {
    run bash scripts/ticket.sh factory-control get
    [ "$status" -eq 2 ]
    [[ "$output" =~ "--key" ]]
  }
  @test "FA-SF-35: dispatch usage lists factory-control" {
    run bash scripts/ticket.sh
    [ "$status" -eq 1 ]
    [[ "$output" =~ "factory-control" ]]
  }
  ```

- [x] **Step 2: Run it, expect FAIL** (subcommands unknown → exit 1, not the expected exit 2):
  ```bash
  cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-35
  ```
  Expected: failures — `retry-count`/`factory-control` hit the `*) Unknown command` branch (status 1) and the usage line lacks `factory-control`.

- [x] **Step 3: Implement** — in `scripts/ticket.sh`, add two functions just before the dispatch `if [[ $# -lt 1 ]]` block (after `cmd_touch`, ~:422):
  ```bash
  cmd_retry_count() {
    local action="" id=""
    if [[ $# -gt 0 && "$1" != --* ]]; then action="$1"; shift; fi
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --id) id="$2"; shift 2 ;;
        *)    echo "Unknown retry-count option: $1" >&2; exit 2 ;;
      esac
    done
    if [[ "$action" != "get" && "$action" != "incr" && "$action" != "reset" ]]; then
      echo "ERROR: retry-count requires an action (get|incr|reset)." >&2; exit 2
    fi
    if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
    local pod; pod=$(_pgpod)
    case "$action" in
      get)
        _exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT retry_count FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
        ;;
      incr)
        _exec_sql "$pod" -v ext_id="$id" <<'EOF'
UPDATE tickets.tickets SET retry_count = retry_count + 1 WHERE external_id = :'ext_id' RETURNING retry_count;
EOF
        ;;
      reset)
        _exec_sql "$pod" -v ext_id="$id" <<'EOF'
UPDATE tickets.tickets SET retry_count = 0 WHERE external_id = :'ext_id' RETURNING retry_count;
EOF
        ;;
    esac
  }

  cmd_factory_control() {
    local action="" key="" brand="" value="" set_by=""
    if [[ $# -gt 0 && "$1" != --* ]]; then action="$1"; shift; fi
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --key)    key="$2"; shift 2 ;;
        --brand)  brand="$2"; shift 2 ;;
        --value)  value="$2"; shift 2 ;;
        --set-by) set_by="$2"; shift 2 ;;
        *)        echo "Unknown factory-control option: $1" >&2; exit 2 ;;
      esac
    done
    if [[ "$action" != "get" && "$action" != "set" ]]; then
      echo "ERROR: factory-control requires an action (get|set)." >&2; exit 2
    fi
    if [[ -z "$key" ]]; then echo "ERROR: --key is required." >&2; exit 2; fi
    local pod; pod=$(_pgpod)
    if [[ "$action" == "get" ]]; then
      _exec_sql "$pod" -v key="$key" -v brand="$brand" <<'EOF'
SELECT value FROM tickets.factory_control
WHERE key = :'key' AND brand IS NOT DISTINCT FROM NULLIF(:'brand','');
EOF
    else
      if [[ -z "$value" ]]; then echo "ERROR: --value is required for set." >&2; exit 2; fi
      _exec_sql "$pod" -v key="$key" -v brand="$brand" -v value="$value" -v set_by="$set_by" <<'EOF' >/dev/null
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
VALUES (:'key', NULLIF(:'brand',''), :'value', NULLIF(:'set_by',''), now())
ON CONFLICT (key, brand) DO UPDATE
  SET value = EXCLUDED.value, set_by = EXCLUDED.set_by, updated_at = now();
EOF
      echo "factory-control set: $key=${value}${brand:+ (brand=$brand)}"
    fi
  }
  ```
  Register both in the dispatch case (after `enqueue) ...`, before `*)`):
  ```bash
  retry-count)       cmd_retry_count "$@" ;;
  factory-control)   cmd_factory_control "$@" ;;
  ```
  And append `retry-count, factory-control` to the usage `Commands:` echo line at :426.

- [x] **Step 4: Run it, expect PASS:**
  ```bash
  cd /tmp/wt-sf-phase3 && bash -n scripts/ticket.sh && ./tests/runner.sh local FA-SF-35
  ```
  Expected: `bash -n` is silent; FA-SF-35 reports the `retry-count`/`factory-control` cases all `ok` (the `feature-flag` cases land in A.6).

- [x] **Step 5: Commit.**
  ```bash
  git add scripts/ticket.sh tests/local/FA-SF-35-factory-cli.bats && git commit -m "feat(factory): ticket.sh retry-count + factory-control subcommands [T000413]"
  ```

---

### Task A.6: `ticket.sh dryrun-mark` / `dryrun-check` subcommands
**Files:** Modify `scripts/ticket.sh` (add `cmd_dryrun_mark` + `cmd_dryrun_check`; register in dispatch + usage). Test: extend `tests/local/FA-SF-35-factory-cli.bats`.

dry-run markers are stored as `factory_control` rows with key `dryrun:<ext_id>` (brand NULL=global), so `dryrun-check` exits 0 iff the marker row exists — matching the contract `guard_dryrun_ok` consumes.

- [x] **Step 1: Write the failing test** — append to `tests/local/FA-SF-35-factory-cli.bats`:
  ```bash
  @test "FA-SF-35: dryrun-mark requires --id" {
    run bash scripts/ticket.sh dryrun-mark
    [ "$status" -eq 2 ]
    [[ "$output" =~ "--id" ]]
  }
  @test "FA-SF-35: dryrun-check requires --id" {
    run bash scripts/ticket.sh dryrun-check
    [ "$status" -eq 2 ]
    [[ "$output" =~ "--id" ]]
  }
  @test "FA-SF-35: dispatch usage lists dryrun-mark" {
    run bash scripts/ticket.sh
    [[ "$output" =~ "dryrun-mark" ]]
  }
  ```

- [x] **Step 2: Run it, expect FAIL:**
  ```bash
  cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-35
  ```
  Expected: `dryrun-mark`/`dryrun-check` hit `*) Unknown command` (status 1) → the new `--id`-required assertions fail.

- [x] **Step 3: Implement** — in `scripts/ticket.sh`, after `cmd_factory_control`:
  ```bash
  cmd_dryrun_mark() {
    local id=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --id) id="$2"; shift 2 ;;
        *)    echo "Unknown dryrun-mark option: $1" >&2; exit 2 ;;
      esac
    done
    if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
    local pod; pod=$(_pgpod)
    _exec_sql "$pod" -v key="dryrun:$id" <<'EOF' >/dev/null
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
VALUES (:'key', NULL, 'done', 'ticket.sh', now())
ON CONFLICT (key, brand) DO UPDATE SET value = 'done', updated_at = now();
EOF
    echo "dryrun marked for ticket $id"
  }

  cmd_dryrun_check() {
    local id=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --id) id="$2"; shift 2 ;;
        *)    echo "Unknown dryrun-check option: $1" >&2; exit 2 ;;
      esac
    done
    if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
    local pod found
    pod=$(_pgpod)
    found=$(_exec_sql "$pod" -v key="dryrun:$id" <<'EOF'
SELECT 1 FROM tickets.factory_control WHERE key = :'key' AND brand IS NULL LIMIT 1;
EOF
)
    if [[ "$found" == "1" ]]; then exit 0; else exit 1; fi
  }
  ```
  Register in the dispatch case:
  ```bash
  dryrun-mark)       cmd_dryrun_mark "$@" ;;
  dryrun-check)      cmd_dryrun_check "$@" ;;
  ```
  Append `dryrun-mark, dryrun-check` to the usage `Commands:` line.

- [x] **Step 4: Run it, expect PASS:**
  ```bash
  cd /tmp/wt-sf-phase3 && bash -n scripts/ticket.sh && ./tests/runner.sh local FA-SF-35
  ```
  Expected: `bash -n` silent; the three new `dryrun-*` assertions report `ok`.

- [x] **Step 5: Commit.**
  ```bash
  git add scripts/ticket.sh tests/local/FA-SF-35-factory-cli.bats && git commit -m "feat(factory): ticket.sh dryrun-mark/dryrun-check subcommands [T000413]"
  ```

---

### Task A.7: `ticket.sh feature-flag set|get|list` subcommands
**Files:** Modify `scripts/ticket.sh` (add `cmd_feature_flag`; register in dispatch + usage). Test: extend `tests/local/FA-SF-35-factory-cli.bats`.

- [x] **Step 1: Write the failing test** — append to `tests/local/FA-SF-35-factory-cli.bats`:
  ```bash
  @test "FA-SF-35: feature-flag set requires --brand --key --enabled" {
    run bash scripts/ticket.sh feature-flag set --brand mentolder --key new-hero
    [ "$status" -eq 2 ]
    [[ "$output" =~ "--enabled" ]]
  }
  @test "FA-SF-35: feature-flag set rejects a non-boolean --enabled" {
    run bash scripts/ticket.sh feature-flag set --brand mentolder --key x --enabled maybe
    [ "$status" -eq 2 ]
    [[ "$output" =~ "true|false" ]]
  }
  @test "FA-SF-35: feature-flag get requires --brand and --key" {
    run bash scripts/ticket.sh feature-flag get --brand mentolder
    [ "$status" -eq 2 ]
    [[ "$output" =~ "--key" ]]
  }
  @test "FA-SF-35: feature-flag list requires --brand" {
    run bash scripts/ticket.sh feature-flag list
    [ "$status" -eq 2 ]
    [[ "$output" =~ "--brand" ]]
  }
  @test "FA-SF-35: dispatch usage lists feature-flag" {
    run bash scripts/ticket.sh
    [[ "$output" =~ "feature-flag" ]]
  }
  ```

- [x] **Step 2: Run it, expect FAIL:**
  ```bash
  cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-35
  ```
  Expected: `feature-flag` hits `*) Unknown command` (status 1) → the five new assertions fail.

- [x] **Step 3: Implement** — in `scripts/ticket.sh`, after `cmd_dryrun_check`:
  ```bash
  cmd_feature_flag() {
    local action="" brand="" key="" enabled="" set_by=""
    if [[ $# -gt 0 && "$1" != --* ]]; then action="$1"; shift; fi
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --brand)   brand="$2"; shift 2 ;;
        --key)     key="$2"; shift 2 ;;
        --enabled) enabled="$2"; shift 2 ;;
        --set-by)  set_by="$2"; shift 2 ;;
        *)         echo "Unknown feature-flag option: $1" >&2; exit 2 ;;
      esac
    done
    if [[ "$action" != "set" && "$action" != "get" && "$action" != "list" ]]; then
      echo "ERROR: feature-flag requires an action (set|get|list)." >&2; exit 2
    fi
    if [[ -z "$brand" ]]; then echo "ERROR: --brand is required." >&2; exit 2; fi
    local pod; pod=$(_pgpod)
    case "$action" in
      set)
        if [[ -z "$key" ]]; then echo "ERROR: --key is required." >&2; exit 2; fi
        if [[ "$enabled" != "true" && "$enabled" != "false" ]]; then
          echo "ERROR: --enabled must be true|false." >&2; exit 2
        fi
        _exec_sql "$pod" -v brand="$brand" -v key="$key" -v enabled="$enabled" -v set_by="$set_by" <<'EOF' >/dev/null
INSERT INTO tickets.feature_flags (brand, key, enabled, set_by)
VALUES (:'brand', :'key', :'enabled'::boolean, NULLIF(:'set_by',''))
ON CONFLICT (brand, key) DO UPDATE
  SET enabled = EXCLUDED.enabled, set_by = EXCLUDED.set_by;
EOF
        echo "feature-flag set: $brand/$key=$enabled"
        ;;
      get)
        if [[ -z "$key" ]]; then echo "ERROR: --key is required." >&2; exit 2; fi
        _exec_sql "$pod" -v brand="$brand" -v key="$key" <<'EOF'
SELECT enabled FROM tickets.feature_flags WHERE brand = :'brand' AND key = :'key';
EOF
        ;;
      list)
        _exec_sql "$pod" -v brand="$brand" <<'EOF'
SELECT key || '=' || enabled FROM tickets.feature_flags WHERE brand = :'brand' ORDER BY key;
EOF
        ;;
    esac
  }
  ```
  Register in the dispatch case:
  ```bash
  feature-flag)      cmd_feature_flag "$@" ;;
  ```
  Append `feature-flag` to the usage `Commands:` line.

- [x] **Step 4: Run it, expect PASS:**
  ```bash
  cd /tmp/wt-sf-phase3 && bash -n scripts/ticket.sh && ./tests/runner.sh local FA-SF-35
  ```
  Expected: `bash -n` silent; all FA-SF-35 assertions report `ok` (retry-count + factory-control + dryrun + feature-flag).

- [x] **Step 5: Commit.**
  ```bash
  git add scripts/ticket.sh tests/local/FA-SF-35-factory-cli.bats && git commit -m "feat(factory): ticket.sh feature-flag set/get/list subcommands [T000413]"
  ```

---

### Task A.8: Register FA-SF-35 in the test inventory (CI gate)
**Files:** Modify `website/src/data/test-inventory.json`. (The CI `test:inventory` check fails the build if this is stale — see CLAUDE.md "Test inventory check".)

- [ ] **Step 1 (VERIFY the gap):** confirm FA-SF-35 is NOT yet registered and the regenerator would add it:
  ```bash
  cd /tmp/wt-sf-phase3 && grep -c "FA-SF-35" website/src/data/test-inventory.json
  ```
  Expected: `0` (not registered yet).

- [ ] **Step 2 (regenerate the inventory):**
  ```bash
  cd /tmp/wt-sf-phase3 && task test:inventory
  ```
  Expected: the task rewrites `website/src/data/test-inventory.json` adding an FA-SF-35 entry.

- [ ] **Step 3 (VERIFY the entry shape):**
  ```bash
  cd /tmp/wt-sf-phase3 && grep -A3 '"id": "FA-SF-35"' website/src/data/test-inventory.json
  ```
  Expected (matches the FA-SF-21 sibling shape):
  ```json
      "id": "FA-SF-35",
      "file": "tests/local/FA-SF-35-factory-cli.bats",
      "category": "FA",
      "kind": "shell"
  ```
  If `task test:inventory` does not auto-discover it, insert that object manually after the FA-SF-31 entry, preserving the trailing comma.

- [ ] **Step 4 (VERIFY no drift):** re-run the regenerator and confirm a clean tree (this is exactly what CI asserts):
  ```bash
  cd /tmp/wt-sf-phase3 && task test:inventory && git diff --quiet website/src/data/test-inventory.json && echo INVENTORY_CLEAN
  ```
  Expected: `INVENTORY_CLEAN` (no diff on a second run).

- [ ] **Step 5: Commit.**
  ```bash
  git add website/src/data/test-inventory.json && git commit -m "test(factory): register FA-SF-35 factory-cli in test inventory [T000413]"
  ```


## Phase 1B — Path/Failure Classifiers + Directory-Prefix Conflict Heuristic

This segment introduces the shared classification primitives the retry-loop and
escalation-routing depend on, plus the augmented directory-prefix branch in the
conflict gate. It defines the contract symbols `shared-state-allowlist.txt`,
`paths_are_escalate_class` (classify-paths.sh), and `classify_failure`
(classify-failure.sh), and augments `conflict-check.sh:110`. All scripts are
pure-bash (no kubectl) **except** the conflict-check augmentation, which keeps the
existing `factory_psql`/kubectl path. The directory-prefix branch is restricted to
a closed allowlist with `website/src/pages/` carved out, so the `@>`-only behaviour
is preserved for application code and the 3-slot pool cannot starve.

Dependency order within this segment: B.1 (allowlist) → B.2 (classify-paths) →
B.3 (classify-failure) → B.4 (conflict-check augment) → B.5 (regression bats).

Consumed contract symbols defined in other segments: `factory_psql`,
`factory_resolve` (from `scripts/factory/lib.sh`, Phase 1 base — already exist).
Defined here and consumed by the retry-loop / escalation segments:
`shared-state-allowlist.txt`, `paths_are_escalate_class`, `classify_failure`.

---

### Task B.1: Shared-state allowlist file (single source of truth for escalate-class prefixes)

**Files:**
- Create: `scripts/factory/shared-state-allowlist.txt`
- Test: `tests/local/FA-SF-32-classify-paths.bats` (allowlist-presence assertion only in this task; classifier logic in B.2)

- [ ] **Step 1: Write the failing test** — create `tests/local/FA-SF-32-classify-paths.bats` with the allowlist-existence check:
```bash
#!/usr/bin/env bats
# FA-SF-32: shared-state allowlist + classify-paths.sh escalate-class detection.
setup() { load 'test_helper.bash'; }

@test "FA-SF-32: shared-state-allowlist.txt exists with the four required prefixes" {
  local f="scripts/factory/shared-state-allowlist.txt"
  [ -f "$f" ]
  grep -qx 'k3d/' "$f"
  grep -qx 'prod' "$f"
  grep -qx 'environments/' "$f"
  grep -qx 'Taskfile' "$f"
}
```

- [ ] **Step 2: Run it, expect FAIL** — file does not exist yet:
```
./tests/runner.sh local FA-SF-32
```
Expected: `FA-SF-32 ... not ok` / `[ -f "$f" ]` fails (file missing).

- [ ] **Step 3: Implement** — create `scripts/factory/shared-state-allowlist.txt` (one prefix per line, no comments, trailing newline):
```
k3d/
prod
environments/
Taskfile
```

- [ ] **Step 4: Run it, expect PASS**:
```
./tests/runner.sh local FA-SF-32
```
Expected: `ok 1 FA-SF-32: shared-state-allowlist.txt exists with the four required prefixes`.

- [ ] **Step 5: Commit**:
```
git add scripts/factory/shared-state-allowlist.txt tests/local/FA-SF-32-classify-paths.bats && git commit -m "feat(factory): add shared-state allowlist for escalate-class path classification [T000413]"
```

---

### Task B.2: classify-paths.sh — `paths_are_escalate_class`

**Files:**
- Create: `scripts/factory/classify-paths.sh`
- Test: `tests/local/FA-SF-32-classify-paths.bats` (append cases)

The function takes one comma-separated arg of files and exits 0 if ANY path is
escalate-class. Escalate-class = (matches an allowlist prefix) UNION (path contains
`secret` OR matches `realm*.json` basename OR ends in `.sql`). Allowlist prefixes
are read from `shared-state-allowlist.txt` (B.1).

- [ ] **Step 1: Write the failing test** — append these cases to `tests/local/FA-SF-32-classify-paths.bats`:
```bash
@test "FA-SF-32: k3d/ path is escalate-class (allowlist prefix)" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "k3d/website.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: prod-fleet path is escalate-class (prefix 'prod')" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "prod-fleet/mentolder/kustomization.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a .sql file is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/db/migrate.sql"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a path containing 'secret' is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "environments/.secrets/mentolder.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a realm json is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "k3d/realm-workspace-dev.json"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: pure website src is NOT escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/pages/index.astro,website/src/lib/foo.ts"
  [ "$status" -eq 1 ]
}

@test "FA-SF-32: mixed list with one shared-state path IS escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/lib/foo.ts,Taskfile.yml"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — `classify-paths.sh` does not exist:
```
./tests/runner.sh local FA-SF-32
```
Expected: the new cases fail with `source scripts/factory/classify-paths.sh` → `No such file or directory` / non-zero source.

- [ ] **Step 3: Implement** — create `scripts/factory/classify-paths.sh`:
```bash
#!/usr/bin/env bash
# scripts/factory/classify-paths.sh — path classification for the Software Factory.
# SOURCE, do not execute. Defines paths_are_escalate_class.
#
# Escalate-class = (path starts with any prefix in shared-state-allowlist.txt)
#   UNION (path contains "secret" OR basename matches realm*.json OR ends in .sql).
# These touched_files mean a feature is touching shared cluster/secret/SQL state and
# must escalate (block) rather than auto-retry.

_CLASSIFY_PATHS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_SHARED_STATE_ALLOWLIST="${_CLASSIFY_PATHS_DIR}/shared-state-allowlist.txt"

# paths_are_escalate_class <comma-separated-files>
# Exit 0 if ANY path is escalate-class, else exit 1.
paths_are_escalate_class() {
  local csv="${1:-}"
  [[ -z "$csv" ]] && return 1

  local -a prefixes=()
  if [[ -f "$_SHARED_STATE_ALLOWLIST" ]]; then
    local line
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" ]] && continue
      prefixes+=("$line")
    done < "$_SHARED_STATE_ALLOWLIST"
  fi

  local IFS=','
  local -a files=($csv)
  unset IFS

  local f base p
  for f in "${files[@]}"; do
    [[ -z "$f" ]] && continue
    base="${f##*/}"
    # secret / realm*.json / *.sql
    if [[ "$f" == *secret* ]] || [[ "$base" == realm*.json ]] || [[ "$f" == *.sql ]]; then
      return 0
    fi
    # allowlist prefixes
    for p in "${prefixes[@]}"; do
      if [[ "$f" == "$p"* ]]; then
        return 0
      fi
    done
  done
  return 1
}
```

- [ ] **Step 4: Run it, expect PASS**:
```
./tests/runner.sh local FA-SF-32
```
Expected: all FA-SF-32 cases `ok` (8 tests pass: allowlist presence + 7 classifier cases).

- [ ] **Step 5: Commit**:
```
git add scripts/factory/classify-paths.sh tests/local/FA-SF-32-classify-paths.bats && git commit -m "feat(factory): classify-paths.sh paths_are_escalate_class (allowlist + secret/realm/sql) [T000413]"
```

---

### Task B.3: classify-failure.sh — `classify_failure`

**Files:**
- Create: `scripts/factory/classify-failure.sh`
- Test: `tests/local/FA-SF-33-classify-failure.bats`

The function reads a CI-log file and echoes exactly one of:
`ci|test|lint|sql|manifest|secret|realm|other`. Used by the retry-loop to two-gate
its decision (failure-class AND path-class). Specific failure classes
(`sql`/`manifest`/`secret`/`realm`) win over generic ones (`test`/`lint`/`ci`).

- [ ] **Step 1: Write the failing test** — create `tests/local/FA-SF-33-classify-failure.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-33: classify-failure.sh maps a CI log to exactly one failure class.
setup() {
  load 'test_helper.bash'
  TMPLOG="$(mktemp)"
}
teardown() { rm -f "$TMPLOG"; }

_cf() { source scripts/factory/classify-failure.sh; classify_failure "$TMPLOG"; }

@test "FA-SF-33: psql/SQL error classifies as sql" {
  printf 'psql: ERROR:  relation "tickets.foo" does not exist\n' > "$TMPLOG"
  run _cf
  [ "$status" -eq 0 ]
  [ "$output" = "sql" ]
}

@test "FA-SF-33: kustomize build error classifies as manifest" {
  printf 'Error: kustomize build failed: accumulating resources\n' > "$TMPLOG"
  run _cf
  [ "$output" = "manifest" ]
}

@test "FA-SF-33: sealed secret error classifies as secret" {
  printf 'no key could decrypt secret (sealedsecret)\n' > "$TMPLOG"
  run _cf
  [ "$output" = "secret" ]
}

@test "FA-SF-33: keycloak realm import error classifies as realm" {
  printf 'failed to import realm realm-workspace-dev.json\n' > "$TMPLOG"
  run _cf
  [ "$output" = "realm" ]
}

@test "FA-SF-33: vitest failure classifies as test" {
  printf '1 failed | 12 passed (vitest)\nFAIL src/lib/foo.test.ts\n' > "$TMPLOG"
  run _cf
  [ "$output" = "test" ]
}

@test "FA-SF-33: eslint failure classifies as lint" {
  printf '/website/src/foo.ts\n  3:1  error  Missing semicolon  eslint\n' > "$TMPLOG"
  run _cf
  [ "$output" = "lint" ]
}

@test "FA-SF-33: github actions step failure classifies as ci" {
  printf '##[error]Process completed with exit code 1.\n' > "$TMPLOG"
  run _cf
  [ "$output" = "ci" ]
}

@test "FA-SF-33: unrecognised log classifies as other" {
  printf 'all good, nothing to report here\n' > "$TMPLOG"
  run _cf
  [ "$output" = "other" ]
}

@test "FA-SF-33: missing log file classifies as other" {
  run bash -c 'source scripts/factory/classify-failure.sh; classify_failure /nonexistent/path.log'
  [ "$output" = "other" ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — script missing:
```
./tests/runner.sh local FA-SF-33
```
Expected: every case fails on `source scripts/factory/classify-failure.sh` → `No such file or directory`.

- [ ] **Step 3: Implement** — create `scripts/factory/classify-failure.sh`:
```bash
#!/usr/bin/env bash
# scripts/factory/classify-failure.sh — map a CI log to one failure class.
# SOURCE, do not execute. Defines classify_failure.
#
# classify_failure <ci-log-file> echoes exactly ONE of:
#   ci | test | lint | sql | manifest | secret | realm | other
# Specific classes (sql/manifest/secret/realm) are checked first so they win over
# the generic ci/test/lint signal a failed step also emits.

classify_failure() {
  local log="${1:-}"
  if [[ -z "$log" || ! -f "$log" ]]; then
    echo "other"
    return 0
  fi

  # Specific, high-signal classes first.
  if grep -qiE 'psql:|sqlstate|relation .* does not exist|syntax error at or near|duplicate key value' "$log"; then
    echo "sql"; return 0
  fi
  if grep -qiE 'realm-workspace.*\.json|import realm|keycloak realm' "$log"; then
    echo "realm"; return 0
  fi
  if grep -qiE 'sealedsecret|no key could decrypt|could not decrypt|sealed-secrets' "$log"; then
    echo "secret"; return 0
  fi
  if grep -qiE 'kustomize build|kubectl apply.*error|error validating data|unable to recognize|manifest' "$log"; then
    echo "manifest"; return 0
  fi
  # Generic build classes.
  if grep -qiE 'eslint|prettier|astro check|tsc .*error|lint' "$log"; then
    echo "lint"; return 0
  fi
  if grep -qiE 'vitest|FAIL src/|[0-9]+ failed|not ok |bats|playwright' "$log"; then
    echo "test"; return 0
  fi
  if grep -qiE '##\[error\]|process completed with exit code|the job (was )?cancell?ed|workflow' "$log"; then
    echo "ci"; return 0
  fi
  echo "other"
  return 0
}
```

- [ ] **Step 4: Run it, expect PASS**:
```
./tests/runner.sh local FA-SF-33
```
Expected: all 9 FA-SF-33 cases `ok`.

- [ ] **Step 5: Commit**:
```
git add scripts/factory/classify-failure.sh tests/local/FA-SF-33-classify-failure.bats && git commit -m "feat(factory): classify-failure.sh classify_failure (sql/manifest/secret/realm/lint/test/ci/other) [T000413]"
```

---

### Task B.4: Augment conflict-check.sh:110 — directory-prefix branch for the allowlist set

**Files:**
- Modify: `scripts/factory/conflict-check.sh:101-112` (the `WITH new_files` CTE / `@>` predicate)
- Verify (lint): `node`/`bash -n`, no unit test in this task (live DB test is the regression bats B.5)

The existing exact-containment `t.touched_files @> ARRAY[nf.f]` stays as the base
branch. We ADD a second branch: if a new file is itself one of the closed-allowlist
shared-state prefixes (`k3d/`, `prod`, `environments/`, `Taskfile`) — and is NOT
under `website/src/pages/` — also flag any in-flight ticket whose touched_files have
an element with that directory prefix (`tf LIKE prefix || '%'`). `website/src/pages/`
is hard-excluded so two page-only features never serialize.

- [ ] **Step 1: VERIFICATION (pre-edit) — confirm the anchor** — read the exact predicate block to edit:
```
sed -n '100,112p' scripts/factory/conflict-check.sh
```
Expected output ends with:
```
  AND t.touched_files IS NOT NULL
  AND t.touched_files @> ARRAY[nf.f];
```

- [ ] **Step 2: Implement** — replace the `WHERE` predicate block (lines ~106-110) so the final two lines `AND t.touched_files IS NOT NULL` / `AND t.touched_files @> ARRAY[nf.f];` become the augmented predicate. Apply this exact Edit (old → new):

old:
```sql
WHERE t.external_id != :'ext_id'
  AND t.type IN ('feature','task')
  AND t.status IN ('backlog','in_progress','in_review')
  AND t.touched_files IS NOT NULL
  AND t.touched_files @> ARRAY[nf.f];
```
new:
```sql
WHERE t.external_id != :'ext_id'
  AND t.type IN ('feature','task')
  AND t.status IN ('backlog','in_progress','in_review')
  AND t.touched_files IS NOT NULL
  AND (
    -- base: exact element containment (unchanged)
    t.touched_files @> ARRAY[nf.f]
    -- augment: directory-prefix match, ONLY for the closed shared-state
    -- allowlist (k3d/, prod, environments/, Taskfile) and NOT for
    -- website/src/pages/ (page-only features must stay parallel).
    OR (
      nf.f NOT LIKE 'website/src/pages/%'
      AND (nf.f LIKE 'k3d/%' OR nf.f LIKE 'prod%'
           OR nf.f LIKE 'environments/%' OR nf.f LIKE 'Taskfile%')
      AND EXISTS (
        SELECT 1 FROM unnest(t.touched_files) AS tf
        WHERE tf LIKE nf.f || '%'
      )
    )
  );
```

- [ ] **Step 3: VERIFICATION — bash syntax + heredoc still well-formed**:
```
bash -n scripts/factory/conflict-check.sh && echo SYNTAX_OK
```
Expected: `SYNTAX_OK`.

- [ ] **Step 4: VERIFICATION — dry-resolve still works (no kubectl needed)**:
```
env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh T000001
```
Expected: `resolved: ctx=fleet ns=workspace-korczewski` and exit 0.

- [ ] **Step 5: Commit**:
```
git add scripts/factory/conflict-check.sh && git commit -m "feat(factory): conflict-check directory-prefix branch for shared-state allowlist (website/src/pages excluded) [T000413]"
```

---

### Task B.5: Regression bats — page-only features stay PARALLEL, k3d/ features serialize

**Files:**
- Create: `tests/local/FA-SF-34-prefix-conflict.bats`
- Modify: `website/src/data/test-inventory.json` (register FA-SF-32/33/34)

This is the contract-critical regression: two `website/src/pages/` features must NOT
conflict (so the pool does not starve), and two `k3d/` features in the same directory
MUST conflict via the new prefix branch. It uses the live-DB fixtures
(`seed_test_feature` from `tests/lib/factory-test-fixtures.sh`) and skips when no
cluster context is set, mirroring FA-SF-25's gating.

- [ ] **Step 1: Write the failing test** — create `tests/local/FA-SF-34-prefix-conflict.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-34: directory-prefix conflict heuristic regression.
#   - two website/src/pages/ features stay PARALLEL (no conflict)
#   - two k3d/ features in the same dir SERIALIZE (conflict via prefix branch)
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }
teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }

@test "FA-SF-34: two website/src/pages features do NOT conflict (stay parallel)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "website/src/pages/foo.astro")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999998" "website/src/pages/bar.astro"
  [ "$status" -eq 0 ]
  [ "$output" = "[]" ]
}

@test "FA-SF-34: two k3d/ features in same dir DO conflict (serialize)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "k3d/website.yaml")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999997" "k3d/brett.yaml"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "$existing" ]]
}

@test "FA-SF-34: exact-overlap base branch still conflicts (regression on @>)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  local existing
  existing=$(seed_test_feature "$brand" "website/src/lib/shared.ts")
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" \
    bash scripts/factory/conflict-check.sh "T999996" "website/src/lib/shared.ts"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "$existing" ]]
}
```

- [ ] **Step 2: Run it, expect SKIP-or-FAIL offline; targeted check** — without a cluster context the live cases skip (still proves wiring); the JSON-shape default-skip path is acceptable. Run:
```
./tests/runner.sh local FA-SF-34
```
Expected (no `FACTORY_CTX`): `ok 1 ... # skip no dev cluster context set` ×3. With `FACTORY_CTX` set to a dev cluster BEFORE B.4 was applied, case 2 would FAIL (status 0, not 1) — that is the regression the augment fixes.

- [ ] **Step 3: Implement** — register the three new bats IDs in `website/src/data/test-inventory.json`. Add the FA-SF-32/33/34 entries to the inventory array (match the existing object shape used by FA-SF-25, with the file path under `tests/local/`):
```json
{ "id": "FA-SF-32", "file": "tests/local/FA-SF-32-classify-paths.bats", "category": "local", "description": "classify-paths.sh paths_are_escalate_class (allowlist + secret/realm/sql)" },
{ "id": "FA-SF-33", "file": "tests/local/FA-SF-33-classify-failure.bats", "category": "local", "description": "classify-failure.sh classify_failure mapping" },
{ "id": "FA-SF-34", "file": "tests/local/FA-SF-34-prefix-conflict.bats", "category": "local", "description": "directory-prefix conflict heuristic regression (pages parallel, k3d serialize)" }
```
Note: do NOT hand-edit JSON if the repo regenerates it — instead run the generator and let it pick up the new bats:
```
task test:inventory
```
Then confirm the file changed and contains the three IDs:
```
grep -E 'FA-SF-3[234]' website/src/data/test-inventory.json
```
Expected: three matching lines.

- [ ] **Step 4: VERIFICATION — full offline test suite + inventory parity (CI gate)**:
```
task test:all && git diff --exit-code website/src/data/test-inventory.json && echo INVENTORY_CLEAN
```
Expected: `task test:all` green (FA-SF-32/33 pass, FA-SF-34 skips offline) and `INVENTORY_CLEAN` (committed inventory matches regenerated — the CI inventory check will pass).

- [ ] **Step 5: Commit**:
```
git add tests/local/FA-SF-34-prefix-conflict.bats website/src/data/test-inventory.json && git commit -m "test(factory): FA-SF-34 prefix-conflict regression (pages parallel, k3d serialize) + register FA-SF-32/33/34 [T000413]"
```


## Phase 1C — Hard Guards (PREP + Deploy) & Escalation/PushNotification Routing

This segment builds `scripts/factory/guards.sh` (the four `guard_*` functions), wires the
PREP-gate into `dispatcher.js` (kill-switch / daily-cap / dry-run-first read fresh per tick,
**fail-closed** on read error → `prep.launch = []`), captures the previously-discarded
`parallel()` result and adds a post-launch PushNotification escalation step, and hardens the
`pipeline.js` Deploy phase (WORK_BRANCH regex, diff-size cap, MAIN_REPO + explicit `ENV=`).
PushNotification calls at the existing escalation sites (`pipeline.js:172-174` conflict,
`:278-289` Verify HIGH/CRITICAL) are routed from the Workflow runtime via `ToolSearch select:PushNotification`.

**Contract symbols this segment DEFINES** (other segments consume by exact name):
- `scripts/factory/guards.sh` → `guard_killswitch_on <brand>`, `guard_daily_cap_reached <brand>`,
  `guard_dryrun_ok <ext_id>`, `guard_check_diff_size <max>`.

**Contract symbols this segment CONSUMES** (defined in other segments — cited by exact name):
- `scripts/factory/lib.sh` → `factory_psql` (already exists; sourced for `guard_*`).
- `scripts/ticket.sh` subcommands: `factory-control get --key <k> [--brand <b>]`,
  `dryrun-check --id <ext>` (DB/CLI segment).
- `tickets.factory_control` table + keys `killswitch`, `daily_deploy_count` (DB segment).
- Env vars: `FACTORY_DAILY_DEPLOY_CAP`, `FACTORY_MAX_DIFF`, `FACTORY_GLOBAL_CAP`.
- `PushNotification` deferred tool (loaded at call sites via `ToolSearch select:PushNotification`).

Dependency order within the segment: **C.1 → C.2 → C.3** (guards.sh first; it is read by the
dispatcher PREP gate and by pipeline Deploy), then **C.4 → C.5** (dispatcher escalation +
pipeline escalation routing), then **C.6** (bats grep-assertions registered in test-inventory).

---

### Task C.1: `guards.sh` — kill-switch & daily-cap readers (fail-closed)

**Files:**
- Create: `scripts/factory/guards.sh`
- Test: `tests/local/FA-SF-36-guards.bats`

- [ ] **Step 1: Write the failing test** — full test code:
```bash
#!/usr/bin/env bats
# FA-SF-36: structural contract for scripts/factory/guards.sh (offline, no cluster).
SCRIPT="scripts/factory/guards.sh"
setup() { load 'test_helper.bash'; }

@test "FA-SF-36: guards.sh exists and passes bash -n" {
  [ -f "$SCRIPT" ]
  run bash -n "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-36: defines the four guard functions" {
  for fn in guard_killswitch_on guard_daily_cap_reached guard_dryrun_ok guard_check_diff_size; do
    run grep -Eq "^${fn}\(\)" "$SCRIPT"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-36: sources lib.sh for factory_psql (no inline kubectl)" {
  run grep -Eq 'source .*lib\.sh|\. .*lib\.sh' "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "factory_psql" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-36: kill-switch reads factory_control via ticket.sh factory-control get" {
  run grep -q "factory-control get" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "killswitch" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-36: daily-cap honours FACTORY_DAILY_DEPLOY_CAP" {
  run grep -q "FACTORY_DAILY_DEPLOY_CAP" "$SCRIPT"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — `./tests/runner.sh local FA-SF-36`
  Expected: first test fails — `guards.sh exists and passes bash -n` → `[ -f "$SCRIPT" ]` returns
  non-zero (file does not exist yet). Output contains `not ok 1 FA-SF-36: guards.sh exists and passes bash -n`.

- [ ] **Step 3: Implement** — create `scripts/factory/guards.sh` with the kill-switch + daily-cap readers:
```bash
#!/usr/bin/env bash
# scripts/factory/guards.sh — Software Factory Phase-3 HARD GUARDS.
#
# Four guard predicates (exit 0 = guard "tripped"/satisfied as documented per fn).
# All readers are FAIL-CLOSED: any read error → treat as tripped (the dispatcher
# PREP gate must not launch when state is unknown).
#
# SOURCE for factory_psql, then call the guards from .sh; the dispatcher reads the
# kill-switch / daily-cap fresh per tick via ticket.sh (cross-brand, kubectl-exec-psql).
#
#   guard_killswitch_on <brand>        exit 0 if the global OR per-brand kill-switch is ON
#   guard_daily_cap_reached <brand>    exit 0 if today's deploy count >= FACTORY_DAILY_DEPLOY_CAP
#   guard_dryrun_ok <ext_id>           exit 0 if the ticket carries the dry-run-first marker
#   guard_check_diff_size <max>        exit 1 if (insertions+deletions) of origin/main...HEAD > max
#
# Offline lint:   bash -n scripts/factory/guards.sh
# Contract tests: ./tests/runner.sh local FA-SF-36
set -uo pipefail

GUARDS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARDS_REPO="${GUARDS_REPO:-/home/patrick/Bachelorprojekt}"
# shellcheck source=scripts/factory/lib.sh
source "${GUARDS_DIR}/lib.sh"

# guard_killswitch_on <brand> — exit 0 (ON) when the global (brand NULL) OR the
# per-brand kill-switch value is "on"/"true"/"1". Fail-closed: any read error → ON.
guard_killswitch_on() {
  local brand="${1:?brand required}" g b
  g=$(bash "${GUARDS_REPO}/scripts/ticket.sh" factory-control get --key killswitch 2>/dev/null) \
    || { echo "guard_killswitch_on: global read FAILED → fail-closed ON" >&2; return 0; }
  b=$(bash "${GUARDS_REPO}/scripts/ticket.sh" factory-control get --key killswitch --brand "$brand" 2>/dev/null) \
    || { echo "guard_killswitch_on: brand read FAILED → fail-closed ON" >&2; return 0; }
  case "${g,,}" in on|true|1) return 0 ;; esac
  case "${b,,}" in on|true|1) return 0 ;; esac
  return 1
}

# guard_daily_cap_reached <brand> — exit 0 when today's deploy count >= cap.
# Reads the per-brand counter key "daily_deploy_count"; missing/empty = 0.
# Fail-closed: cap unset OR read error → reached (return 0).
guard_daily_cap_reached() {
  local brand="${1:?brand required}" cap count
  cap="${FACTORY_DAILY_DEPLOY_CAP:-}"
  [[ -z "$cap" ]] && { echo "guard_daily_cap_reached: FACTORY_DAILY_DEPLOY_CAP unset → fail-closed REACHED" >&2; return 0; }
  count=$(bash "${GUARDS_REPO}/scripts/ticket.sh" factory-control get --key daily_deploy_count --brand "$brand" 2>/dev/null) \
    || { echo "guard_daily_cap_reached: read FAILED → fail-closed REACHED" >&2; return 0; }
  [[ "$count" =~ ^[0-9]+$ ]] || count=0
  (( count >= cap ))
}
```

- [ ] **Step 4: Run it, expect PASS** — `bash -n scripts/factory/guards.sh && ./tests/runner.sh local FA-SF-36`
  Expected: `bash -n` exits 0 (no output). Then 5 bats lines all `ok`:
  `ok 1 FA-SF-36: guards.sh exists and passes bash -n` … `ok 5 FA-SF-36: daily-cap honours FACTORY_DAILY_DEPLOY_CAP`.
  (The `dryrun`/`diff-size` greps are added in C.2; FA-SF-36 here only asserts existence of all four fn
  names — those two functions are stubbed in this step? No: add them in C.2. So in this task only the
  first 3 of the four `grep -Eq "^${fn}\(\)"` succeed. Therefore in C.1 the "defines the four guard
  functions" test will FAIL on `guard_dryrun_ok`/`guard_check_diff_size`.) — **Run instead:**
  `./tests/runner.sh local FA-SF-36` and expect tests 1, 3, 4, 5 `ok`, test 2 `not ok` (two functions
  still missing). This is the planned intermediate red; C.2 turns it green.

- [ ] **Step 5: Commit** — `git add scripts/factory/guards.sh tests/local/FA-SF-36-guards.bats && git commit -m "feat(factory): guards.sh kill-switch + daily-cap fail-closed readers [T000413]"`

---

### Task C.2: `guards.sh` — dry-run-first marker & diff-size guard

**Files:**
- Modify: `scripts/factory/guards.sh` (append two functions)

- [ ] **Step 1: Run the FA-SF-36 "four functions" test, expect FAIL** — `./tests/runner.sh local FA-SF-36`
  Expected: `not ok 2 FA-SF-36: defines the four guard functions` (the loop fails at
  `guard_dryrun_ok`). This is the red we close in this task.

- [ ] **Step 2: Implement** — append to `scripts/factory/guards.sh`:
```bash
# guard_dryrun_ok <ext_id> — exit 0 when the ticket carries the dry-run-first marker.
# Delegates to ticket.sh dryrun-check (exit 0 iff marked). Fail-closed: read error → NOT ok (1).
guard_dryrun_ok() {
  local ext_id="${1:?external id required}"
  if bash "${GUARDS_REPO}/scripts/ticket.sh" dryrun-check --id "$ext_id" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# guard_check_diff_size <max> — HARD diff-size cap for the Deploy phase.
# Reads `git diff --shortstat origin/main...HEAD`, sums insertions+deletions.
# exit 0 if within budget; exit 1 if over (caller HARD-blocks). Read error → over (1).
guard_check_diff_size() {
  local max="${1:?max required}" line ins del total
  line=$(git diff --shortstat origin/main...HEAD 2>/dev/null) \
    || { echo "guard_check_diff_size: git diff FAILED → fail-closed OVER" >&2; return 1; }
  ins=$(sed -nE 's/.*[, ]([0-9]+) insertion.*/\1/p' <<<"$line"); ins="${ins:-0}"
  del=$(sed -nE 's/.*[, ]([0-9]+) deletion.*/\1/p'  <<<"$line"); del="${del:-0}"
  total=$(( ins + del ))
  if (( total > max )); then
    echo "guard_check_diff_size: diff ${total} > ${max} (insertions=${ins} deletions=${del}) → BLOCK" >&2
    return 1
  fi
  echo "guard_check_diff_size: diff ${total} <= ${max} OK" >&2
  return 0
}
```

- [ ] **Step 3: Run it, expect PASS** — `bash -n scripts/factory/guards.sh && ./tests/runner.sh local FA-SF-36`
  Expected: `bash -n` exits 0; all 5 bats lines `ok`, in particular
  `ok 2 FA-SF-36: defines the four guard functions`.

- [ ] **Step 4: Verify diff-size math offline** — run an inline harness (no cluster):
  `bash -c 'source scripts/factory/guards.sh; git() { echo " 3 files changed, 500 insertions(+), 401 deletions(-)"; }; export -f git; guard_check_diff_size 800; echo "exit=$?"'`
  Expected last line: `exit=1` (500+401=901 > 800 → HARD block), with stderr
  `guard_check_diff_size: diff 901 > 800 ... → BLOCK`. Then re-run with `guard_check_diff_size 1000` →
  `exit=0` and stderr `diff 901 <= 1000 OK`.

- [ ] **Step 5: Commit** — `git add scripts/factory/guards.sh && git commit -m "feat(factory): guards.sh dry-run-first marker + diff-size HARD cap [T000413]"`

---

### Task C.3: dispatcher PREP gate — kill-switch / daily-cap / dry-run read fresh per tick (fail-closed)

**Files:**
- Modify: `scripts/factory/dispatcher.js` (PREP agent prompt, near `FACTORY_GLOBAL_CAP=3` :64; the
  early-return `:82-84` stays as-is and is reused when the gate empties `prep.launch`)
- Test: `tests/local/FA-SF-30-dispatcher-contract.bats` (append grep-assertions)

- [ ] **Step 1: Write the failing test** — append to `tests/local/FA-SF-30-dispatcher-contract.bats`:
```bash
@test "FA-SF-30: PREP gate reads hard guards fresh per tick via guards.sh" {
  run grep -q "scripts/factory/guards.sh" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "guard_killswitch_on" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "guard_daily_cap_reached" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: PREP gate is fail-closed (drops the brand from launch on guard trip / read error)" {
  run grep -Eq "fail-closed|fail closed" "$SCRIPT"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — `./tests/runner.sh local FA-SF-30`
  Expected: `not ok ... FA-SF-30: PREP gate reads hard guards fresh per tick via guards.sh`
  (`guards.sh` not yet referenced in `dispatcher.js`).

- [ ] **Step 3: Implement** — in `scripts/factory/dispatcher.js`, augment the PREP agent prompt
  (the `await agent(...)` after `phase('Prep')`, near line 64). Replace the per-brand step list so the
  guard gate runs **before** `schedule.sh` and drops a brand on trip; the existing early-return at
  `:82-84` (`if (prep.launch.length === 0) return`) is the fail-closed terminus.
  Change the numbered loop inside the PREP prompt to:
```js
  const prep = await agent(
    `You are the Software Factory dispatcher PREP step. Run the deterministic scripts below from
     ${REPO} and report ONLY what the scripts decide — do not schedule by your own judgment.

     For EACH brand in [mentolder, korczewski]:
       0. HARD-GUARD GATE (read fresh per tick; FAIL-CLOSED — on ANY non-zero exit other than the
          documented "not tripped" case, treat the guard as tripped and SKIP scheduling this brand):
            source ${REPO}/scripts/factory/guards.sh
            # kill-switch ON  → exit 0; record "killswitch" and SKIP this brand
            GUARDS_REPO=${REPO} guard_killswitch_on <brand>   ; KS=$?
            # daily-cap reached → exit 0; record "daily_cap" and SKIP this brand
            FACTORY_DAILY_DEPLOY_CAP=${process.env.FACTORY_DAILY_DEPLOY_CAP ?? '5'} GUARDS_REPO=${REPO} guard_daily_cap_reached <brand> ; CAP=$?
          If KS==0 (kill-switch ON) OR CAP==0 (daily cap reached): emit NO launch objects for this
          brand and append { brand, reason } to a "skipped" list. Otherwise continue to steps 1-2.
       1. Watchdog sweep (escalate stale runs, free their slots):
          BRAND=<brand> bash ${REPO}/scripts/factory/watchdog.sh
       2. Schedule (poll backlog + best-effort conflict gate + claim slots up to the global cap):
          BRAND=<brand> FACTORY_GLOBAL_CAP=3 bash ${REPO}/scripts/factory/schedule.sh
          (schedule.sh enforces the global cap across BOTH brands by summing occupied slots.)

     For EACH claimed external_id also enforce the per-ticket DRY-RUN-FIRST guard
     (a feature must have been dry-run at least once before it may ship live):
       GUARDS_REPO=${REPO} guard_dryrun_ok <external_id> ; DR=$?
       If DR != 0 (not yet dry-run), STILL launch it but force dry_run=true for THAT object only.

     Collect every {brand, external_id, slot} object that schedule.sh claimed across both brands.
     For each claimed external_id, fetch its details:
       BRAND=<brand> bash ${REPO}/scripts/ticket.sh get --id <external_id>
       Read .title and .plan_ref from the returned JSON.
       If .plan_ref contains a FACTORY-PLAN-REF comment, parse "branch=<value>" and "plan=<value>" from it.

     Return JSON: { "launch": [ {brand, external_id, slot, title, branch, plan_path, dry_run} ... ],
                    "skipped": [ {brand, reason} ... ] }.
     dry_run is true for objects that failed the dry-run-first guard, else inherit the tick policy.
     If a guard read errors (non-zero with no documented meaning), FAIL-CLOSED: skip that brand.
     If a ticket has no plan reference, set branch and plan_path to null.
     If nothing was claimed across both brands, return { "launch": [], "skipped": [...] }.`,
    { label: 'prep', phase: 'Prep', schema: PLAN_SCHEMA },
  )
```
  Also extend `PLAN_SCHEMA.properties.launch.items.properties` with `dry_run: { type: 'boolean' }`
  and add a top-level optional `skipped` array to `PLAN_SCHEMA.properties`:
```js
      skipped: {
        type: 'array',
        items: {
          type: 'object',
          properties: { brand: { type: 'string' }, reason: { type: 'string' } },
        },
      },
```
  Finally, propagate the per-object dry-run into the Launch nesting (line ~100, the
  `dry_run:` arg of `workflow(...)`):
```js
            dry_run: f.dry_run === true || A.dry_run === true || A.dry_run === 'true',
```

- [ ] **Step 4: Run it, expect PASS** — `node --check scripts/factory/dispatcher.js && ./tests/runner.sh local FA-SF-30`
  Expected: `node --check` exits 0 (no output); all FA-SF-30 bats lines `ok`, including the two new
  PREP-gate assertions and the unchanged resume-safety / both-brands assertions.

- [ ] **Step 5: Commit** — `git add scripts/factory/dispatcher.js tests/local/FA-SF-30-dispatcher-contract.bats && git commit -m "feat(factory): dispatcher PREP hard-guard gate (kill-switch/daily-cap/dry-run, fail-closed) [T000413]"`

---

### Task C.4: dispatcher — capture `parallel()` result + post-launch PushNotification escalation

**Files:**
- Modify: `scripts/factory/dispatcher.js` (Launch block :88 `await parallel(...)`; new post-launch step
  before `phase('Metrics')`)
- Test: `tests/local/FA-SF-30-dispatcher-contract.bats` (append grep-assertions)

- [ ] **Step 1: Write the failing test** — append to `tests/local/FA-SF-30-dispatcher-contract.bats`:
```bash
@test "FA-SF-30: captures the parallel() launch result (not discarded)" {
  run grep -Eq "const +results +=.*parallel\(|= await parallel\(" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: post-launch escalation loads PushNotification via ToolSearch and notifies on error/blocked" {
  run grep -q "ToolSearch select:PushNotification" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "\.error|status === 'blocked'|status: *'blocked'|blocked" "$SCRIPT"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — `./tests/runner.sh local FA-SF-30`
  Expected: `not ok ... FA-SF-30: captures the parallel() launch result (not discarded)` — the current
  code is `await parallel(...)` with the return discarded.

- [ ] **Step 3: Implement** — in `scripts/factory/dispatcher.js`, change line 88 `await parallel(` to
  capture the result, and insert a post-launch escalation step after the `parallel(...)` block and
  before `phase('Metrics')`:
```js
  // ── ② Launch: nest one pipeline workflow per scheduled feature (Model A) ──────
  phase('Launch')
  const results = await parallel(
    prep.launch.map(
      (f) => () =>
        workflow(
          { scriptPath: 'scripts/factory/pipeline.js' },
          {
            title: f.title ?? f.external_id,
            description: `Dispatched by the Software Factory dispatcher (slot ${f.slot}).`,
            slug: f.branch ? String(f.branch).replace(/^feature\//, '') : `sf-${String(f.external_id).toLowerCase()}`,
            ticket_id: f.external_id,
            brand: f.brand,
            timestamp: A.timestamp,
            dry_run: f.dry_run === true || A.dry_run === true || A.dry_run === 'true',
            branch: f.branch || null,
            plan_path: f.plan_path || null,
          },
        )
          .then((r) => ({ external_id: f.external_id, brand: f.brand, result: r }))
          .catch((e) => ({ external_id: f.external_id, brand: f.brand, error: String(e) })),
    ),
  )

  // ── ②b Escalation routing: surface every error / blocked pipeline (never silent) ──
  // The parallel() result was previously discarded (gotcha: dispatcher.js:88) which
  // swallowed both .catch errors (:105-106) and structured { status:'blocked' } returns.
  const escalations = (results ?? []).filter(
    (r) => r && (r.error || (r.result && r.result.status === 'blocked')),
  )
  if (escalations.length) {
    await agent(
      `${escalations.length} pipeline run(s) ended in error or blocked this tick. Notify the operator
       and record it on the Vorhaben ticket. PushNotification is a DEFERRED tool — you MUST first run
       \`ToolSearch select:PushNotification\` to load its schema, then call it ONCE with a summary:
         title:   "Software Factory: ${escalations.length} run(s) blocked/errored"
         message: a compact per-run list of "<brand> <external_id>: <error|blocked reason>"
       Use this exact escalation payload (already serialised):
         ${JSON.stringify(
           escalations.map((r) => ({
             brand: r.brand,
             external_id: r.external_id,
             status: r.error ? 'error' : (r.result && r.result.status) || 'blocked',
             reason: r.error || (r.result && (r.result.reason || r.result.conflict)) || 'see ticket',
           })),
         )}
       After notifying, append ONE breadcrumb to the Vorhaben ticket:
         bash ${REPO}/scripts/ticket.sh add-comment --id T000413 \\
           --body ${JSON.stringify('Factory dispatcher: ' + escalations.length + ' run(s) escalated this tick.')}
       Report what was notified and the ticket-comment output.`,
      { label: 'escalate', phase: 'Launch' },
    )
  } else {
    log(`Dispatcher: all ${results?.length ?? 0} pipeline run(s) completed without error/block.`)
  }
```

- [ ] **Step 4: Run it, expect PASS** — `node --check scripts/factory/dispatcher.js && ./tests/runner.sh local FA-SF-30`
  Expected: `node --check` exits 0; all FA-SF-30 bats lines `ok`, including the two new escalation
  assertions.

- [ ] **Step 5: Commit** — `git add scripts/factory/dispatcher.js tests/local/FA-SF-30-dispatcher-contract.bats && git commit -m "feat(factory): dispatcher captures parallel() result + PushNotification escalation routing [T000413]"`

---

### Task C.5: pipeline Deploy guards + PushNotification at the two existing escalation sites

**Files:**
- Modify: `scripts/factory/pipeline.js` (conflict block :172-174; Verify HIGH/CRITICAL :278-289;
  Deploy phase guards before push :313 / merge :321 / deploy :329)
- Test: `tests/local/FA-SF-20-pipeline-contract.bats` (append grep-assertions)

- [ ] **Step 1: Write the failing test** — append to `tests/local/FA-SF-20-pipeline-contract.bats`:
```bash
@test "FA-SF-20: Deploy phase enforces WORK_BRANCH regex feature/*|fix/* + diff-size guard" {
  run grep -Eq "feature/.*\|fix/|guard_check_diff_size" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "FACTORY_MAX_DIFF" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: Deploy asserts MAIN_REPO cwd + explicit ENV= (no bare context)" {
  run grep -q "ENV=mentolder" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "ENV=korczewski" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: both escalation sites route PushNotification via ToolSearch" {
  run grep -c "ToolSearch select:PushNotification" "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — `./tests/runner.sh local FA-SF-20`
  Expected: `not ok ... FA-SF-20: Deploy phase enforces WORK_BRANCH regex ... + diff-size guard`
  (`guard_check_diff_size` / `FACTORY_MAX_DIFF` not yet in `pipeline.js`).

- [ ] **Step 3a: Implement Deploy guards** — in `scripts/factory/pipeline.js`, insert a hard-guard
  preamble into the `deploy` agent prompt **before** the `Steps:` list (i.e. before step 1 "Push branch"
  at :313). Add after the "Operate from the MAIN repo …" line:
```js
   HARD GUARDS — run these from ${REPO} and STOP (set the ticket blocked, notify, return) on any failure:
   a. Branch policy: WORK_BRANCH must match ^(feature|fix)/ .
      printf '%s' "${WORK_BRANCH}" | grep -Eq '^(feature|fix)/' || { echo "BLOCK: WORK_BRANCH ${WORK_BRANCH} not feature/*|fix/*"; exit 1; }
   b. Diff-size cap (HARD): from ${REPO},
      source ${REPO}/scripts/factory/guards.sh
      GUARDS_REPO=${REPO} guard_check_diff_size ${process.env.FACTORY_MAX_DIFF ?? '800'}
      If guard_check_diff_size returns non-zero, the diff exceeds FACTORY_MAX_DIFF — DO NOT push/merge/deploy.
   c. CWD assertion: every git/gh/task command below MUST run with cwd = ${REPO} (the MAIN repo),
      never the worktree ${WORK_WT} (gotcha T000342).
   d. Explicit ENV: prod deploys use ENV=mentolder and ENV=korczewski explicitly — NEVER a bare
      kubectl context. Context is resolved internally via \`source ${REPO}/scripts/env-resolve.sh <env>\`
      (→ ENV_CONTEXT=fleet); do not pass a bare cluster name.

   If guard (a) or (b) fails: run
     bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
   then load PushNotification (\`ToolSearch select:PushNotification\`) and notify
     title: "Factory Deploy blocked: ${A.ticket_id}"
     message: which guard failed (branch-policy or diff>FACTORY_MAX_DIFF) for brand ${brand}.
   Return { status: 'blocked', reason: 'deploy-guard' } and take no further action.
```
  And change the existing prod-deploy command in step 6 to keep the explicit per-brand `ENV=` form
  (already `task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski` — leave as-is;
  the grep test asserts both literals are present).

- [ ] **Step 3b: Implement conflict-site PushNotification (:172-174)** — replace the conflict
  `return { status: 'blocked', reason: 'file-overlap', conflict }` block so it notifies first:
```js
  if (/\"T0/.test(conflict)) {
    log(`Conflict detected: ${conflict}`)
    await agent(
      `A file-overlap conflict blocks this feature. Notify the operator: PushNotification is DEFERRED —
       run \`ToolSearch select:PushNotification\` first, then call it once:
         title:   "Factory conflict: ${A.ticket_id} (${brand})"
         message: "Pipeline blocked on file overlap. Detail: ${String(conflict).slice(0, 280)}"
       Report what was notified.`,
      { label: 'conflict:escalate', phase: 'Plan' },
    )
    return { status: 'blocked', reason: 'file-overlap', conflict }
  }
```

- [ ] **Step 3c: Implement Verify-site PushNotification (:278-289)** — augment the existing
  `verify:escalate` agent prompt to also fire PushNotification (keep the ticket update + comment it
  already does). Append to that prompt body, before `Report the command outputs.`:
```js
     Then notify the operator: PushNotification is a DEFERRED tool — run
     \`ToolSearch select:PushNotification\` to load it, then call it once with
       title:   "Factory Verify blocked: ${A.ticket_id} (${brand})"
       message: "${blocking.length} HIGH/CRITICAL review finding(s) block merge."
```

- [ ] **Step 4: Run it, expect PASS** — `node --check scripts/factory/pipeline.js && ./tests/runner.sh local FA-SF-20`
  Expected: `node --check` exits 0; all FA-SF-20 bats lines `ok`, including
  `ok ... FA-SF-20: Deploy phase enforces WORK_BRANCH regex feature/*|fix/* + diff-size guard`,
  `ok ... FA-SF-20: Deploy asserts MAIN_REPO cwd + explicit ENV= (no bare context)`,
  and `ok ... FA-SF-20: both escalation sites route PushNotification via ToolSearch`.

- [ ] **Step 5: Commit** — `git add scripts/factory/pipeline.js tests/local/FA-SF-20-pipeline-contract.bats && git commit -m "feat(factory): pipeline Deploy hard guards + PushNotification at conflict/verify escalation sites [T000413]"`

---

### Task C.6: register FA-SF-36 in test-inventory + green offline suite

**Files:**
- Modify: `website/src/data/test-inventory.json` (add the FA-SF-36 entry)

- [ ] **Step 1: Implement** — add the FA-SF-36 object to the JSON array `website/src/data/test-inventory.json`,
  immediately after the FA-SF-30 entry, mirroring its shape exactly:
```json
  {
    "id": "FA-SF-36",
    "file": "tests/local/FA-SF-36-guards.bats",
    "category": "FA",
    "kind": "shell"
  },
```

- [ ] **Step 2: Verify inventory regenerates clean** — `task test:inventory && git diff --exit-code website/src/data/test-inventory.json`
  Expected: `task test:inventory` regenerates the file; `git diff --exit-code` exits 0 (no output) —
  i.e. the hand-added FA-SF-36 entry matches what the generator produces. (If the generator orders
  differently, re-run `task test:inventory` once more and stage its output instead.)

- [ ] **Step 3: VERIFY the full offline guard/dispatcher/pipeline suite green** —
  `./tests/runner.sh local FA-SF-20 FA-SF-30 FA-SF-36`
  Expected: every line `ok`, summary `N tests, 0 failures` across all three IDs (no `not ok`).

- [ ] **Step 4: Lint all touched JS offline** —
  `node --check scripts/factory/dispatcher.js && node --check scripts/factory/pipeline.js && bash -n scripts/factory/guards.sh`
  Expected: all three exit 0 with no output.

- [ ] **Step 5: Commit** — `git add website/src/data/test-inventory.json && git commit -m "test(factory): register FA-SF-36 guards bats in test-inventory [T000413]"`


## Phase 1D — Self-healing retry loop + Layer-4 canary/rollback

Replaces the LLM-prose "retry after 2 attempts" at `scripts/factory/pipeline.js:319-320`
with a **structured ≤2 retry loop** (two-gated classification), and adds a **live-prod
canary** (`observe_prod()` in `scripts/feature-promote.sh`) wired into the pipeline's Deploy
phase with capture-pre-deploy-revision → `rollout undo` → feature-flag OFF → blocked.

**Consumed contract symbols (defined in other segments — used here by exact name):**
- `scripts/ticket.sh` subcommands: `retry-count get|incr|reset --id <ext>`,
  `feature-flag set --brand <b> --key <k> --enabled <true|false> [--set-by <who>]`.
- `scripts/factory/classify-failure.sh` → func `classify_failure <ci-log-file>`
  (echoes one of `ci|test|lint|sql|manifest|secret|realm|other`).
- `scripts/factory/classify-paths.sh` → func `paths_are_escalate_class <comma-sep-files>`
  (exit 0 if ANY path is escalate-class).
- `tickets.tickets.retry_count` column (Segment A schema).
- `PushNotification` Workflow tool (loaded via `ToolSearch select:PushNotification`).
- `source scripts/env-resolve.sh <env>` → `ENV_CONTEXT=fleet` (env-resolve segment / existing).

**Defined here (this segment is the source of truth for these symbols):**
- `scripts/feature-promote.sh::observe_prod <cluster> <full_image>` — live-prod canary
  (set-image already done by caller; re-probe `web.<brand>.de` unauth ~5 min; on red →
  capture pre-deploy revision + `rollout undo --to-revision` + status; never use dead
  `prod_ctx()` — context strictly via `env-resolve.sh`).
- `scripts/factory/pipeline.js` Deploy retry-loop semantics: auto-fix ONLY if
  `classify_failure ∈ {ci,test,lint}` AND `paths_are_escalate_class` is false; cap 2.
- `tests/e2e/smoke/website.txt` — unauth-only canary grep patterns.

> **Dependency order within this segment:** D.1 (smoke patterns, no deps) → D.2
> (`observe_prod` helper) → D.3 (canary bats contract) → D.4 (pipeline retry-loop CI-red
> replacement) → D.5 (retry classification bats) → D.6 (pipeline Deploy canary wiring).

---

### Task D.1: Unauth-only canary smoke patterns for live prod

The live-prod canary cannot log in (SSO). It greps **only** unauthenticated specs.
This file is the `resolve_smoke_grep` source (`feature-promote.sh:160-169`, priority b)
AND the `observe_prod` grep source.

**Files:**
- Create `tests/e2e/smoke/website.txt`
- Test (verification): grep-assert it contains no auth specs.

- [ ] **Step 1: VERIFICATION (write the file, then assert no auth specs)** — create the file:

```text
# tests/e2e/smoke/website.txt
# Canary smoke patterns for the LIVE prod site (web.<brand>.de).
# UNAUTH ONLY — the live canary runs behind no session; never list *-auth-setup
# or any spec that requires Keycloak login here. (Spec §247: live-prod-smoke hinter SSO.)
# One Playwright --grep token per line; '#'/blank ignored; joined with | into one regex.
fa-07-public-homepage
fa-fragebogen-public
nfa-website-health
```

- [ ] **Step 2: Run the assertion, expect PASS** — exact command + expected output:

```bash
cd /tmp/wt-sf-phase3 && \
  ! grep -qE 'auth-setup|login|admin|session' tests/e2e/smoke/website.txt \
  && echo "OK: no auth specs in canary grep"
```

Expected stdout:

```
OK: no auth specs in canary grep
```

- [ ] **Step 3: Implement** — (file already written in Step 1; no further code).
- [ ] **Step 4: Re-run assertion, expect PASS** — same command as Step 2, same output `OK: no auth specs in canary grep`.
- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-sf-phase3 && \
git add tests/e2e/smoke/website.txt && \
git commit -m "feat(factory): unauth-only canary smoke patterns for live prod [T000413]"
```

---

### Task D.2: observe_prod() live-prod canary helper in feature-promote.sh

Net-new helper. `roll()` (`:197-221`) gates **dev entry to prod** via `rollout status` +
`rollout undo` (last-revision). `observe_prod()` runs **after** the prod set-image: it
captures the *pre-deploy* revision up front, re-probes the LIVE site for ~5 min, and on
red rolls back to **that captured revision** (not blindly the last one). Context comes
**strictly** from `env-resolve.sh` (`ENV_CONTEXT=fleet`) — the dead `prod_ctx()` bare-name
contexts at `:141` are NEVER used here (spec §50).

**Files:**
- Modify `scripts/feature-promote.sh` (insert new func after `roll()`, i.e. after `:221`)

- [ ] **Step 1: VERIFICATION test (bats grep-contract) — write the failing assertion first**

Create `tests/local/FA-SF-38-canary.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-38 — Layer-4 canary/rollback contract (observe_prod in feature-promote.sh)
SCRIPT="$BATS_TEST_DIRNAME/../../scripts/feature-promote.sh"

@test "FA-SF-38: feature-promote.sh is syntactically valid bash" {
  run bash -n "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod() exists" {
  run grep -qE '^observe_prod\(\)' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod targets the LIVE site, not dev" {
  run grep -E 'web\.\$\{?brand|web\.\$\{cluster|web\.mentolder\.de|web\.korczewski\.de' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod captures pre-deploy revision before rollback" {
  run grep -qE 'rollout history|--to-revision' "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod context comes from env-resolve, never dead prod_ctx" {
  run grep -qE 'env-resolve\.sh|ENV_CONTEXT' "$SCRIPT"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — exact command + expected failure:

```bash
cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-38
```

Expected: `observe_prod() exists` FAILS (the func does not exist yet), e.g.
`not ok 2 FA-SF-38: observe_prod() exists`.

- [ ] **Step 3: Implement** — insert this function in `scripts/feature-promote.sh` immediately after the closing `}` of `roll()` (after line 221, before `# ── Playwright smoke ──`):

```bash
# ── Layer-4 live-prod canary + capture-revision rollback (Phase 1D) ───────────
# observe_prod <cluster> <full_image>
# Precondition: the prod set-image for <cluster> already ran (via roll prod …).
# Captures the pre-deploy revision FIRST, re-probes the LIVE web.<brand>.de site
# (unauth grep from tests/e2e/smoke/website.txt) for ~5 min, and on red rolls the
# deployment back to the captured revision. Context is resolved STRICTLY via
# env-resolve.sh (ENV_CONTEXT=fleet); the dead prod_ctx() bare names are never used.
observe_prod() {
  local cluster="$1" full="$2"
  local deploy ns ctx prev_rev live grep_pat
  deploy=$(svc_deployment "$SERVICE")

  # Context strictly via env-resolve.sh → ENV_CONTEXT=fleet (NEVER prod_ctx()).
  # shellcheck disable=SC1091
  source "$REPO/scripts/env-resolve.sh" "$cluster" >/dev/null
  ctx="$ENV_CONTEXT"
  ns=$(prod_ns "$SERVICE" "$cluster")

  case "$cluster" in
    mentolder)  live="https://web.mentolder.de" ;;
    korczewski) live="https://web.korczewski.de" ;;
  esac

  # Pre-deploy revision = current minus one (the set-image already bumped it).
  prev_rev=$(run kubectl --context "$ctx" -n "$ns" rollout history "deploy/${deploy}" \
              2>/dev/null | awk 'NF && $1 ~ /^[0-9]+$/ {r=$1} END{print r-1}')
  [[ -z "$prev_rev" || "$prev_rev" -lt 1 ]] && prev_rev=""

  echo "▸ Canary observe prod/${cluster}: re-probe ${live} for ~5 min (rev to keep=${full}, fallback rev=${prev_rev:-<none>})"

  grep_pat=$(resolve_smoke_grep "$SERVICE")
  local ok=1 i
  for i in 1 2 3 4 5; do
    # readiness gate first: /api/health must answer 200 on the live site.
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "  [dry-run] canary probe $i/5: curl -fsS ${live}/api/health && playwright --grep '${grep_pat}'"
    else
      if curl -fsS -o /dev/null --max-time 20 "${live}/api/health"; then
        if [[ -z "$grep_pat" ]] || smoke_one "$cluster" "$grep_pat"; then ok=0; break; fi
      fi
      [[ "$i" -lt 5 ]] && sleep 60
    fi
  done
  [[ "$DRY_RUN" == "1" ]] && return 0

  if (( ok == 0 )); then
    echo "✓ Canary GREEN on prod/${cluster}."
    return 0
  fi

  echo "✗ Canary RED on prod/${cluster} — rolling back ${deploy} to revision ${prev_rev:-previous}…" >&2
  if [[ -n "$prev_rev" ]]; then
    run kubectl --context "$ctx" -n "$ns" rollout undo "deploy/${deploy}" --to-revision="$prev_rev" || true
  else
    run kubectl --context "$ctx" -n "$ns" rollout undo "deploy/${deploy}" || true
  fi
  run kubectl --context "$ctx" -n "$ns" rollout status "deploy/${deploy}" --timeout=120s || true
  echo "↩ Canary rolled prod/${cluster} back (rev=${prev_rev:-previous})." >&2
  return 1
}
```

- [ ] **Step 4: Run it, expect PASS**

```bash
cd /tmp/wt-sf-phase3 && bash -n scripts/feature-promote.sh && ./tests/runner.sh local FA-SF-38
```

Expected: `bash -n` produces no output (exit 0); all 5 FA-SF-38 bats lines `ok`.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-sf-phase3 && \
git add scripts/feature-promote.sh tests/local/FA-SF-38-canary.bats && \
git commit -m "feat(factory): observe_prod live-prod canary with capture-revision rollback [T000413]"
```

---

### Task D.3: Register FA-SF-38 in the test inventory

CI re-runs `task test:inventory` and fails if `website/src/data/test-inventory.json`
drifts. Add the new bats so CI stays green.

**Files:**
- Modify `website/src/data/test-inventory.json`

- [ ] **Step 1: VERIFICATION — regenerate, then assert it is staged & non-empty for FA-SF-38**

```bash
cd /tmp/wt-sf-phase3 && task test:inventory && \
  grep -q 'FA-SF-38' website/src/data/test-inventory.json && echo "OK: FA-SF-38 registered"
```

Expected stdout ends with:

```
OK: FA-SF-38 registered
```

- [ ] **Step 2: Run the diff check (mirrors CI), expect clean** — exact command + output:

```bash
cd /tmp/wt-sf-phase3 && task test:inventory && git diff --exit-code -- website/src/data/test-inventory.json; echo "exit=$?"
```

Expected: `exit=0` (regenerated == committed after staging).

- [ ] **Step 3: Implement** — (regeneration in Step 1 is the implementation; no manual edit).
- [ ] **Step 4: Re-run, expect PASS** — re-run Step 1 command; expect `OK: FA-SF-38 registered`.
- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-sf-phase3 && \
git add website/src/data/test-inventory.json && \
git commit -m "chore(factory): register FA-SF-38 in test inventory [T000413]"
```

---

### Task D.4: Replace pipeline.js CI-red prose with a structured ≤2 retry loop

Replaces the LLM prose at `pipeline.js:319-320` ("Wait for CI to go green. If CI is red
after 2 fix attempts, set the ticket to blocked and STOP.") with a **structured**
sub-pipeline: read `retry_count` via `ticket.sh`, capture the CI log, two-gate the failure
(`classify_failure` ∈ {ci,test,lint} **AND** `paths_are_escalate_class` false), auto-fix +
`retry-count incr` only then; at `retry_count>=2` → blocked + `PushNotification`. The
Verify HIGH/CRITICAL immediate-block (`:277-289`) stays a **separate** gate and is NOT
touched. Because this is a Workflow script, the loop is expressed as agent steps with
explicit commands (pipeline.js fährt nie rohes SQL — spec §52).

**Files:**
- Modify `scripts/factory/pipeline.js` (replace the step-3 block at `:319-320`, inside the `deploy` agent prompt)

- [ ] **Step 1: VERIFICATION test (grep-contract bats) — write it first**

Create `tests/local/FA-SF-37-retry.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-37-retry — structured ≤2 self-healing retry loop in pipeline.js
PJS="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline.js"

@test "FA-SF-37-retry: pipeline.js lints clean (node --check)" {
  run node --check "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: old LLM prose is gone" {
  run grep -F 'after 2 fix attempts' "$PJS"
  [ "$status" -ne 0 ]
}

@test "FA-SF-37-retry: reads retry_count via ticket.sh (no raw SQL)" {
  run grep -qE 'ticket\.sh retry-count get' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: two-gated classification (failure-class AND path-class)" {
  run grep -qE 'classify-failure\.sh' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'paths_are_escalate_class|classify-paths\.sh' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: auto-fix gated to ci/test/lint only" {
  run grep -qE 'ci.*test.*lint|\{ci,test,lint\}|ci/test/lint' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: at retry_count>=2 → blocked + PushNotification" {
  run grep -qE 'retry_count.*2|retry-count.*incr' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'PushNotification' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-37-retry: Verify HIGH/CRITICAL immediate-block stays separate" {
  run grep -qE "reason: 'review-findings'" "$PJS"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect FAIL**

```bash
cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-37-retry
```

Expected: `old LLM prose is gone` and `reads retry_count via ticket.sh` FAIL, e.g.
`not ok 3 FA-SF-37-retry: reads retry_count via ticket.sh (no raw SQL)`.

- [ ] **Step 3: Implement** — in `scripts/factory/pipeline.js`, the `deploy` agent prompt currently has step 3 as two prose lines (`:319-320`):

```
   3. Wait for CI to go green. If CI is red after 2 fix attempts, set the ticket
      to blocked and STOP.
```

Replace **those two lines** with the structured block below (keep steps 1, 2, 4-7 intact):

```
   3. STRUCTURED SELF-HEALING RETRY LOOP (≤2 fix attempts; NO raw SQL — use ticket.sh).
      Run CI to green using this exact loop. Per attempt:

      a) Read the current retry count (fail-closed → treat unreadable as 2):
           RC=$(bash ${REPO}/scripts/ticket.sh retry-count get --id ${A.ticket_id})
         If CI is GREEN → go to step 4 (merge).
         If RC -ge 2 → STOP: this is the 3rd failure. Set blocked, notify, return.

      b) Capture the failing CI log to a file:
           gh run view --log-failed > /tmp/factory-ci-${A.ticket_id}.log 2>&1 || \
             gh run view --log > /tmp/factory-ci-${A.ticket_id}.log 2>&1

      c) TWO-GATED auto-fix decision. Auto-fix ONLY when BOTH gates pass:
         Gate 1 (failure class): source ${REPO}/scripts/factory/classify-failure.sh;
           CLASS=$(classify_failure /tmp/factory-ci-${A.ticket_id}.log)
           — must be one of: ci, test, lint.  (sql|manifest|secret|realm|other ⇒ NO auto-fix.)
         Gate 2 (path class): source ${REPO}/scripts/factory/classify-paths.sh;
           if paths_are_escalate_class "${scout.touched_files.join(',')}"  (exit 0 = escalate)
           ⇒ NO auto-fix (shared-state / secret / realm*.json / *.sql touched).
         If EITHER gate fails ⇒ do NOT auto-fix: set blocked, notify, return (escalate to human).

      d) If both gates pass: make the smallest fix that addresses CLASS=${CLASS} on
         branch ${WORK_BRANCH}, commit + push, then record the attempt:
           bash ${REPO}/scripts/ticket.sh retry-count incr --id ${A.ticket_id}
           bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} \
             --body "$(printf 'Factory retry %s/2 (class=%s)\n--- diff ---\n%s\n--- ci log tail ---\n%s' \
               "$RC" "$CLASS" "$(git diff HEAD~1 --shortstat)" "$(tail -30 /tmp/factory-ci-${A.ticket_id}.log)")"
         Then re-run CI and repeat from (a).

      If the loop exits because RC -ge 2 OR a gate failed, perform the BLOCK:
           bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
           bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} \
             --body "Factory blocked: CI red after ${A.ticket_id} retries (class gate or cap)."
         and report that the ticket is blocked. Take NO merge action.
```

Then, **after** the `deploy` agent call returns (after `:337`, before the final `return`),
add the blocked-detection + PushNotification (Workflow runtime only — never from .sh):

```javascript
// Self-healing retry loop may have ended in 'blocked' (CI red after ≤2 gated attempts).
if (typeof deploy === 'string' && /blocked/i.test(deploy)) {
  await PushNotification({
    title: `Factory: ${A.ticket_id} CI-blocked`,
    body: `Self-healing retry exhausted/escalated for "${A.title}" (${brand}). Human attention needed.`,
  })
  return { status: 'blocked', reason: 'ci-red-after-retries', ticket: A.ticket_id }
}
```

And load the tool at the **top of `main()`** (after the `const A = args ?? {}` line, `:50`):

```javascript
// PushNotification is a deferred Workflow tool — load its schema before any call.
await ToolSearch({ query: 'select:PushNotification', max_results: 1 })
```

- [ ] **Step 4: Run it, expect PASS**

```bash
cd /tmp/wt-sf-phase3 && node --check scripts/factory/pipeline.js && ./tests/runner.sh local FA-SF-37-retry
```

Expected: `node --check` prints nothing (exit 0); all FA-SF-37-retry bats lines `ok`.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-sf-phase3 && \
git add scripts/factory/pipeline.js tests/local/FA-SF-37-retry.bats && \
git commit -m "feat(factory): structured two-gated <=2 retry loop replaces CI-red prose [T000413]"
```

---

### Task D.5: Wire the canary into pipeline.js Deploy (per-brand observe + feature-flag OFF)

After the Deploy rollout (`pipeline.js:327-333`), run the live-prod canary per brand.
On red: the pre-deploy revision is captured + `rollout undo`-to-it by `observe_prod()`,
then this layer turns the feature flag OFF (`ticket.sh feature-flag set … --enabled false`),
marks the ticket blocked, and fires `PushNotification`. Verify HIGH/CRITICAL (`:277-289`)
remains untouched.

**Files:**
- Modify `scripts/factory/pipeline.js` (extend the `deploy` agent prompt after step 7 `:333`, and add post-deploy canary handling)

- [ ] **Step 1: VERIFICATION test (grep-contract bats) — write it first**

Create `tests/local/FA-SF-39-canary-wire.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-39-canary-wire — Deploy-phase canary wiring in pipeline.js
PJS="$BATS_TEST_DIRNAME/../../scripts/factory/pipeline.js"

@test "FA-SF-39-wire: pipeline.js lints clean" {
  run node --check "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: Deploy invokes observe_prod per brand" {
  run grep -qE 'observe_prod' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: canary-red turns feature flag OFF via ticket.sh" {
  run grep -qE 'feature-flag set .*--enabled false' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: canary-red fires PushNotification" {
  run grep -qE 'canary|Canary' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'PushNotification' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: both brands observed (mentolder + korczewski)" {
  run grep -qE 'mentolder' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'korczewski' "$PJS"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect FAIL**

```bash
cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-39-canary-wire
```

Expected: `Deploy invokes observe_prod per brand` and `canary-red turns feature flag OFF`
FAIL, e.g. `not ok 2 FA-SF-39-wire: Deploy invokes observe_prod per brand`.

- [ ] **Step 3: Implement** — append a step 8 to the `deploy` agent prompt, inserting it **after** the step-7 rollout-status lines (`:331-333`), i.e. just before the prompt's closing `Report the merged PR number…` sentence at `:335`:

```
   8. LAYER-4 LIVE-PROD CANARY (per brand). For EACH brand in mentolder korczewski:
      observe the LIVE site for ~5 min using the canary helper:
        SERVICE=website TARGET=<brand> source ${REPO}/scripts/feature-promote.sh  # exposes observe_prod
        observe_prod <brand> "$(svc_image_repo website <brand>):${A.timestamp}"
      observe_prod re-probes web.<brand>.de /api/health + the unauth grep from
      tests/e2e/smoke/website.txt, and on RED captures the pre-deploy revision and
      rolls that brand back to it (exit 1). Record the per-brand verdict (GREEN/RED).
      If ANY brand returns RED, output a line containing exactly: CANARY_RED <brand>
```

Then, **after** the `deploy` agent call returns (place this AFTER the CI-block check added in D.4, before the final `return`):

```javascript
// Layer-4 canary: observe_prod (in feature-promote.sh) already captured the pre-deploy
// revision and rolled the failing brand back. Here we turn the feature flag OFF for that
// brand, mark blocked, and notify. PushNotification only from Workflow runtime.
const canaryRed = typeof deploy === 'string' ? [...deploy.matchAll(/CANARY_RED\s+(mentolder|korczewski)/g)].map(m => m[1]) : []
if (canaryRed.length) {
  for (const b of canaryRed) {
    await agent(
      `Canary went RED on ${b} (observe_prod already rolled the deployment back to the
       pre-deploy revision). Dark-launch the feature OFF for this brand and record it:
       bash ${REPO}/scripts/ticket.sh feature-flag set --brand ${b} --key ${slug} --enabled false --set-by factory-canary
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify(`Factory canary RED on ${b}: rolled back + feature flag '${slug}' disabled.`)}
       Report the command outputs.`,
      { label: `canary:rollback:${b}`, phase: 'Deploy' },
    )
  }
  await PushNotification({
    title: `Factory: ${A.ticket_id} canary RED`,
    body: `Live-prod canary failed on ${canaryRed.join(', ')} for "${A.title}". Rolled back + flag OFF.`,
  })
  return { status: 'blocked', reason: 'canary-red', brands: canaryRed, ticket: A.ticket_id }
}
```

- [ ] **Step 4: Run it, expect PASS**

```bash
cd /tmp/wt-sf-phase3 && node --check scripts/factory/pipeline.js && ./tests/runner.sh local FA-SF-39-canary-wire
```

Expected: `node --check` prints nothing (exit 0); all FA-SF-39-canary-wire bats lines `ok`.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-sf-phase3 && \
git add scripts/factory/pipeline.js tests/local/FA-SF-39-canary-wire.bats && \
git commit -m "feat(factory): wire Layer-4 canary into pipeline Deploy with feature-flag-OFF rollback [T000413]"
```

---

### Task D.6: Register FA-SF-37-retry + FA-SF-39-canary-wire in test inventory

Same CI gate as D.3 — register the two new bats files so `task test:inventory` stays
clean.

**Files:**
- Modify `website/src/data/test-inventory.json`

- [ ] **Step 1: VERIFICATION — regenerate, then assert both IDs present**

```bash
cd /tmp/wt-sf-phase3 && task test:inventory && \
  grep -q 'FA-SF-37-retry' website/src/data/test-inventory.json && \
  grep -q 'FA-SF-39-canary-wire' website/src/data/test-inventory.json && \
  echo "OK: retry + canary-wire registered"
```

Expected stdout ends with:

```
OK: retry + canary-wire registered
```

- [ ] **Step 2: Run the CI-mirroring diff check, expect clean**

```bash
cd /tmp/wt-sf-phase3 && task test:inventory && git diff --exit-code -- website/src/data/test-inventory.json; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 3: Implement** — (regeneration in Step 1 is the implementation; no manual edit).
- [ ] **Step 4: Re-run, expect PASS** — re-run Step 1; expect `OK: retry + canary-wire registered`.
- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-sf-phase3 && \
git add website/src/data/test-inventory.json && \
git commit -m "chore(factory): register FA-SF-38 retry + canary-wire bats in test inventory [T000413]"
```


## Phase 1E — Adaptive Agent-Provisioning (model · effort · context)

> Segment prefix: **E**. Implements the spec section "Adaptive Agent-Provisioning (Modell · Effort · Kontext)"
> (`docs/superpowers/specs/2026-06-05-software-factory-phase3-design.md:166-183`).
>
> Builds NEW `scripts/factory/provision.js` as a **pure ESM module** (no harness globals, no I/O — `node --test`-able),
> its `node --test` suite, the BATS wrapper, registers the BATS in the test inventory, then wires
> `pipeline.js` Plan / Implement / Verify to call `provision()` and pass `{model}` into `agent(prompt, {…, model})`.
>
> **Contract symbols this segment DEFINES (other segments may consume by exact name):**
> `scripts/factory/provision.js`, `chooseModel(complexity, role)`, `chooseEffort(complexity, risk, budgetRemaining)`,
> `provision(task)` → `{ model, effort, contextHints }`, `scripts/factory/provision.test.mjs`,
> `tests/local/FA-SF-40-provision.bats`.
>
> **Contract facts this segment RELIES ON (verified against the worktree, not assumed):**
> - `agent(prompt, opts)` takes an options object as its 2nd arg (`pipeline.js:120,243,267`), so `model` rides in
>   `opts` — `agent(prompt, { label, phase, …, model })`.
> - Scout already returns `complexity ∈ {simple,medium,complex}` and `risk_areas` via `SCOUT_SCHEMA` (`pipeline.js:72-82`);
>   the Scout object is in scope as `scout` for the whole `if (!REUSE)` block.
> - `pipeline.js` runs as one `async function main()` with an ESM `export const meta` at top; a top-level
>   `import` is legal in that module. The harness lints it with `node --check` only.
> - Node is v22.x in this repo → `node --test` + `node:test`/`node:assert` are available with zero deps.
> - There is no `await` between the `import` line and first use, so a static top-level `import` is safe.

Rubric mirrored (from spec §6 / Adaptive Agent-Provisioning), three axes:
- **Model:** `simple→haiku`, `medium→sonnet`, `complex→opus`; roles `review`/`security` are **always `opus`** (correctness-critical);
  when unsure → `null` (omit/inherit the main-loop default — never guess a tier).
- **Effort:** `quick` / `standard` / `ultra`, picked from `complexity`×`risk`, then **down-scaled when `budgetRemaining` is low**.
- **Context:** `contextHints` is a list of **compact** context labels to assemble — NEVER a raw dump; pgvector similar-tickets
  hint is included **only when GPU embeddings are available** and degrades cleanly when not.

---

### Task E.1: Pure model-selection function `chooseModel`

**Files:**
- Create `scripts/factory/provision.js`
- Create `scripts/factory/provision.test.mjs`

- [ ] **Step 1: Write the failing test** — create `scripts/factory/provision.test.mjs`:

```js
// scripts/factory/provision.test.mjs
// Pure-function tests for the adaptive provisioning module. Zero deps, zero I/O.
// Run: node --test scripts/factory/provision.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseModel } from './provision.js'

test('chooseModel: complexity → tier for implementer roles', () => {
  assert.equal(chooseModel('simple', 'implement'), 'haiku')
  assert.equal(chooseModel('medium', 'implement'), 'sonnet')
  assert.equal(chooseModel('complex', 'implement'), 'opus')
})

test('chooseModel: review/security roles are always opus regardless of complexity', () => {
  assert.equal(chooseModel('simple', 'review'), 'opus')
  assert.equal(chooseModel('simple', 'security'), 'opus')
  assert.equal(chooseModel('medium', 'security'), 'opus')
  assert.equal(chooseModel('complex', 'review'), 'opus')
})

test('chooseModel: scout/plan follow complexity like implement', () => {
  assert.equal(chooseModel('simple', 'scout'), 'haiku')
  assert.equal(chooseModel('complex', 'plan'), 'opus')
})

test('chooseModel: unknown complexity → null (omit/inherit, never guess)', () => {
  assert.equal(chooseModel(undefined, 'implement'), null)
  assert.equal(chooseModel('bogus', 'implement'), null)
})
```

- [ ] **Step 2: Run it, expect FAIL** — `provision.js` does not exist yet:
```
cd /tmp/wt-sf-phase3 && node --test scripts/factory/provision.test.mjs
```
Expected: a load error — `Cannot find module '.../scripts/factory/provision.js'` (ERR_MODULE_NOT_FOUND), test run exits non-zero (`# fail`).

- [ ] **Step 3: Implement** — create `scripts/factory/provision.js` with the model axis:

```js
// scripts/factory/provision.js
//
// Software Factory Phase-3 — Adaptive Agent-Provisioning (pure ESM helper).
//
// PURE module: no harness globals, no I/O, deterministic. Imported by the Workflow
// script scripts/factory/pipeline.js to pick {model, effort, contextHints} per spawned agent.
//
// Offline lint:  node --check scripts/factory/provision.js
// Unit tests:    node --test scripts/factory/provision.test.mjs
// Spec:          docs/superpowers/specs/2026-06-05-software-factory-phase3-design.md:166-183
//
// Axes:
//   model   — (complexity × role) → tier. simple→haiku, medium→sonnet, complex→opus.
//             review/security roles are ALWAYS opus (correctness-critical). Unsure → null
//             (omit/inherit the main-loop default; never guess a tier).
//   effort  — quick|standard|ultra from complexity×risk, down-scaled when budget is low.
//   context — contextHints: a COMPACT list of context labels to assemble; NEVER a raw dump.

/** Roles that must always run on the strongest tier (correctness-critical). */
const ALWAYS_OPUS_ROLES = new Set(['review', 'security'])

/** complexity → model tier for ordinary (non review/security) roles. */
const COMPLEXITY_TIER = {
  simple: 'haiku',
  medium: 'sonnet',
  complex: 'opus',
}

/**
 * Pick the ideal model tier for an agent.
 * @param {'simple'|'medium'|'complex'} complexity  Scout-assigned task complexity.
 * @param {'scout'|'plan'|'implement'|'review'|'security'} role  The subagent's role.
 * @returns {'haiku'|'sonnet'|'opus'|null}  null = omit/inherit (do not set a model).
 */
export function chooseModel(complexity, role) {
  if (ALWAYS_OPUS_ROLES.has(role)) return 'opus'
  const tier = COMPLEXITY_TIER[complexity]
  return tier ?? null
}
```

- [ ] **Step 4: Run it, expect PASS**:
```
cd /tmp/wt-sf-phase3 && node --test scripts/factory/provision.test.mjs
```
Expected: `# pass 4`, `# fail 0`, exit 0. (Also `node --check scripts/factory/provision.js` → no output, exit 0.)

- [ ] **Step 5: Commit**:
```
git add scripts/factory/provision.js scripts/factory/provision.test.mjs
git commit -m "feat(factory): chooseModel — pure complexity×role→tier provisioning [T000413]"
```

---

### Task E.2: Effort-profile function `chooseEffort` with budget scaling

**Files:**
- Modify `scripts/factory/provision.js`
- Modify `scripts/factory/provision.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `scripts/factory/provision.test.mjs`:

```js
// ── chooseEffort ──────────────────────────────────────────────────────────
import { chooseEffort } from './provision.js'

test('chooseEffort: base profile from complexity×risk (ample budget)', () => {
  // budgetRemaining = 1.0 (fraction of token budget left) → no down-scaling
  assert.equal(chooseEffort('simple', 'low', 1.0), 'quick')
  assert.equal(chooseEffort('medium', 'low', 1.0), 'standard')
  assert.equal(chooseEffort('complex', 'low', 1.0), 'ultra')
})

test('chooseEffort: high risk bumps the profile up one step (capped at ultra)', () => {
  assert.equal(chooseEffort('simple', 'high', 1.0), 'standard')
  assert.equal(chooseEffort('medium', 'high', 1.0), 'ultra')
  assert.equal(chooseEffort('complex', 'high', 1.0), 'ultra') // already top, stays ultra
})

test('chooseEffort: low remaining budget down-scales the profile (cost cap respect)', () => {
  // < 0.25 budget left → drop one step
  assert.equal(chooseEffort('complex', 'low', 0.2), 'standard')
  assert.equal(chooseEffort('medium', 'low', 0.2), 'quick')
  // quick is the floor — cannot go below
  assert.equal(chooseEffort('simple', 'low', 0.05), 'quick')
})

test('chooseEffort: down-scale and risk-bump compose (net zero on complex+high+low budget)', () => {
  // complex→ultra, +high→ultra(capped), low budget −1 → standard
  assert.equal(chooseEffort('complex', 'high', 0.2), 'standard')
})

test('chooseEffort: unknown complexity defaults to standard, still budget-clamped', () => {
  assert.equal(chooseEffort('bogus', 'low', 1.0), 'standard')
  assert.equal(chooseEffort('bogus', 'low', 0.1), 'quick')
})
```

- [ ] **Step 2: Run it, expect FAIL**:
```
cd /tmp/wt-sf-phase3 && node --test scripts/factory/provision.test.mjs
```
Expected: import succeeds but the new tests fail — `TypeError: chooseEffort is not a function` (the named export is missing); summary shows `# fail` > 0, exit non-zero.

- [ ] **Step 3: Implement** — add the effort axis to `scripts/factory/provision.js` (after `chooseModel`):

```js
// ── Effort axis ────────────────────────────────────────────────────────────

/** Ordered effort profiles, weakest → strongest. Indices are the scaling ladder. */
const EFFORT_LADDER = ['quick', 'standard', 'ultra']

/** complexity → base effort index into EFFORT_LADDER. */
const COMPLEXITY_EFFORT_INDEX = {
  simple: 0,  // quick:    1 implementer + 1-vote verify
  medium: 1,  // standard: 2–3 parallel implementers + 1 review pass
  complex: 2, // ultra:    fan-out implementers + 3-vote adversarial verify panel + completeness critic
}

/** Clamp an index into the EFFORT_LADDER bounds. */
function clampEffortIdx(i) {
  return Math.max(0, Math.min(EFFORT_LADDER.length - 1, i))
}

/**
 * Pick the orchestration-depth profile for the run, scaled by remaining budget.
 * @param {'simple'|'medium'|'complex'} complexity  Scout-assigned complexity.
 * @param {'low'|'medium'|'high'|string} risk  Risk signal (high bumps depth up one step).
 * @param {number} budgetRemaining  Fraction (0..1) of the per-feature token budget left.
 *                                  < 0.25 down-scales depth one step (respects the cost/daily-deploy cap).
 * @returns {'quick'|'standard'|'ultra'}
 */
export function chooseEffort(complexity, risk, budgetRemaining) {
  let idx = COMPLEXITY_EFFORT_INDEX[complexity]
  if (idx === undefined) idx = 1 // unknown complexity → standard baseline
  if (risk === 'high') idx += 1
  const remaining = typeof budgetRemaining === 'number' ? budgetRemaining : 1
  if (remaining < 0.25) idx -= 1
  return EFFORT_LADDER[clampEffortIdx(idx)]
}
```

- [ ] **Step 4: Run it, expect PASS**:
```
cd /tmp/wt-sf-phase3 && node --test scripts/factory/provision.test.mjs
```
Expected: `# pass 9`, `# fail 0`, exit 0. (`node --check scripts/factory/provision.js` → exit 0.)

- [ ] **Step 5: Commit**:
```
git add scripts/factory/provision.js scripts/factory/provision.test.mjs
git commit -m "feat(factory): chooseEffort — budget-scaled effort profiles [T000413]"
```

---

### Task E.3: `provision(task)` aggregator + compact `contextHints` (with GPU-degrade)

**Files:**
- Modify `scripts/factory/provision.js`
- Modify `scripts/factory/provision.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `scripts/factory/provision.test.mjs`:

```js
// ── provision (aggregate) ──────────────────────────────────────────────────
import { provision } from './provision.js'

test('provision: aggregates model + effort + compact contextHints', () => {
  const out = provision({
    complexity: 'medium', role: 'implement', risk: 'low',
    budgetRemaining: 1.0, ticketId: 'T000420', touchedFiles: ['website/src/lib/x.ts'],
    gpuEmbeddings: false,
  })
  assert.equal(out.model, 'sonnet')
  assert.equal(out.effort, 'standard')
  assert.ok(Array.isArray(out.contextHints), 'contextHints is an array')
  // Compact LABELS, not raw dumps — every hint is a short string, none is JSON-ish.
  for (const h of out.contextHints) {
    assert.equal(typeof h, 'string')
    assert.ok(h.length < 120, `hint too long (raw dump risk): ${h}`)
    assert.ok(!h.trim().startsWith('{') && !h.trim().startsWith('['), `hint looks like a raw dump: ${h}`)
  }
  // Always carries the Vorhaben pack + the touched files + ticket spec.
  assert.ok(out.contextHints.some((h) => h.includes('T000413')), 'includes Vorhaben pack')
  assert.ok(out.contextHints.some((h) => h.includes('touched_files')), 'includes touched files')
})

test('provision: pgvector similar-tickets hint ONLY when GPU embeddings available', () => {
  const withGpu = provision({ complexity: 'complex', role: 'plan', risk: 'high', budgetRemaining: 1, ticketId: 'T1', touchedFiles: [], gpuEmbeddings: true })
  const noGpu   = provision({ complexity: 'complex', role: 'plan', risk: 'high', budgetRemaining: 1, ticketId: 'T1', touchedFiles: [], gpuEmbeddings: false })
  assert.ok(withGpu.contextHints.some((h) => h.includes('similar-tickets')), 'GPU on → similar-tickets hint')
  assert.ok(!noGpu.contextHints.some((h) => h.includes('similar-tickets')), 'GPU off → degrades, no similar-tickets hint')
})

test('provision: review role forces opus even on a simple task', () => {
  const out = provision({ complexity: 'simple', role: 'review', risk: 'low', budgetRemaining: 1, ticketId: 'T1', touchedFiles: [], gpuEmbeddings: false })
  assert.equal(out.model, 'opus')
})

test('provision: tolerates a sparse task object (defaults, no throw)', () => {
  const out = provision({ role: 'implement' })
  assert.equal(out.model, null)        // unknown complexity → omit/inherit
  assert.equal(out.effort, 'standard') // unknown complexity → standard, budget defaults to 1
  assert.ok(Array.isArray(out.contextHints))
})
```

- [ ] **Step 2: Run it, expect FAIL**:
```
cd /tmp/wt-sf-phase3 && node --test scripts/factory/provision.test.mjs
```
Expected: `TypeError: provision is not a function`; summary `# fail` > 0, exit non-zero.

- [ ] **Step 3: Implement** — add `buildContextHints` + `provision` to `scripts/factory/provision.js`:

```js
// ── Context axis (compact hints, never raw dumps) ──────────────────────────

/**
 * Assemble a COMPACT list of context labels for the agent prompt. These are short
 * pointers ("assemble X"), NOT inlined payloads — the Workflow caller resolves each
 * hint to a verbatim, trimmed excerpt. Hard rule (P3 design-panel lesson): a 162k-char
 * raw-JSON prompt broke the synth agent — keep hints terse.
 * @param {object} task
 * @returns {string[]}
 */
function buildContextHints(task) {
  const t = task ?? {}
  const hints = [
    'Vorhaben pack T000413: vision + repo conventions + footguns (compact)',
    'ticket spec + attachments via `ticket.sh get-attachments`',
    `touched_files: ${(t.touchedFiles ?? []).length} path(s)`,
    'relevant target-code excerpts only (no whole files)',
  ]
  // pgvector similar-tickets retrieval requires the GPU embedding host — degrade cleanly.
  if (t.gpuEmbeddings === true) {
    hints.push('similar-tickets (pgvector top-k, GPU embeddings)')
  }
  return hints
}

/**
 * Provision one subagent: ideal model + effort profile + compact context hints.
 * @param {object} task
 * @param {'simple'|'medium'|'complex'} [task.complexity]
 * @param {'scout'|'plan'|'implement'|'review'|'security'} task.role
 * @param {'low'|'medium'|'high'} [task.risk]
 * @param {number} [task.budgetRemaining]  Fraction (0..1) of the per-feature token budget left.
 * @param {string} [task.ticketId]
 * @param {string[]} [task.touchedFiles]
 * @param {boolean} [task.gpuEmbeddings]  Whether the GPU embedding host is reachable this tick.
 * @returns {{model: ('haiku'|'sonnet'|'opus'|null), effort: ('quick'|'standard'|'ultra'), contextHints: string[]}}
 */
export function provision(task) {
  const t = task ?? {}
  return {
    model: chooseModel(t.complexity, t.role),
    effort: chooseEffort(t.complexity, t.risk, t.budgetRemaining),
    contextHints: buildContextHints(t),
  }
}
```

- [ ] **Step 4: Run it, expect PASS**:
```
cd /tmp/wt-sf-phase3 && node --test scripts/factory/provision.test.mjs
```
Expected: `# pass 13`, `# fail 0`, exit 0. (`node --check scripts/factory/provision.js` → exit 0.)

- [ ] **Step 5: Commit**:
```
git add scripts/factory/provision.js scripts/factory/provision.test.mjs
git commit -m "feat(factory): provision() aggregator + compact contextHints (GPU-degrade) [T000413]"
```

---

### Task E.4: BATS wrapper `FA-SF-40-provision` + test-inventory registration

**Files:**
- Create `tests/local/FA-SF-40-provision.bats`
- Modify `website/src/data/test-inventory.json`

- [ ] **Step 1: Write the verification (BATS wraps `node --test`)** — create `tests/local/FA-SF-40-provision.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-40: adaptive agent-provisioning (offline, pure function). Wraps the
# node:test suite and asserts the pure-module contract used by pipeline.js.
MOD="scripts/factory/provision.js"
SUITE="scripts/factory/provision.test.mjs"

@test "FA-SF-40: provision.js exists and is syntactically valid ESM" {
  [ -f "$MOD" ]
  run node --check "$MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-40: node --test provision suite passes" {
  run node --test "$SUITE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"# fail 0"* ]]
}

@test "FA-SF-40: exports the three contract functions" {
  for fn in "export function chooseModel" "export function chooseEffort" "export function provision"; do
    run grep -Fq "$fn" "$MOD"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-40: review/security roles are pinned to opus (correctness-critical)" {
  run grep -Eq "ALWAYS_OPUS_ROLES.*=.*new Set" "$MOD"; [ "$status" -eq 0 ]
  run grep -q "'review'" "$MOD"; [ "$status" -eq 0 ]
  run grep -q "'security'" "$MOD"; [ "$status" -eq 0 ]
}

@test "FA-SF-40: context is compact-hint based (no raw-dump), GPU-gated similar-tickets" {
  run grep -q "buildContextHints" "$MOD"; [ "$status" -eq 0 ]
  run grep -q "gpuEmbeddings === true" "$MOD"; [ "$status" -eq 0 ]
  run grep -q "similar-tickets" "$MOD"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect PASS** (the module already exists from E.1–E.3):
```
cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-40
```
Expected: 5 passing tests, e.g. `ok 1 FA-SF-40: provision.js exists …` through `ok 5 …`, runner exits 0.

- [ ] **Step 3: Register in the inventory** — add the entry to `website/src/data/test-inventory.json`. Insert (matching the existing `{id,file,category,kind}` shape, placed next to the other `FA-SF-40` entries):

```json
{ "id": "FA-SF-40", "file": "tests/local/FA-SF-40-provision.bats", "category": "FA", "kind": "shell" }
```

- [ ] **Step 4: Verify the inventory is consistent (CI is diff-gated on this)**:
```
cd /tmp/wt-sf-phase3 && task test:inventory && git diff --exit-code website/src/data/test-inventory.json
```
Expected: `git diff --exit-code` exits 0 (no diff) — i.e. the regenerated inventory already contains the `FA-SF-40` entry you added, so CI's inventory check will pass. If `task test:inventory` rewrites the file, re-run the diff to confirm it now matches.

- [ ] **Step 5: Commit**:
```
git add tests/local/FA-SF-40-provision.bats website/src/data/test-inventory.json
git commit -m "test(factory): FA-SF-40 provisioning BATS + inventory entry [T000413]"
```

---

### Task E.5: Wire `pipeline.js` to import `provision` and apply it in Plan / Implement / Verify

**Files:**
- Modify `scripts/factory/pipeline.js` (add top-level import after the header comment ~`:27`; Plan decompose `:177-211`; Implement `:233-251`; Verify `:261-269`)

This is a Workflow script (harness globals), so a unit test is not meaningful — verification is `node --check` + a BATS grep-assertion in the existing FA-SF-20 contract is left to the pipeline segment; here we add a focused grep check and a syntax check.

- [ ] **Step 1: Add the import** — after the closing `*/` of the header JSDoc (the line before `export const meta`, ~`pipeline.js:28`), insert:

```js
import { provision } from './provision.js'
```

(Top-level static `import` is legal in this ESM module — `export const meta` already makes it a module, and there is no `await` before first use.)

- [ ] **Step 2: Apply `provision()` in the Plan decompose agent** — in `pipeline.js`, replace the `plan:decompose` `agent(...)` options object (currently `{ label: 'plan:decompose', phase: 'Plan', schema: {…} }`, `:189-210`) so the planner runs on the model chosen for the task's complexity. Change the options object to spread in the provisioned model:

```js
    {
      ...provision({ complexity: scout.complexity, role: 'plan', risk: (scout.risk_areas?.length ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: scout.touched_files, gpuEmbeddings: false }).model
        ? { model: provision({ complexity: scout.complexity, role: 'plan', risk: (scout.risk_areas?.length ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: scout.touched_files, gpuEmbeddings: false }).model }
        : {},
      label: 'plan:decompose',
      phase: 'Plan',
      schema: {
```

> Note: keep the existing `schema: { type:'object', required:['tasks'], … }` block exactly as-is below the `schema:` key. Only the two lines above `label:` are added (a conditional `model` spread — omit the key entirely when `provision().model` is `null`, honouring "omit/inherit").

- [ ] **Step 3: Apply `provision()` in the Implement fan-out** — in the `pipeline(tasks, (t) => agent(...))` call (`:235-244`), the implementer agent currently has options `{ label: ` + "`impl:${t.id}`" + `, phase: 'Implement', isolation: 'worktree' }`. Replace that options object with a provisioned one. First compute the provision once per task at the top of the implement map body, then spread its model:

```js
    (t) => {
      const prov = provision({ complexity: scout?.complexity, role: 'implement', risk: (t.target_files?.some((f) => /\.sql$|^k3d\/|^environments\/|realm.*\.json/.test(f)) ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: t.target_files, gpuEmbeddings: false })
      return agent(
        `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
         Implement task ${t.id} on branch ${WORK_BRANCH} in an isolated worktree at ${WORK_WT}.
         Target files: ${t.target_files.join(', ')}.
         Follow TDD (red-green). Acceptance criteria: ${t.acceptance_criteria.join('; ')}.
         Provisioned context hints (assemble compactly, never raw-dump): ${prov.contextHints.join(' | ')}.
         After implementing, run locally:
           cd ${WORK_WT} && task workspace:validate && task test:all
         Return a summary of the diff and the local test result (pass/fail).`,
        { label: `impl:${t.id}`, phase: 'Implement', isolation: 'worktree', ...(prov.model ? { model: prov.model } : {}) },
      )
    },
```

> `scout` is referenced with `?.` because in the REUSE path Scout is skipped (`scout` is undefined) → `chooseModel(undefined,'implement')` returns `null` → no model set, agent inherits the main-loop default. Correct degradation.

- [ ] **Step 4: Apply `provision()` in the Verify review panel (force opus)** — in the `parallel(lenses.map((l) => () => agent(...)))` block (`:261-269`), the review agent options are `{ label: ` + "`review:${l.key}`" + `, phase: 'Verify', schema: REVIEW_SCHEMA }`. Map the lens key to a provisioning role (`security` lens → `'security'`, others → `'review'`) so all review lenses pin to `opus`:

```js
const reviews = (await parallel(
  lenses.map((l) => () => agent(
    `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
     Read the review prompt at ${REPO}/${l.file} and apply it to the diff of
     branch ${WORK_BRANCH} (run: git diff origin/main...HEAD in ${REPO}).
     Return your findings as JSON matching the review schema.`,
    { label: `review:${l.key}`, phase: 'Verify', schema: REVIEW_SCHEMA, model: provision({ role: l.key === 'security' ? 'security' : 'review' }).model },
  )),
)).filter(Boolean)
```

> Both `'review'` and `'security'` roles → `chooseModel` returns `'opus'` unconditionally, so `model` is always set here (never `null`) — correctness-critical lenses are guaranteed the strongest tier.

- [ ] **Step 5a: Verify (syntax + wiring greps)**:
```
cd /tmp/wt-sf-phase3 && node --check scripts/factory/pipeline.js && \
  grep -c "provision(" scripts/factory/pipeline.js && \
  grep -q "import { provision } from './provision.js'" scripts/factory/pipeline.js && echo IMPORT_OK
```
Expected: `node --check` prints nothing (exit 0); the `grep -c` count is `>= 4` (import + Plan + Implement + Verify usages); then `IMPORT_OK`.

- [ ] **Step 5b: Re-run the pipeline structural contract to confirm nothing regressed**:
```
cd /tmp/wt-sf-phase3 && ./tests/runner.sh local FA-SF-20
```
Expected: all FA-SF-20 tests still `ok` (the six `phase('…')` calls and existing wiring are untouched), runner exits 0.

- [ ] **Step 5: Commit**:
```
git add scripts/factory/pipeline.js
git commit -m "feat(factory): wire provision() into pipeline Plan/Implement/Verify (model per agent) [T000413]"
```


## Phase 2 — Persistent Dispatcher: systemd User Timer + headless wakeup + cron-poll trigger

This segment builds the **persistence layer** that drives the Software Factory dispatcher
without an open Claude Code session (spec §3 D-PERSIST, §6 Phase 2). The mechanism is a
WSL-host **systemd user timer** (`OnUnitInactiveSec` re-arms only after the tick exits →
natural single-flight; `Persistent=true` survives reboot/missed ticks; `RuntimeMaxSec` kills
hung runs) that fires `scripts/factory/wakeup.sh`. The wakeup wrapper is **deliberately dumb**
("Inversion of Intelligence", spec §4): it only `cd`s to the repo, takes a `flock`, unlocks
git-crypt if locked, and `exec`s a headless `claude -p` run that nests the dispatcher — carrying
nothing but the `dry_run` policy. **The cron-poll IS the trigger** (`schedule.sh` already polls the
backlog every tick, spec §6 Phase 2 / correction A2); no new LISTEN/NOTIFY consumer is built. An
OPTIONAL inert `pg_notify` trigger is added to `tickets-db.ts` purely as documented future
plumbing, explicitly NOT consumed in P3.

**Contract symbols this segment DEFINES:**
- `scripts/factory/wakeup.sh` (headless dispatcher wrapper)
- `scripts/factory/factory.timer`, `scripts/factory/factory.service` (systemd user units)
- Taskfile targets `factory:autopilot:install`, `factory:autopilot:uninstall`, `factory:autopilot:status`
- inert `tickets.factory_feature_notify` pg_notify trigger (NOT consumed)

**Contract symbols this segment CONSUMES (defined in other segments):**
- `scripts/factory/dispatcher.js` (Workflow script — already exists, Phase 2) and its `args.dry_run` thread.
- `scripts/factory/pipeline.js` (nested by the dispatcher — already exists).
- `FACTORY_GLOBAL_CAP` env var (read by `schedule.sh` inside the dispatcher PREP).
- `guards.sh` (kill-switch / daily-cap, segment that owns guards) — referenced only in the dispatcher prompt text, not invoked from `wakeup.sh`.

> **Dependency note:** Phase F depends on the Phase 0 **headless-workflow-spike** Go decision
> (spec §6 Phase 0). If the spike is No-Go, `factory:autopilot:install` stays unused and the
> fallback is local `/loop` — but the units/scripts in this segment are still committed (inert).

---

### Task F.1: wakeup.sh — git-crypt lock detection helper (failing bats first)

**Files:**
- Create: `scripts/factory/wakeup.sh`
- Test: `tests/local/FA-SF-41-wakeup.bats`
- Modify: `website/src/data/test-inventory.json`

The first slice builds the structural skeleton of `wakeup.sh` and asserts its
load-bearing properties by grep (no live `claude`/systemd in CI). We start with the
git-crypt lock-detection contract: a locked secrets file begins with the `\0GITCRYPT\0`
magic; unlocked it is plaintext. `wakeup.sh` must (a) `cd` to the repo, (b) `flock`
`/tmp/factory-tick.lock`, (c) conditionally `task secrets:unlock`, (d) `exec claude -p`
with the Workflow tool + a permission allowlist + the `dry_run` policy.

- [ ] **Step 1: Write the failing test** — full test code in a fenced block.

```bash
# tests/local/FA-SF-41-wakeup.bats
#!/usr/bin/env bats
# FA-SF-41 — Phase 3 persistent dispatcher: wakeup.sh structural contract (offline grep).
# Verifies the deliberately-dumb headless wrapper carries only the dry_run policy.

WAKEUP="${BATS_TEST_DIRNAME}/../../scripts/factory/wakeup.sh"

@test "FA-SF-41: wakeup.sh exists and is bash -n clean" {
  [ -f "$WAKEUP" ]
  run bash -n "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh cd's to the repo before anything else" {
  run grep -E '^[[:space:]]*cd[[:space:]]+"\$\{?REPO' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh single-flights via flock on /tmp/factory-tick.lock" {
  run grep -E 'flock[^#]*/tmp/factory-tick\.lock' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh detects the git-crypt GITCRYPT magic to decide unlock" {
  run grep -F 'GITCRYPT' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh unlocks via task secrets:unlock (not raw git-crypt)" {
  run grep -E 'task[[:space:]]+secrets:unlock' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh exec's headless claude -p with the Workflow tool allowlisted" {
  run grep -E 'exec[[:space:]]+.*claude[[:space:]]+-p' "$WAKEUP"
  [ "$status" -eq 0 ]
  run grep -E -- '--allowedTools' "$WAKEUP"
  [ "$status" -eq 0 ]
  run grep -F 'Workflow' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh threads the dry_run policy into the dispatcher prompt" {
  run grep -F 'dry_run' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh names dispatcher.js as the nested Workflow script" {
  run grep -F 'scripts/factory/dispatcher.js' "$WAKEUP"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — exact command + expected failure text.

```bash
./tests/runner.sh local FA-SF-41
# Expected: the first test fails because scripts/factory/wakeup.sh does not exist:
#   ✗ FA-SF-41: wakeup.sh exists and is bash -n clean
#     (in test file tests/local/FA-SF-41-wakeup.bats)
#     `[ -f "$WAKEUP" ]' failed
```

- [ ] **Step 3: Implement** — full real code in a fenced block (the actual edit).

```bash
# scripts/factory/wakeup.sh
#!/usr/bin/env bash
# scripts/factory/wakeup.sh — headless Software Factory dispatcher wrapper.
#
# Fired by the systemd USER timer (factory.timer → factory.service). It is
# DELIBERATELY DUMB ("Inversion of Intelligence", spec §4): it carries no
# scheduling judgement — every guard (kill-switch, daily-cap, dry-run-first) is
# read fresh inside dispatcher.js PREP from each brand DB. This wrapper only:
#   1. cd's to the repo (the single locus with checkout + git-crypt + kubeconfig)
#   2. single-flights via flock (belt-and-braces over OnUnitInactiveSec)
#   3. unlocks git-crypt if the working tree is locked
#   4. exec's a headless `claude -p` run that nests dispatcher.js via the Workflow tool
#
# The Cron-poll IS the trigger: dispatcher.js → schedule.sh polls the backlog.
# RuntimeMaxSec (hung-run kill) is handled by systemd, not here.
#
#   Env knobs (all optional, sane defaults):
#     FACTORY_REPO            repo root            (default: /home/patrick/Bachelorprojekt)
#     FACTORY_DRY_RUN         true|false           (default: true — fail-safe: never auto-merge unless opted in)
#     FACTORY_GITCRYPT_KEY    path to bp-secrets.key for `task secrets:unlock`
#     FACTORY_CLAUDE_BIN      claude binary        (default: claude on PATH)
set -euo pipefail

REPO="${FACTORY_REPO:-/home/patrick/Bachelorprojekt}"
DRY_RUN="${FACTORY_DRY_RUN:-true}"
CLAUDE_BIN="${FACTORY_CLAUDE_BIN:-claude}"
LOCKFILE="/tmp/factory-tick.lock"

cd "${REPO}"

# ── single-flight: acquire the tick lock non-blocking; bail if a tick is live ──
exec 9>"${LOCKFILE}"
if ! flock -n 9; then
  echo "wakeup.sh: a factory tick is already running (flock ${LOCKFILE} held) — skipping" >&2
  exit 0
fi

# ── git-crypt: a locked secrets file starts with the \0GITCRYPT\0 magic ───────
# We probe one known-encrypted file; if it is still ciphertext, unlock the tree.
CRYPT_PROBE="environments/.secrets/mentolder.yaml"
if [[ -f "${CRYPT_PROBE}" ]] && head -c 16 "${CRYPT_PROBE}" 2>/dev/null | grep -qa 'GITCRYPT'; then
  if [[ -n "${FACTORY_GITCRYPT_KEY:-}" ]]; then
    echo "wakeup.sh: working tree is git-crypt-locked — running task secrets:unlock" >&2
    task secrets:unlock KEY="${FACTORY_GITCRYPT_KEY}"
  else
    echo "wakeup.sh: tree locked but FACTORY_GITCRYPT_KEY unset — aborting tick (fail-closed)" >&2
    exit 1
  fi
fi

# ── headless dispatcher tick: nest dispatcher.js via the Workflow tool ────────
# The permission allowlist is tight: only the Workflow tool + the deterministic
# factory primitives the dispatcher shells out to. dry_run is the ONLY policy.
PROMPT="Run the Software Factory dispatcher now. Invoke the Workflow tool with \
scriptPath 'scripts/factory/dispatcher.js' and args { timestamp: '$(date -u +%FT%TZ)', dry_run: ${DRY_RUN} }. \
The dispatcher reads all guards (kill-switch, daily-cap, dry-run-first) fresh per brand inside its PREP step. \
Report only the dispatcher's final JSON result. Do not improvise scheduling."

exec "${CLAUDE_BIN}" -p "${PROMPT}" \
  --allowedTools "Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),ToolSearch,PushNotification" \
  --permission-mode acceptEdits
```

```bash
chmod +x scripts/factory/wakeup.sh
```

- [ ] **Step 4: Run it, expect PASS** — exact command + expected output.

```bash
bash -n scripts/factory/wakeup.sh && echo "syntax-ok"
# Expected: syntax-ok
./tests/runner.sh local FA-SF-41
# Expected: all 8 FA-SF-41 tests pass, e.g.:
#   ✓ FA-SF-41: wakeup.sh exists and is bash -n clean
#   ...
#   ✓ FA-SF-41: wakeup.sh names dispatcher.js as the nested Workflow script
#   8 tests, 0 failures
```

Then register the new bats in the test inventory (CI `task test:inventory` is diff-gated):

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
# Expected: website/src/data/test-inventory.json shows FA-SF-41 added (1 file changed)
```

- [ ] **Step 5: Commit** — exact command.

```bash
git add scripts/factory/wakeup.sh tests/local/FA-SF-41-wakeup.bats website/src/data/test-inventory.json
git commit -m "feat(factory): headless wakeup.sh dispatcher wrapper (flock + git-crypt unlock) [T000413]"
```

---

### Task F.2: factory.service — systemd user unit (RuntimeMaxSec hung-run kill)

**Files:**
- Create: `scripts/factory/factory.service`
- Test: append to `tests/local/FA-SF-41-wakeup.bats`

systemd unit files are not exercised by a unit test; verification is `systemd-analyze
verify` (when available) plus grep-asserts on the load-bearing directives. `RuntimeMaxSec`
guarantees a hung `claude -p` is SIGTERM'd; `Type=oneshot` is the right shape for a
timer-driven tick.

- [ ] **Step 1+2 (VERIFICATION replaces unit test): add grep-asserts for the unit, expect FAIL.**

Append these tests to `tests/local/FA-SF-41-wakeup.bats`:

```bash

SERVICE="${BATS_TEST_DIRNAME}/../../scripts/factory/factory.service"

@test "FA-SF-41: factory.service is a oneshot that runs wakeup.sh" {
  [ -f "$SERVICE" ]
  run grep -E '^Type=oneshot' "$SERVICE"
  [ "$status" -eq 0 ]
  run grep -E '^ExecStart=.*scripts/factory/wakeup\.sh' "$SERVICE"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: factory.service kills hung runs via RuntimeMaxSec" {
  run grep -E '^RuntimeMaxSec=' "$SERVICE"
  [ "$status" -eq 0 ]
}
```

```bash
./tests/runner.sh local FA-SF-41
# Expected: the two new tests fail because scripts/factory/factory.service is missing:
#   ✗ FA-SF-41: factory.service is a oneshot that runs wakeup.sh
#     `[ -f "$SERVICE" ]' failed
```

- [ ] **Step 3: Implement** — the unit file.

```ini
# scripts/factory/factory.service
# Software Factory — systemd USER service. One dispatcher tick per activation.
# Installed/managed via `task factory:autopilot:install` (symlinked into
# ~/.config/systemd/user/). Paired with factory.timer.
[Unit]
Description=Software Factory dispatcher tick (headless wakeup)
Documentation=file:///home/patrick/Bachelorprojekt/scripts/factory/README.md
# Don't fire if the WSL networking / repo mount isn't up yet.
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/home/patrick/Bachelorprojekt
ExecStart=/home/patrick/Bachelorprojekt/scripts/factory/wakeup.sh
# Hard-kill a hung `claude -p` tick so OnUnitInactiveSec can re-arm cleanly.
RuntimeMaxSec=900
# wakeup.sh needs the user's git-crypt key + claude creds; pass via env file if present.
EnvironmentFile=-%h/.config/factory/autopilot.env
# Keep failures visible in the journal but never wedge the timer.
TimeoutStartSec=960
```

- [ ] **Step 4: VERIFY — expect PASS.**

```bash
systemd-analyze --user verify scripts/factory/factory.service 2>&1 || echo "(systemd-analyze unavailable in this env — skip)"
# Expected on a systemd host: no output (valid). In WSL without a user manager:
#   Failed to ... / "systemd-analyze unavailable in this env — skip"
#   (acceptable — CI relies on the grep-asserts below, not on a live user bus)
./tests/runner.sh local FA-SF-41
# Expected: all FA-SF-41 tests (incl. the 2 new ones) pass, 10 tests, 0 failures
```

- [ ] **Step 5: Commit.**

```bash
git add scripts/factory/factory.service tests/local/FA-SF-41-wakeup.bats
git commit -m "feat(factory): systemd user service for one dispatcher tick (RuntimeMaxSec) [T000413]"
```

---

### Task F.3: factory.timer — re-arm-after-exit user timer (Persistent=true)

**Files:**
- Create: `scripts/factory/factory.timer`
- Test: append to `tests/local/FA-SF-41-wakeup.bats`

`OnUnitInactiveSec` schedules the next tick **relative to when the service last went
inactive**, so a long tick never overlaps the next one (single-flight at the scheduler
level, complementing the `flock` in `wakeup.sh`). `Persistent=true` runs a missed tick
on next boot (survives WSL shutdown). `OnBootSec` gives the box time to settle.

- [ ] **Step 1+2 (VERIFICATION): grep-asserts for the timer, expect FAIL.**

Append to `tests/local/FA-SF-41-wakeup.bats`:

```bash

TIMER="${BATS_TEST_DIRNAME}/../../scripts/factory/factory.timer"

@test "FA-SF-41: factory.timer re-arms after exit (OnUnitInactiveSec), not fixed-rate" {
  [ -f "$TIMER" ]
  run grep -E '^OnUnitInactiveSec=' "$TIMER"
  [ "$status" -eq 0 ]
  run grep -E '^OnCalendar=' "$TIMER"
  [ "$status" -ne 0 ]   # must NOT be a fixed wall-clock schedule (would overlap long ticks)
}

@test "FA-SF-41: factory.timer survives missed ticks via Persistent=true" {
  run grep -E '^Persistent=true' "$TIMER"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: factory.timer binds factory.service and is wanted by timers.target" {
  run grep -E '^Unit=factory\.service' "$TIMER"
  [ "$status" -eq 0 ]
  run grep -E '^WantedBy=timers\.target' "$TIMER"
  [ "$status" -eq 0 ]
}
```

```bash
./tests/runner.sh local FA-SF-41
# Expected: the 3 new timer tests fail (scripts/factory/factory.timer missing):
#   ✗ FA-SF-41: factory.timer re-arms after exit (OnUnitInactiveSec), not fixed-rate
#     `[ -f "$TIMER" ]' failed
```

- [ ] **Step 3: Implement** — the timer unit.

```ini
# scripts/factory/factory.timer
# Software Factory — systemd USER timer. Drives one dispatcher tick every
# ~10 min, re-arming ONLY after the previous tick exits (single-flight).
# Enable via `task factory:autopilot:install`.
[Unit]
Description=Software Factory dispatcher tick (every ~10 min, re-armed after exit)
Documentation=file:///home/patrick/Bachelorprojekt/scripts/factory/README.md

[Timer]
Unit=factory.service
# First tick 2 min after the user manager comes up.
OnBootSec=2min
# Next tick fires 10 min AFTER the previous tick went inactive (no overlap).
OnUnitInactiveSec=10min
# Run a tick that was missed while the host was off, on next boot.
Persistent=true
# Smear ±60s so multiple machines don't all hit the DB on the same second.
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
```

- [ ] **Step 4: VERIFY — expect PASS.**

```bash
systemd-analyze --user verify scripts/factory/factory.timer 2>&1 || echo "(systemd-analyze unavailable — skip)"
# Expected on a systemd host: no output (valid unit, factory.service resolvable in the same dir).
./tests/runner.sh local FA-SF-41
# Expected: all FA-SF-41 tests pass, 13 tests, 0 failures
```

- [ ] **Step 5: Commit.**

```bash
git add scripts/factory/factory.timer tests/local/FA-SF-41-wakeup.bats
git commit -m "feat(factory): re-arm-after-exit user timer (OnUnitInactiveSec, Persistent) [T000413]"
```

---

### Task F.4: Taskfile factory:autopilot:install|uninstall|status

**Files:**
- Modify: `Taskfile.factory.yml` (append after the `enqueue` task, ~:44)
- Test: append to `tests/local/FA-SF-41-wakeup.bats`

These targets symlink the two units into `~/.config/systemd/user/`, reload the user
manager, and enable+start the timer (install); reverse it (uninstall); and print
`systemctl --user status` + the next elapse (status). They are the documented
operator entrypoints for the autopilot. Each gates `systemctl --user` behind an
availability check so the Taskfile dry-run (`task --dry … `) in CI never fails on a
manager-less host.

- [ ] **Step 1+2 (VERIFICATION): grep-asserts on the Taskfile targets, expect FAIL.**

Append to `tests/local/FA-SF-41-wakeup.bats`:

```bash

TASKFILE="${BATS_TEST_DIRNAME}/../../Taskfile.factory.yml"

@test "FA-SF-41: Taskfile defines factory:autopilot install/uninstall/status" {
  run grep -E '^[[:space:]]+autopilot:install:' "$TASKFILE"
  [ "$status" -eq 0 ]
  run grep -E '^[[:space:]]+autopilot:uninstall:' "$TASKFILE"
  [ "$status" -eq 0 ]
  run grep -E '^[[:space:]]+autopilot:status:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: autopilot:install symlinks both units and enables the timer" {
  run grep -F 'factory.timer' "$TASKFILE"
  [ "$status" -eq 0 ]
  run grep -F 'factory.service' "$TASKFILE"
  [ "$status" -eq 0 ]
  run grep -E 'systemctl --user enable --now factory\.timer' "$TASKFILE"
  [ "$status" -eq 0 ]
}
```

```bash
./tests/runner.sh local FA-SF-41
# Expected: the 2 new Taskfile tests fail (targets not yet defined):
#   ✗ FA-SF-41: Taskfile defines factory:autopilot install/uninstall/status
```

- [ ] **Step 3: Implement** — append to `Taskfile.factory.yml` (after the `enqueue` task, ~:44).

```yaml

  autopilot:install:
    desc: |
      Install the persistent Software Factory dispatcher: symlink the systemd
      USER units (factory.timer + factory.service) into ~/.config/systemd/user/,
      reload the user manager, and enable+start the timer. Requires the headless
      Phase-0 spike to be Go. Set FACTORY_GITCRYPT_KEY + claude creds in
      ~/.config/factory/autopilot.env first (EnvironmentFile of factory.service).
    silent: true
    cmds:
      - |
        set -euo pipefail
        if ! systemctl --user show-environment >/dev/null 2>&1; then
          echo "No systemd --user manager on this host (WSL without lingering?)."
          echo "Enable it: 'loginctl enable-linger $USER' then re-run. Falling back: use /loop."
          exit 1
        fi
        UNIT_DIR="${HOME}/.config/systemd/user"
        SRC="$(pwd)/scripts/factory"
        mkdir -p "${UNIT_DIR}"
        ln -sf "${SRC}/factory.service" "${UNIT_DIR}/factory.service"
        ln -sf "${SRC}/factory.timer"   "${UNIT_DIR}/factory.timer"
        systemctl --user daemon-reload
        systemctl --user enable --now factory.timer
        echo "Software Factory autopilot installed. Next tick:"
        systemctl --user list-timers factory.timer --no-pager

  autopilot:uninstall:
    desc: "Stop + disable the autopilot timer and remove the symlinked user units."
    silent: true
    cmds:
      - |
        set -euo pipefail
        UNIT_DIR="${HOME}/.config/systemd/user"
        systemctl --user disable --now factory.timer 2>/dev/null || true
        rm -f "${UNIT_DIR}/factory.timer" "${UNIT_DIR}/factory.service"
        systemctl --user daemon-reload 2>/dev/null || true
        echo "Software Factory autopilot uninstalled."

  autopilot:status:
    desc: "Show the autopilot timer state, next elapse, and the last tick's journal tail."
    silent: true
    cmds:
      - |
        set -euo pipefail
        if ! systemctl --user show-environment >/dev/null 2>&1; then
          echo "No systemd --user manager on this host."
          exit 0
        fi
        systemctl --user list-timers factory.timer --no-pager || true
        echo "--- last factory.service tick ---"
        systemctl --user status factory.service --no-pager -n 20 || true
```

- [ ] **Step 4: VERIFY — expect PASS.**

```bash
# Taskfile parses and the targets are discoverable:
task --taskfile Taskfile.factory.yml --list 2>/dev/null | grep -E 'autopilot:(install|uninstall|status)'
# Expected: three lines, e.g.
#   * autopilot:install:    Install the persistent Software Factory dispatcher...
#   * autopilot:uninstall:  Stop + disable the autopilot timer...
#   * autopilot:status:     Show the autopilot timer state...
./tests/runner.sh local FA-SF-41
# Expected: all FA-SF-41 tests pass, 15 tests, 0 failures
```

- [ ] **Step 5: Commit.**

```bash
git add Taskfile.factory.yml tests/local/FA-SF-41-wakeup.bats
git commit -m "feat(factory): task factory:autopilot install/uninstall/status for the user timer [T000413]"
```

---

### Task F.5: Inert pg_notify trigger on feature inserts (documented, NOT consumed)

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (inside `initTicketsSchema()`, after the
  `factory_control` / `feature_flags` table block from the DB segment)
- Test: `website/src/lib/tickets-db.test.ts` (new or appended) — vitest assertion on the emitted DDL string

The spec (§6 Phase 2, correction A2) calls for an OPTIONAL `AFTER INSERT … WHERE
type='feature'` `pg_notify` trigger as **inert future plumbing** — it fires a NOTIFY on
channel `factory_feature_inserted`, but **nothing in P3 consumes it** (the data plane is
one-shot `kubectl exec psql`; a LISTEN needs a held connection — see `lib.sh:31-35` and
`dispatcher.js:15`). The Cron-poll remains THE trigger. The DDL is idempotent
(`CREATE OR REPLACE FUNCTION` + drop-then-create trigger) so it is safe to re-run
per-pod-boot on both brands.

- [ ] **Step 1: Write the failing test** — full test code in a fenced block.

```typescript
// website/src/lib/tickets-db.test.ts  (append — or create with the import wiring)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// We assert against the SOURCE of initTicketsSchema(): the inert pg_notify trigger
// is present, fires only on feature inserts, and is explicitly marked NOT-CONSUMED.
const SRC = readFileSync(
  fileURLToPath(new URL('./tickets-db.ts', import.meta.url)),
  'utf8',
)

describe('factory: inert pg_notify trigger on feature inserts', () => {
  it('creates the notify function and trigger', () => {
    expect(SRC).toContain('CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted')
    expect(SRC).toContain('factory_feature_inserted') // NOTIFY channel name
  })

  it('fires AFTER INSERT only for type=feature', () => {
    expect(SRC).toMatch(/AFTER INSERT ON tickets\.tickets/)
    expect(SRC).toMatch(/WHEN \(NEW\.type = 'feature'\)/)
  })

  it('documents that the trigger is NOT consumed in Phase 3', () => {
    // Load-bearing: keep the carve-out comment so nobody wires a phantom consumer.
    expect(SRC).toMatch(/NOT[- ]CONSUMED|not consumed in (P3|Phase 3)/i)
  })
})
```

- [ ] **Step 2: Run it, expect FAIL** — exact command + expected failure text.

```bash
cd website && npx vitest run src/lib/tickets-db.test.ts
# Expected:
#   FAIL  src/lib/tickets-db.test.ts > factory: inert pg_notify trigger ...
#   AssertionError: expected '…' to contain 'CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted'
```

- [ ] **Step 3: Implement** — add the DDL inside `initTicketsSchema()` in
  `website/src/lib/tickets-db.ts`, right after the `feature_flags` table block (the
  `factory_control`/`feature_flags` tables are created by the DB segment; this trigger
  is the last factory-schema statement). Use the same `pool.query(...)` style already
  used throughout `initTicketsSchema()`.

```typescript
  // ── INERT future plumbing: pg_notify on new feature tickets ─────────────────
  // Spec §6 Phase 2 (correction A2): NOT CONSUMED in Phase 3. The data plane is
  // one-shot `kubectl exec … psql` (lib.sh:31-35); a LISTEN needs a held
  // connection (cf. dispatcher.js:15). The Cron-poll (schedule.sh, every timer
  // tick) IS the trigger. This NOTIFY exists only so a future long-lived consumer
  // can be wired without a schema change. Idempotent: safe per-pod-boot, both brands.
  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted()
    RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('factory_feature_inserted', NEW.external_id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_notify_feature_inserted ON tickets.tickets;
  `)
  await pool.query(`
    CREATE TRIGGER trg_notify_feature_inserted
    AFTER INSERT ON tickets.tickets
    FOR EACH ROW
    WHEN (NEW.type = 'feature')
    EXECUTE FUNCTION tickets.notify_feature_inserted();
  `)
```

- [ ] **Step 4: Run it, expect PASS** — exact command + expected output.

```bash
cd website && npx vitest run src/lib/tickets-db.test.ts
# Expected:
#   ✓ src/lib/tickets-db.test.ts (3 tests)
#   Test Files  1 passed (1)
#        Tests  3 passed (3)
```

- [ ] **Step 5: Commit.**

```bash
git add website/src/lib/tickets-db.ts website/src/lib/tickets-db.test.ts
git commit -m "feat(factory): inert pg_notify trigger on feature inserts (NOT consumed, future plumbing) [T000413]"
```

---

### Task F.6: README — cron-poll is THE trigger; reject CronCreate/remote/schedule

**Files:**
- Modify: `scripts/factory/README.md` (component table ~:48-49 and the Quickstart/Phase
  sections) — add a Phase 3 "Persistent Dispatcher" subsection
- Test: append to `tests/local/FA-SF-41-wakeup.bats`

Document the autopilot so an operator (and future agents) know: install via
`task factory:autopilot:install`; the **cron-poll IS the trigger**; and that
CronCreate / RemoteTrigger / `/schedule` (remote claude.ai) are **rejected** because they
have no repo checkout, no git-crypt key, no fleet kubeconfig, and no Workflow tool
(spec §2 correction A1). Also note the inert pg_notify trigger.

- [ ] **Step 1+2 (VERIFICATION): grep-asserts on the README, expect FAIL.**

Append to `tests/local/FA-SF-41-wakeup.bats`:

```bash

README="${BATS_TEST_DIRNAME}/../../scripts/factory/README.md"

@test "FA-SF-41: README documents the autopilot install task" {
  run grep -F 'task factory:autopilot:install' "$README"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: README states the cron-poll IS the trigger" {
  run grep -iE 'cron-poll .*(is|ist) (the |der )?trigger' "$README"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: README rejects CronCreate / remote / schedule as the dispatcher" {
  run grep -F 'CronCreate' "$README"
  [ "$status" -eq 0 ]
  run grep -iE 'RemoteTrigger|/schedule' "$README"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: README notes the inert (not consumed) pg_notify trigger" {
  run grep -F 'pg_notify' "$README"
  [ "$status" -eq 0 ]
}
```

```bash
./tests/runner.sh local FA-SF-41
# Expected: the 4 new README tests fail (text not present yet):
#   ✗ FA-SF-41: README documents the autopilot install task
```

- [ ] **Step 3: Implement** — add a Phase 3 subsection to `scripts/factory/README.md`
  (insert before the `## Verwandte Dokumente` section, ~:96; also flip the two Phase 3
  rows in the component table ~:48-49 to reference the new files).

In the component table (~:42-49), append rows after the `metrics.sh` row:

```markdown
| `wakeup.sh` | Headless Dispatcher-Wrapper (flock + git-crypt-unlock → `claude -p`) | ✅ Phase 3 |
| `factory.timer` / `factory.service` | systemd USER-Timer (re-arm-after-exit, Persistent) | ✅ Phase 3 |
```

Then insert this subsection before `## Verwandte Dokumente`:

```markdown
## Phase 3 — Persistenter Auto-Pilot (Trigger / Service)

Der Dispatcher läuft **ohne offene Claude-Code-Session** als WSL-Host **systemd-USER-Timer**:

```bash
# Voraussetzung: ~/.config/factory/autopilot.env mit FACTORY_GITCRYPT_KEY + Claude-Creds.
task factory:autopilot:install     # symlinkt factory.timer/.service, enable --now
task factory:autopilot:status      # nächster Tick + letzter Journal-Tail
task factory:autopilot:uninstall   # stop + disable + entfernt die Units
```

Ablauf pro Tick: `factory.timer` (`OnUnitInactiveSec=10min`, re-armt **erst nach
Tick-Ende** → Single-Flight; `Persistent=true` → überlebt Reboot) → `factory.service`
(`RuntimeMaxSec=900` killt hängende Runs) → `wakeup.sh` (`cd` Repo · `flock
/tmp/factory-tick.lock` · git-crypt entsperren falls nötig · `exec claude -p` mit dem
**Workflow-Tool** + Permission-Allowlist + `dry_run`-Policy) → nestet `dispatcher.js`.

**Der Cron-Poll IST der Trigger.** `dispatcher.js` → `schedule.sh` pollt den Backlog
jeden Tick; es gibt **keinen** separaten Event-Consumer. Eine inerte
`AFTER INSERT … WHERE type='feature'` **`pg_notify`**-Funktion in `tickets-db.ts`
(`factory_feature_inserted`) ist nur Zukunfts-Plumbing und wird in Phase 3 **nicht
konsumiert** (die Datenebene ist one-shot `kubectl exec psql`; LISTEN bräuchte eine
gehaltene Verbindung — s. `lib.sh:31-35`, `dispatcher.js:15`).

**Bewusst verworfen** (Spec §2 Korrektur A1): **CronCreate** / **RemoteTrigger** /
**`/schedule`** als Dispatcher — diese laufen lokal/session-gebunden bzw. remote auf
claude.ai und haben **kein Repo-Checkout, keinen git-crypt-Key, kein fleet-Kubeconfig
und kein Workflow-Tool**. Der WSL-Host-Timer ist der einzige Locus mit allen vier.
```

- [ ] **Step 4: VERIFY — expect PASS.**

```bash
./tests/runner.sh local FA-SF-41
# Expected: all FA-SF-41 tests pass, 19 tests, 0 failures
```

- [ ] **Step 5: Commit.**

```bash
git add scripts/factory/README.md tests/local/FA-SF-41-wakeup.bats
git commit -m "docs(factory): document persistent autopilot timer; cron-poll is the trigger; reject CronCreate/remote/schedule [T000413]"
```

---

### Task F.7: Offline gate — full inventory + bats + Taskfile dry-run

**Files:**
- Verify only (no new files); final segment gate.

A consolidating verification task so the segment leaves the tree green for CI
(`task test:all` runs BATS + kustomize structure + Taskfile dry-run, and
`task test:inventory` is diff-gated).

- [ ] **Step 1 (VERIFICATION): run the full offline gate.**

```bash
bash -n scripts/factory/wakeup.sh && echo "wakeup syntax-ok"
# Expected: wakeup syntax-ok
./tests/runner.sh local FA-SF-41
# Expected: 19 tests, 0 failures
cd website && npx vitest run src/lib/tickets-db.test.ts && cd ..
# Expected: 3 passed
task test:inventory && git diff --exit-code website/src/data/test-inventory.json && echo "inventory-clean"
# Expected: inventory-clean (no diff — FA-SF-41 already committed in F.1)
```

- [ ] **Step 2 (VERIFICATION): the umbrella offline gate (mirrors CI).**

```bash
task test:all
# Expected: BATS unit tests + kustomize manifest structure + Taskfile dry-run all green
#   (… FA-SF-41 included; no failures)
```

- [ ] **Step 3: Commit (only if `test:inventory` produced a diff above; otherwise skip).**

```bash
git add website/src/data/test-inventory.json
git commit -m "test(factory): regenerate test inventory for FA-SF-41 [T000413]"
```


## Phase 3 — Live Dashboard + Dark-Launch Feature-Flag usage

Visibility layer for Software Factory Phase 3: a per-brand admin dashboard that reads
the existing `tickets.v_factory_metrics` + `tickets.v_active_features` views (FA-SF-04)
plus `tickets.feature_flags`, exposed through a session-gated API route, an SSR-seeded
Astro page, and a Svelte island that polls every ~15s (LiveCockpit pattern). Plus a
`pipeline.js` Implement/Deploy instruction so factory-built behavior ships dark behind
`isFeatureEnabled(brand,'<slug>')` with a default-OFF flag row seeded at merge.

**Consumed contract symbols (defined in other segments — DO NOT redefine here):**
- `isFeatureEnabled(brand, key)` — TS helper in `website/src/lib/tickets-db.ts` (Segment B / DB).
- `tickets.feature_flags`, `tickets.v_factory_metrics`, `tickets.v_active_features` — DB schema (Segment B; views already exist).
- `ticket.sh feature-flag set --brand <b> --key <k> --enabled <true|false> [--set-by <who>]` — CLI (Segment C). Referenced only in `pipeline.js` prose.

**Defined-here contract symbols (other segments may consume):**
- `listFactoryMetrics()`, `listActiveFeatures()`, `listActiveFlags()` in `website/src/lib/factory-metrics.ts`.
- API route `GET /api/factory-metrics` (`website/src/pages/api/factory-metrics.ts`, `prerender=false`).
- Page `website/src/pages/dev-status.astro`.
- Component `website/src/components/FactoryDashboard.svelte`.

**Egress note:** the website pod reads its own same-namespace `shared-db` via the per-brand
`pool` exported from `website-db.ts` (`platformPool === pool`). Never construct a
cross-namespace connection — korczewski cannot reach `shared-db.workspace` (ECONNREFUSED).

---

### Task G.1: `factory-metrics.ts` — `listFactoryMetrics()` over `v_factory_metrics`
**Files:**
- Create `website/src/lib/factory-metrics.ts`
- Create (Test) `website/src/lib/factory-metrics.test.ts`

- [ ] **Step 1: Write the failing test** — full test code (mirrors the pg-mem mock idiom from `platform-db.ensure.test.ts`; the view is replaced by a seeded plain table because pg-mem has no `date_trunc`-grouped view support):
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('pg', () => {
  const { newDb } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb();
  mem.public.none(`
    CREATE SCHEMA tickets;
    CREATE TABLE tickets.v_factory_metrics (
      day date, features_shipped int, avg_cycle_time_h numeric,
      escalations int, total_features int);
    INSERT INTO tickets.v_factory_metrics VALUES
      ('2026-06-04', 3, 5.5, 1, 7),
      ('2026-06-03', 2, 9.0, 0, 4);
    CREATE TABLE tickets.v_active_features (
      id text, external_id text, title text, priority text, status text,
      touched_files text, pipeline_slot int, created_at timestamptz, updated_at timestamptz);
    INSERT INTO tickets.v_active_features VALUES
      ('u1','T000500','Feature A','hoch','in_progress','k3d/a.yaml',1, now(), now());
    CREATE TABLE tickets.feature_flags (
      id int, brand text, key text, enabled boolean, created_at timestamptz, set_by text);
    INSERT INTO tickets.feature_flags VALUES
      (1,'mentolder','dark-a', false, now(), 'factory'),
      (2,'mentolder','dark-b', true,  now(), 'admin');
  `);
  const { Pool } = mem.adapters.createPg();
  return { default: { Pool }, Pool };
});
vi.mock('./tickets-db', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('./tickets/transition', () => ({ transitionTicket: vi.fn().mockResolvedValue(undefined) }));

import { listFactoryMetrics } from './factory-metrics';

describe('listFactoryMetrics', () => {
  it('returns metric rows newest-day-first with all KPI columns', async () => {
    const rows = await listFactoryMetrics();
    expect(rows.length).toBe(2);
    expect(rows[0].day).toBe('2026-06-04');
    expect(rows[0].features_shipped).toBe(3);
    expect(Number(rows[0].avg_cycle_time_h)).toBe(5.5);
    expect(rows[0].escalations).toBe(1);
    expect(rows[0].total_features).toBe(7);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — exact command + expected failure:
```bash
cd website && npx vitest run src/lib/factory-metrics.test.ts
```
Expected: `Failed to resolve import "./factory-metrics"` (the module does not exist yet).

- [ ] **Step 3: Implement** — full real code of `website/src/lib/factory-metrics.ts`:
```ts
// Software Factory Phase 3 — dashboard read helpers.
// Reads the existing tickets.v_factory_metrics + tickets.v_active_features views
// (FA-SF-04) and tickets.feature_flags via the PER-BRAND pool. Same-namespace
// only — never cross-namespace (korczewski cannot reach shared-db.workspace).
import { pool } from './website-db';

export interface FactoryMetricRow {
  day: string;
  features_shipped: number;
  avg_cycle_time_h: number | null;
  escalations: number;
  total_features: number;
}

export interface ActiveFeatureRow {
  external_id: string;
  title: string;
  priority: string;
  status: string;
  pipeline_slot: number | null;
}

export interface FeatureFlagRow {
  brand: string;
  key: string;
  enabled: boolean;
  set_by: string | null;
}

/** Daily throughput / cycle-time / escalation KPIs (last 30d), newest day first. */
export async function listFactoryMetrics(): Promise<FactoryMetricRow[]> {
  const r = await pool.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            features_shipped, avg_cycle_time_h, escalations, total_features
       FROM tickets.v_factory_metrics`,
  );
  return r.rows as FactoryMetricRow[];
}
```

- [ ] **Step 4: Run it, expect PASS** — exact command + expected output:
```bash
cd website && npx vitest run src/lib/factory-metrics.test.ts
```
Expected: `Test Files  1 passed (1)` and `Tests  1 passed (1)`.

- [ ] **Step 5: Commit**
```bash
git add website/src/lib/factory-metrics.ts website/src/lib/factory-metrics.test.ts && git commit -m "feat(factory): listFactoryMetrics reads v_factory_metrics [T000413]"
```

---

### Task G.2: `factory-metrics.ts` — `listActiveFeatures()` + `listActiveFlags()`
**Files:**
- Modify `website/src/lib/factory-metrics.ts`
- Modify (Test) `website/src/lib/factory-metrics.test.ts`

- [ ] **Step 1: Write the failing test** — append these two cases inside the existing `describe('listFactoryMetrics', ...)` block (add the import to the existing top-of-file import line):
```ts
  it('listActiveFeatures returns the active working set with pipeline_slot', async () => {
    const { listActiveFeatures } = await import('./factory-metrics');
    const rows = await listActiveFeatures();
    expect(rows.length).toBe(1);
    expect(rows[0].external_id).toBe('T000500');
    expect(rows[0].priority).toBe('hoch');
    expect(rows[0].pipeline_slot).toBe(1);
  });

  it('listActiveFlags returns only enabled=false (dark) flags for the brand', async () => {
    const { listActiveFlags } = await import('./factory-metrics');
    const rows = await listActiveFlags('mentolder');
    expect(rows.map((r) => r.key)).toEqual(['dark-a']);
    expect(rows[0].enabled).toBe(false);
  });
```

- [ ] **Step 2: Run it, expect FAIL** — exact command + expected failure:
```bash
cd website && npx vitest run src/lib/factory-metrics.test.ts
```
Expected: 2 failing tests with `listActiveFeatures is not a function` / `listActiveFlags is not a function`.

- [ ] **Step 3: Implement** — append to `website/src/lib/factory-metrics.ts`:
```ts
/** The dispatcher's working set — non-terminal features with touch data. */
export async function listActiveFeatures(): Promise<ActiveFeatureRow[]> {
  const r = await pool.query(
    `SELECT external_id, title, priority, status, pipeline_slot
       FROM tickets.v_active_features`,
  );
  return r.rows as ActiveFeatureRow[];
}

/** Dark-launched (enabled=false) feature flags for this brand. */
export async function listActiveFlags(brand: string): Promise<FeatureFlagRow[]> {
  const r = await pool.query(
    `SELECT brand, key, enabled, set_by
       FROM tickets.feature_flags
      WHERE brand = $1 AND enabled = false
      ORDER BY created_at DESC`,
    [brand],
  );
  return r.rows as FeatureFlagRow[];
}
```

- [ ] **Step 4: Run it, expect PASS** — exact command + expected output:
```bash
cd website && npx vitest run src/lib/factory-metrics.test.ts
```
Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Commit**
```bash
git add website/src/lib/factory-metrics.ts website/src/lib/factory-metrics.test.ts && git commit -m "feat(factory): listActiveFeatures + listActiveFlags dashboard helpers [T000413]"
```

---

### Task G.3: API route `GET /api/factory-metrics` (session+isAdmin → 401)
**Files:**
- Create `website/src/pages/api/factory-metrics.ts`

This route is a session-gated clone of `api/admin/monitoring.ts`'s gate fused with the
`api/timeline.ts` JSON shape. `prerender = false`. Unit-of-record gate behavior is covered
by the bats in Task G.6; here we verify the module compiles and the gate symbols are wired.

- [ ] **Step 1: VERIFICATION — write the route, then typecheck.** Full real code of `website/src/pages/api/factory-metrics.ts`:
```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { listFactoryMetrics, listActiveFeatures, listActiveFlags } from '../../lib/factory-metrics';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();

  try {
    const [metrics, activeFeatures, flags] = await Promise.all([
      listFactoryMetrics(),
      listActiveFeatures(),
      listActiveFlags(brand),
    ]);
    return new Response(
      JSON.stringify({ brand, metrics, activeFeatures, flags, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err) {
    console.error('[api/factory-metrics]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Run it, expect PASS** — typecheck the new route + its imports:
```bash
cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'factory-metrics' || echo "NO_FACTORY_METRICS_TYPE_ERRORS"
```
Expected: `NO_FACTORY_METRICS_TYPE_ERRORS`.

- [ ] **Step 3: Commit**
```bash
git add website/src/pages/api/factory-metrics.ts && git commit -m "feat(factory): /api/factory-metrics route (getSession+isAdmin gate) [T000413]"
```

---

### Task G.4: `FactoryDashboard.svelte` — KPI island, ~15s polling
**Files:**
- Create `website/src/components/FactoryDashboard.svelte`

KPIs: throughput (today's `features_shipped`), avg cycle time (`avg_cycle_time_h`),
slot usage (count of `activeFeatures` with a non-null `pipeline_slot` over `FACTORY_GLOBAL_CAP`
slots, passed in as a prop), active dark features (`flags.length`), escalations (today's
`escalations`). Polls `/api/factory-metrics` every 15s using the LiveCockpit
`onMount(setInterval)/onDestroy(clearInterval)` idiom — NOT Timeline paging.

- [ ] **Step 1: VERIFICATION — write the component.** Full real code of `website/src/components/FactoryDashboard.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface MetricRow { day: string; features_shipped: number; avg_cycle_time_h: number | null; escalations: number; total_features: number; }
  interface ActiveFeature { external_id: string; title: string; priority: string; status: string; pipeline_slot: number | null; }
  interface FlagRow { brand: string; key: string; enabled: boolean; set_by: string | null; }
  interface Payload { brand: string; metrics: MetricRow[]; activeFeatures: ActiveFeature[]; flags: FlagRow[]; fetchedAt: string; }

  let { initial, globalCap }: { initial: Payload | null; globalCap: number } = $props();

  const POLL_MS = 15000;
  let data = $state<Payload | null>(initial);
  let loadError = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      const res = await fetch('/api/factory-metrics', { credentials: 'same-origin' });
      if (!res.ok) { loadError = `Dashboard nicht erreichbar (${res.status})`; return; }
      data = await res.json() as Payload;
      loadError = null;
    } catch { loadError = 'Netzwerkfehler'; }
  }

  const today = $derived(data?.metrics?.[0] ?? null);
  const slotsUsed = $derived(data?.activeFeatures.filter((f) => f.pipeline_slot != null).length ?? 0);

  onMount(() => { if (!initial) refresh(); timer = setInterval(refresh, POLL_MS); });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>

<div class="text-light" data-testid="factory-dashboard">
  {#if loadError}
    <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 mb-4">
      {loadError}
      <button onclick={refresh} class="ml-3 underline">Erneut versuchen</button>
    </div>
  {/if}

  {#if !data}
    <p class="text-muted">Dashboard lädt…</p>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Durchsatz (heute)</p><p class="text-3xl font-bold" data-testid="kpi-throughput">{today?.features_shipped ?? 0}</p></div>
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Ø Zykluszeit</p><p class="text-3xl font-bold" data-testid="kpi-cycle-time">{today?.avg_cycle_time_h ?? '–'}h</p></div>
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Slot-Auslastung</p><p class="text-3xl font-bold" data-testid="kpi-slot-usage">{slotsUsed}/{globalCap}</p></div>
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Dark-Features</p><p class="text-3xl font-bold" data-testid="kpi-active-features">{data.flags.length}</p></div>
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Eskalationen (heute)</p><p class="text-3xl font-bold" data-testid="kpi-escalations">{today?.escalations ?? 0}</p></div>
    </div>

    <h3 class="font-semibold mb-2">Aktive Features</h3>
    <ul class="space-y-1 mb-6">
      {#each data.activeFeatures as f (f.external_id)}
        <li class="flex justify-between rounded bg-white/5 px-3 py-2">
          <span>{f.external_id} — {f.title}</span>
          <span class="text-muted text-sm">{f.priority} · {f.status} · Slot {f.pipeline_slot ?? '–'}</span>
        </li>
      {/each}
    </ul>

    <h3 class="font-semibold mb-2">Dark-Launch Flags</h3>
    <ul class="space-y-1">
      {#each data.flags as fl (fl.key)}
        <li class="flex justify-between rounded bg-white/5 px-3 py-2">
          <span>{fl.key}</span>
          <span class="text-muted text-sm">{fl.enabled ? 'an' : 'aus'} · {fl.set_by ?? '—'}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 2: Run it, expect PASS** — Svelte/Astro typecheck of the new component:
```bash
cd website && npx astro check 2>&1 | grep -E 'FactoryDashboard' || echo "NO_DASHBOARD_CHECK_ERRORS"
```
Expected: `NO_DASHBOARD_CHECK_ERRORS`.

- [ ] **Step 3: Commit**
```bash
git add website/src/components/FactoryDashboard.svelte && git commit -m "feat(factory): FactoryDashboard KPI island (15s poll) [T000413]"
```

---

### Task G.5: `dev-status.astro` — server gate + SSR-seed + island
**Files:**
- Create `website/src/pages/dev-status.astro`

Server-side gate mirrors `admin/live/index.astro`: `getSession` → `getLoginUrl` when no
session, `/admin` redirect when not admin (the documented `isAdmin()` allowlist deviation
from `/dev-access`). The page seeds the first payload server-side so the island renders
without a flash, then hands off to `client:load`.

- [ ] **Step 1: VERIFICATION — write the page.** Full real code of `website/src/pages/dev-status.astro`:
```astro
---
import AdminLayout from '../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../lib/auth';
import FactoryDashboard from '../components/FactoryDashboard.svelte';
import { listFactoryMetrics, listActiveFeatures, listActiveFlags } from '../lib/factory-metrics';

export const prerender = false;

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
// Dashboard gating reuses the isAdmin() username allowlist (PORTAL_ADMIN_USERNAME),
// a documented deviation from the /dev-access group model (no groups claim on the
// website session). See spec D-DASH.
if (!isAdmin(session)) return Astro.redirect('/admin');

const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
const globalCap = parseInt(process.env.FACTORY_GLOBAL_CAP ?? '3', 10);

let initial = null;
try {
  const [metrics, activeFeatures, flags] = await Promise.all([
    listFactoryMetrics(), listActiveFeatures(), listActiveFlags(brand),
  ]);
  initial = { brand, metrics, activeFeatures, flags, fetchedAt: new Date().toISOString() };
} catch { initial = null; }
---

<AdminLayout title="Factory Status">
  <section class="pt-6 pb-12 bg-dark min-h-screen">
    <div class="max-w-7xl mx-auto px-6">
      <h1 class="text-2xl font-bold mb-6">Software Factory — Live Status</h1>
      <FactoryDashboard client:load {initial} {globalCap} />
    </div>
  </section>
</AdminLayout>
```

- [ ] **Step 2: Run it, expect PASS** — Astro check + production build of the page:
```bash
cd website && npx astro check 2>&1 | grep -E 'dev-status' || echo "NO_DEVSTATUS_CHECK_ERRORS"
```
Expected: `NO_DEVSTATUS_CHECK_ERRORS`.

- [ ] **Step 3: Commit**
```bash
git add website/src/pages/dev-status.astro && git commit -m "feat(factory): dev-status.astro server-gated dashboard page [T000413]"
```

---

### Task G.6: FA-SF-42 bats — `/api/factory-metrics` 401-without-session contract + inventory
**Files:**
- Create (Test) `tests/local/FA-SF-42-dashboard-route.bats`
- Modify `website/src/data/test-inventory.json`

Offline contract test: a request to `/api/factory-metrics` with no session cookie must be
rejected 401 (matching the gate in `api/admin/monitoring.ts`). This is verified against a
built dev preview without DB access by asserting the route source contains the
`getSession`/`isAdmin` 401 gate, then (when a preview is reachable) a live curl.

- [ ] **Step 1: Write the failing test** — full bats code:
```bash
#!/usr/bin/env bats
# FA-SF-42: /api/factory-metrics enforces the getSession+isAdmin 401 gate.
setup() { load 'test_helper.bash'; }

ROUTE="website/src/pages/api/factory-metrics.ts"

@test "FA-SF-42: route exists and is server-rendered" {
  [ -f "$ROUTE" ]
  grep -q 'export const prerender = false' "$ROUTE"
}

@test "FA-SF-42: gate returns 401 when session is absent or non-admin" {
  grep -q "getSession(request.headers.get('cookie'))" "$ROUTE"
  grep -q '!session || !isAdmin(session)' "$ROUTE"
  grep -q 'status: 401' "$ROUTE"
}

@test "FA-SF-42: brand is resolved per-pod, never hardcoded" {
  grep -q "process.env.BRAND_ID ?? process.env.BRAND" "$ROUTE"
}

@test "FA-SF-42: live preview rejects an unauthenticated request" {
  [ -n "${WEBSITE_BASE_URL:-}" ] || skip "no WEBSITE_BASE_URL preview target"
  run curl -s -o /dev/null -w '%{http_code}' "${WEBSITE_BASE_URL}/api/factory-metrics"
  [ "$status" -eq 0 ]
  [ "$output" = "401" ]
}
```

- [ ] **Step 2: Run it, expect FAIL** — exact command + expected failure (the inventory entry is missing, and on a fresh checkout the route grep would pass only after G.3; run order guarantees the route exists, so failure here is the inventory drift in Step 4 — verify the test runs first):
```bash
./tests/runner.sh local FA-SF-42
```
Expected: BATS reports `4 tests, 0 failures` for the file itself (the route was created in G.3). If G.6 is executed before the inventory edit, the CI `test:inventory` check is what fails — proceed to Step 3.

- [ ] **Step 3: Implement** — register the bats in `website/src/data/test-inventory.json` by appending this object as the last array element (insert before the closing `]`, adding a comma after the current final `SA-22` object):
```json
  ,{
    "id": "FA-SF-42",
    "file": "tests/local/FA-SF-42-dashboard-route.bats",
    "category": "FA",
    "kind": "shell"
  }
```

- [ ] **Step 4: Run it, expect PASS** — regenerate-and-diff exactly as CI does, plus run the bats:
```bash
./tests/runner.sh local FA-SF-42 && task test:inventory && git diff --exit-code website/src/data/test-inventory.json
```
Expected: bats prints `4 tests, 0 failures`; `git diff --exit-code` exits 0 (inventory matches the committed file — no drift).

- [ ] **Step 5: Commit**
```bash
git add tests/local/FA-SF-42-dashboard-route.bats website/src/data/test-inventory.json && git commit -m "test(factory): FA-SF-42 dashboard route 401 gate + inventory [T000413]"
```

---

### Task G.7: `pipeline.js` Implement — instruct agents to gate new behavior behind a flag
**Files:**
- Modify `scripts/factory/pipeline.js:236-242` (the Implement-phase agent prompt template)

Implement-agents must wrap every new user-visible behavior in
`isFeatureEnabled(brand,'<slug>')` so the merge ships dark by default. The dark slug is the
feature's `slug` (already in scope as `slug` in `pipeline.js`).

- [ ] **Step 1: VERIFICATION — read the anchor, then edit.** Confirm the current Implement prompt block:
```bash
sed -n '236,242p' scripts/factory/pipeline.js
```
Expected: the block ends with `Return a summary of the diff and the local test result (pass/fail).` (no dark-launch instruction yet).

- [ ] **Step 2: Implement** — replace the Implement prompt template body. Change the line:
```js
       Follow TDD (red-green). Acceptance criteria: ${t.acceptance_criteria.join('; ')}.
```
to:
```js
       Follow TDD (red-green). Acceptance criteria: ${t.acceptance_criteria.join('; ')}.
       DARK-LAUNCH: gate every new user-visible behavior behind isFeatureEnabled('${brand}', '${slug}')
       (import from website/src/lib/tickets-db.ts). The flag defaults OFF, so the merge ships dark;
       do NOT enable it in code. The default-OFF feature_flags row is seeded in the Deploy phase.
```

- [ ] **Step 3: Run it, expect PASS** — offline JS syntax check:
```bash
node --check scripts/factory/pipeline.js && echo PIPELINE_JS_OK
```
Expected: `PIPELINE_JS_OK`.

- [ ] **Step 4: Commit**
```bash
git add scripts/factory/pipeline.js && git commit -m "feat(factory): Implement phase gates new behavior behind isFeatureEnabled [T000413]"
```

---

### Task G.8: `pipeline.js` Deploy — seed the default-OFF feature_flags row at merge
**Files:**
- Modify `scripts/factory/pipeline.js:323-326` (the Deploy-phase "Close the ticket" step in the deploy agent prompt)

At merge time the Deploy-agent seeds a `feature_flags` row for `<slug>` in BOTH brands,
default OFF, using the Segment-C CLI `ticket.sh feature-flag set`. This is the operational
mirror of the gate added in G.7.

- [ ] **Step 1: VERIFICATION — read the anchor, then edit.** Confirm the current Deploy "close ticket" step:
```bash
sed -n '321,327p' scripts/factory/pipeline.js
```
Expected: step 4 squash-merge, step 5 close-ticket+archive-plan, step 6 deploy both brands (no flag-seed step yet).

- [ ] **Step 2: Implement** — insert a flag-seed instruction. Change the block:
```js
   5. Close the ticket and archive the plan:
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status done --resolution shipped
      bash ${REPO}/scripts/ticket.sh archive-plan --id ${A.ticket_id} --slug ${slug} \
        --branch ${WORK_BRANCH} --plan-file ${REPO}/docs/superpowers/plans/${A.timestamp}-${slug}.md
```
to:
```js
   5. Close the ticket and archive the plan:
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status done --resolution shipped
      bash ${REPO}/scripts/ticket.sh archive-plan --id ${A.ticket_id} --slug ${slug} \
        --branch ${WORK_BRANCH} --plan-file ${REPO}/docs/superpowers/plans/${A.timestamp}-${slug}.md
   5b. Seed the dark-launch flag default-OFF for BOTH brands (mirrors the
       isFeatureEnabled('${slug}') gate added during Implement):
      bash ${REPO}/scripts/ticket.sh feature-flag set --brand mentolder --key ${slug} --enabled false --set-by factory
      bash ${REPO}/scripts/ticket.sh feature-flag set --brand korczewski --key ${slug} --enabled false --set-by factory
```

- [ ] **Step 3: Run it, expect PASS** — offline JS syntax check + assert both seed lines present:
```bash
node --check scripts/factory/pipeline.js && grep -c "feature-flag set --brand" scripts/factory/pipeline.js
```
Expected: exit 0 and the grep prints `2`.

- [ ] **Step 4: Commit**
```bash
git add scripts/factory/pipeline.js && git commit -m "feat(factory): Deploy phase seeds default-OFF dark-launch flag for both brands [T000413]"
```

---

### Task G.9: Wire `dev-status` into admin nav + final segment verification
**Files:**
- Modify `website/src/layouts/AdminLayout.astro` (add a nav link to `/dev-status`; verify the exact nav block first)

- [ ] **Step 1: VERIFICATION — locate the admin nav list.** Find where admin nav links are rendered:
```bash
grep -n 'href="/admin' website/src/layouts/AdminLayout.astro | head
```
Expected: a list of `<a href="/admin/...">` entries (the admin sidebar/nav). Pick the entry adjacent to `platform` to anchor the insertion.

- [ ] **Step 2: Implement** — add a dashboard link next to the Platform Hub link. Insert immediately after the existing Platform Hub nav anchor (match the surrounding markup; example shape):
```astro
        <a href="/dev-status" class="block px-3 py-2 rounded hover:bg-white/10">Factory Status</a>
```

- [ ] **Step 3: Run it, expect PASS** — full segment gate: typecheck, build, and run the new bats + vitest together:
```bash
cd website && npx astro check 2>&1 | grep -E 'dev-status|FactoryDashboard|factory-metrics' || echo "NO_SEGMENT_CHECK_ERRORS"
cd website && npx vitest run src/lib/factory-metrics.test.ts
```
Expected: `NO_SEGMENT_CHECK_ERRORS`, then `Tests  3 passed (3)`.

- [ ] **Step 4: Commit**
```bash
git add website/src/layouts/AdminLayout.astro && git commit -m "feat(factory): admin nav link to dev-status factory dashboard [T000413]"
```
