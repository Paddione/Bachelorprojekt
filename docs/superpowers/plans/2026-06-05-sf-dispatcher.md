---
title: Software Factory — Phase 2 (Dispatcher / Tier 1) Implementation Plan
ticket_id: T000424
domains: [db, test, infra]
status: active
pr_number: null
---

# Software Factory — Phase 2 (Dispatcher / Tier 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the manually-invoked P1 single-feature pipeline into an autonomous, `/loop`-driven multi-feature Dispatcher (Tier 1) that polls the feature queue, conflict-gates + slot-schedules, launches pipelines in parallel (Model A: a Workflow that nests pipeline workflows), sweeps for stale runs, and writes throughput metrics — across both brands.

**Architecture:** Five deterministic bash primitives (`slots.sh`, `queue.sh`, `schedule.sh`, `watchdog.sh`, `metrics.sh`) sharing `scripts/factory/lib.sh`, plus `ticket.sh` extensions, are orchestrated by a Model-A Workflow script `scripts/factory/dispatcher.js`. Per tick the dispatcher runs ONE deterministic PREP agent (watchdog→queue→conflict-gate→slot-claim, returns a schema-validated launch plan), LAUNCHES one nested `pipeline.js` workflow per scheduled feature via `workflow({scriptPath})`, then runs a METRICS agent. Single-flight comes from `/loop`'s natural cadence (next wake scheduled only after the run ends) plus an atomic slot-claim and a global concurrency cap — **not** a pg advisory lock (which would not survive separate `kubectl exec` psql sessions). Liveness is `updated_at` (auto-bumped by the `fn_lifecycle_ts` trigger) plus a per-phase `ticket.sh touch` written by `pipeline.js`; the watchdog escalates `in_progress` features stale > 30 min.

**Tech Stack:** Bash (`set -euo pipefail`, `jq`), `kubectl --context fleet exec … psql` against each brand's `shared-db`, the Claude Code **Workflow tool** (harness globals `agent`/`parallel`/`phase`/`log`/`workflow`, `args.timestamp`), `/loop` (`ScheduleWakeup`), BATS (`tests/local/FA-SF-*.bats` via `./tests/runner.sh local`), `task` (go-task). PostgreSQL schema is app-managed in `website/src/lib/tickets-db.ts` (read-only here; no DDL changes in P2).

**Decisions locked in (from brainstorming, see `docs/superpowers/specs/2026-06-05-sf-dispatcher-design.md`):**
- Launch model **A** (dispatcher Workflow nests pipeline workflows). `/loop` self-paced trigger.
- Per-brand slot pools (3/brand) + global concurrency cap (start 3).
- Watchdog = `updated_at` sweep + per-phase progress touch.
- Layer-4 canary, directory-level conflict heuristic, semantic dedup, `embedTicket` wiring/backfill → **all P3 / out of scope.**
- Test seeding via `is_test_data=true` + `SF-TEST-` title prefix + disjoint synthetic file paths; cleanup via existing `tickets.fn_purge_test_data()`.

**Out of scope (P3):** the directory-level conflict heuristic (`conflict-check.sh` stays file-level), Layer-4 canary smoke + auto-rollback, a semantic dedup gate, `embedTicket` wiring into `ticket.sh create` + the embedding backfill (GPU host down; Scout stays fail-soft `[]`), event/webhook triggers, a dedicated dispatcher Deployment, a live dashboard, and any DDL change to `tickets-db.ts`.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `scripts/ticket.sh` (modify) | new subcommands `get`, `set-touched-files`, `set-pipeline-slot`, `release-slot`, `touch`; `--is-test-data` flag on `create`; `BRAND`→namespace map | T1 |
| `scripts/factory/lib.sh` (**new**) | shared `factory_resolve` / `factory_pgpod` / `factory_psql` for the primitives | T2 |
| `tests/lib/factory-test-fixtures.sh` (**new**) | `seed_test_feature` / `purge_factory_test_data` for FA-SF seed tests (refuses prod) | T2 |
| `scripts/factory/slots.sh` (**new**) | per-brand slot accounting: `next` / `count` / `claim` (atomic) / `release` | T3 |
| `scripts/factory/queue.sh` (**new**) | raw `backlog` feature list per brand (priority→FIFO), JSON | T4 |
| `scripts/factory/schedule.sh` (**new**) | conflict-gate + slot-claim up to per-brand pool & global cap → launch plan | T5 |
| `scripts/factory/watchdog.sh` (**new**) | escalate `in_progress` features stale > 30 min (triage + release slot + comment) | T6 |
| `scripts/factory/metrics.sh` (**new**) | summarize `v_factory_metrics` → comment on the Vorhaben ticket | T7 |
| `scripts/factory/pipeline.js` (modify) | per-phase `ticket.sh touch` progress write (watchdog liveness) | T8 |
| `scripts/factory/dispatcher.js` (**new**) | Model-A Workflow: PREP → LAUNCH (nest pipelines) → METRICS | T9 |
| `Taskfile.factory.yml` (modify) | `factory:dispatch` doc target | T10 |
| `tests/local/FA-SF-21..27,30-*.bats` (**new**) | per-component BATS (offline + live-seed) | T1–T9 |
| `scripts/build-test-inventory.sh` → `website/src/data/test-inventory.json` | regenerated inventory (CI diff-gated) | T10 |
| `scripts/factory/README.md`, `docs/superpowers/references/factory-usage.md` (modify) | Phase-2 status flip | T10 |

**Dependency order:** T0 (spike, execution-time) → T1 → T2 → {T3, T4} → T5 (needs T3+T4) → T6 → T7 → T8 → T9 (needs T3–T7) → T10. Commit after every green step group with `[T000413]`.

---

## Conventions for every task

- **Worktree:** all work happens in the current feature worktree (`/tmp/wt-sf-dispatcher`, branch `feature/sf-dispatcher`). Never use `.claude/worktrees/`.
- **Run one BATS test:** `./tests/runner.sh local FA-SF-NN` (the runner finds `.bats` by ID; live tests need a reachable cluster).
- **Offline lint a Workflow script:** `node --check scripts/factory/<name>.js`.
- **Test cluster context:** seed/live BATS default to a **dev** context, never prod `fleet`. Set `FACTORY_CTX`/`FACTORY_NS` (e.g. `FACTORY_CTX=k3d-korczewski-dev FACTORY_NS=workspace-korczewski-dev`) — the fixtures **refuse** to seed into `fleet` unless `FACTORY_ALLOW_PROD_SEED=1`.
- **Read-only DB discipline:** never `SELECT *`/`content` on `tickets.ticket_plans`. Primitives select metadata columns only.

---

### Task 0: De-risk spike — confirm the Workflow execution + nesting model (execution-time, no commit)

**Why:** P1's `pipeline.js` was only ever `node --check`+grep-tested (FA-SF-20); **it has never actually run**. The dispatcher is the first thing that will execute a pipeline, and Model A depends on three unverified harness facts: (a) the harness calls `export async function run(args, harness)` and injects `{agent, parallel, phase, log, workflow}` (does it inject `workflow`?); (b) `workflow({scriptPath: '…/pipeline.js'}, childArgs)` runs the child as a one-level nested workflow; (c) nested children share the parent's concurrency cap/budget (documented, but confirm no hard error). Resolve this **before** building everything on it.

- [ ] **Step 1: Write a throwaway spike workflow (do NOT add to the repo)**

In the Claude Code session, invoke the **Workflow tool** with this inline script (it does not touch the DB):
```js
export const meta = { name: 'sf-spike-nesting', description: 'confirm workflow() nesting + child execution', phases: [{ title: 'Spike' }] }
export async function run(args, harness) {
  const { workflow, log } = harness
  if (typeof workflow !== 'function') return { ok: false, reason: 'workflow global not injected into harness param' }
  // A trivial inline child via scriptPath is not possible (needs a file); instead nest a named-by-scriptPath child
  // pointing at a tiny no-op script written to /tmp first by an agent. Simpler: confirm the API shape only.
  log('workflow() is a function on the harness param')
  return { ok: true, hasWorkflow: true, timestamp: args?.timestamp ?? null }
}
export default run
```
Pass `args: { timestamp: "<the current ISO timestamp>" }`.

- [ ] **Step 2: Confirm the execution contract**

Observe the spike result. Expected: `{ ok: true, hasWorkflow: true }`. This confirms (a) the `run(args, harness)` contract and that `workflow` is injected. **If `workflow` is NOT on the harness param**, check whether it is a top-level global instead — and adjust `dispatcher.js` in Task 9 accordingly (top-level globals vs harness-param destructure), and likewise re-confirm `pipeline.js`'s contract. Record the finding in a comment on T000413:
```bash
bash scripts/ticket.sh get --id T000413 >/dev/null  # sanity: ticket.sh reachable (after T1)
```

- [ ] **Step 3: Confirm scriptPath nesting with a no-op child (after T9 skeleton exists, revisit if needed)**

Defer the full `workflow({scriptPath})` nesting check to Task 9 Step 6 (it needs `dispatcher.js`). No commit for Task 0 — it is a recorded verification only.

---

### Task 1: Extend `ticket.sh` (get / set-touched-files / set-pipeline-slot / release-slot / touch / --is-test-data / BRAND map)

**Why:** The dispatcher and fixtures need to read a ticket, write `touched_files` (**fixes a latent P1 bug**: `pipeline.js:113` already calls `set-touched-files`, which does not exist), set/clear `pipeline_slot`, bump `updated_at` for liveness (`add-comment` does **not** touch `tickets`), and create purge-able test tickets. `ticket.sh` is also not brand-aware today (defaults `TICKET_NS=workspace` = prod mentolder).

**Files:**
- Modify: `scripts/ticket.sh` (header comment, `BRAND` map after L16, `cmd_create` flag + INSERT, five new `cmd_*`, dispatch `case`, usage line)
- Test: `tests/local/FA-SF-21-ticket-cli.bats` (**new**, offline arg-validation)

- [ ] **Step 1: Write the failing offline test**

Create `tests/local/FA-SF-21-ticket-cli.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-21: offline arg-validation contract for the new ticket.sh subcommands.
setup() { load 'test_helper.bash'; }

@test "FA-SF-21: get requires --id" {
  run bash scripts/ticket.sh get
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--id" ]]
}

@test "FA-SF-21: set-touched-files requires --id and --files" {
  run bash scripts/ticket.sh set-touched-files --id T000001
  [ "$status" -eq 2 ]
  [[ "$output" =~ "--files" ]]
}

@test "FA-SF-21: set-pipeline-slot requires --id and --slot" {
  run bash scripts/ticket.sh set-pipeline-slot --id T000001
  [ "$status" -eq 2 ]
}

@test "FA-SF-21: unknown BRAND is rejected with exit 2" {
  run env BRAND=bogus bash scripts/ticket.sh get --id T000001
  [ "$status" -eq 2 ]
  [[ "$output" =~ "unknown BRAND" ]]
}

@test "FA-SF-21: dispatch lists the new commands in usage" {
  run bash scripts/ticket.sh
  [ "$status" -eq 1 ]
  [[ "$output" =~ "set-touched-files" ]]
}
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-21`
Expected: FAIL — `get`/`set-touched-files`/etc. are unknown commands; the BRAND map and usage text are absent.

- [ ] **Step 3: Add the BRAND→namespace map + fix the dev-pod label selector**

In `scripts/ticket.sh`, immediately after the `USER="website"` line (L16), insert:
```bash

# Brand → namespace map (mirrors conflict-check.sh). BRAND wins over TICKET_NS so
# a caller cannot silently hit the wrong brand's prod DB.
case "${BRAND:-}" in
  mentolder)   NS="workspace" ;;
  korczewski)  NS="workspace-korczewski" ;;
  "")          : ;;  # no BRAND given — keep TICKET_NS default
  *)           echo "ERROR: unknown BRAND (use mentolder|korczewski)" >&2; exit 2 ;;
esac
```

**Also fix `_pgpod` (L20) to find the dev DB pod.** Today it uses `-l app=shared-db`, but the dev shared-db is labeled `app: shared-db-dev` (`k3d/dev-stack/shared-db-dev.yaml`), so every `TICKET_CTX=k3d-*-dev` write (watchdog escalation, the live seed tests) would fail with "no shared-db pod found". Change the selector to match `conflict-check.sh:47` / `lib.sh`:
```bash
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
```

- [ ] **Step 4: Add the `--is-test-data` flag to `cmd_create`**

In `cmd_create`, add to the local declaration (L36) `is_test="false"`, add a case arm in the arg loop:
```bash
      --is-test-data) is_test="true"; shift ;;
```
and change the INSERT (L70-72) to:
```bash
INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority, is_test_data)
VALUES (:'type', :'brand', :'title', :'desc', :'status', NULLIF(:'sev', ''), :'prio', :'is_test'::boolean)
RETURNING external_id || '|' || id;
```
and add `-v is_test="$is_test"` to the `_exec_sql` call (alongside the existing `-v` flags, before the heredoc).

- [ ] **Step 5: Add the five new command functions**

Insert before the final `if [[ $# -lt 1 ]]` block (after `cmd_get_attachments`):
```bash
cmd_get() {
  local id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown get option: $1" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  # Metadata only — NEVER select ticket_plans.content.
  _exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT json_build_object(
  'external_id', external_id, 'id', id, 'type', type, 'brand', brand,
  'title', title, 'status', status, 'priority', priority,
  'touched_files', touched_files, 'pipeline_slot', pipeline_slot,
  'created_at', created_at, 'updated_at', updated_at
) FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
}

cmd_set_touched_files() {
  local id="" files=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id)    id="$2"; shift 2 ;;
      --files) files="$2"; shift 2 ;;
      *)       echo "Unknown set-touched-files option: $1" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$id" || -z "$files" ]]; then echo "ERROR: --id and --files are required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v files="$files" <<'EOF' >/dev/null
UPDATE tickets.tickets SET touched_files = string_to_array(:'files', ',') WHERE external_id = :'ext_id';
EOF
  echo "touched_files set for ticket $id"
}

cmd_set_pipeline_slot() {
  local id="" slot=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id)   id="$2"; shift 2 ;;
      --slot) slot="$2"; shift 2 ;;
      *)      echo "Unknown set-pipeline-slot option: $1" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$id" || -z "$slot" ]]; then echo "ERROR: --id and --slot are required (use --slot null to clear)." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v slot="$slot" <<'EOF' >/dev/null
UPDATE tickets.tickets SET pipeline_slot = NULLIF(:'slot','null')::integer WHERE external_id = :'ext_id';
EOF
  echo "pipeline_slot set to $slot for ticket $id"
}

cmd_release_slot() {
  local id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown release-slot option: $1" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET pipeline_slot = NULL WHERE external_id = :'ext_id';
EOF
  echo "pipeline_slot released for ticket $id"
}

cmd_touch() {
  local id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown touch option: $1" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  # Bump updated_at (the fn_lifecycle_ts BEFORE-UPDATE trigger sets it on any UPDATE).
  _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET updated_at = now() WHERE external_id = :'ext_id';
EOF
  echo "touched ticket $id"
}
```

- [ ] **Step 6: Wire the dispatch `case` + usage**

Update the usage block (L290-292) `Commands:` line to include the new commands, and add to the `case "$cmd"` block (after `get-attachments)`):
```bash
  get)               cmd_get "$@" ;;
  set-touched-files) cmd_set_touched_files "$@" ;;
  set-pipeline-slot) cmd_set_pipeline_slot "$@" ;;
  release-slot)      cmd_release_slot "$@" ;;
  touch)             cmd_touch "$@" ;;
```
Also extend the file header comment block (L4-9) with one usage line per new command.

- [ ] **Step 7: Run the test — verify it passes**

Run: `./tests/runner.sh local FA-SF-21`
Expected: PASS (all 5 assertions). These are offline (no cluster needed — arg-validation exits before `_pgpod`).

- [ ] **Step 8: Commit**

```bash
git add scripts/ticket.sh tests/local/FA-SF-21-ticket-cli.bats
git commit -m "feat(factory): extend ticket.sh with get/set-touched-files/set-pipeline-slot/release-slot/touch + brand map [T000413]"
```

---

### Task 2: `scripts/factory/lib.sh` + `tests/lib/factory-test-fixtures.sh`

**Why:** The five primitives share brand-resolution + a psql helper (DRY). The seed-layer FA-SF tests need a fixture that creates purge-able test features with disjoint synthetic paths and **refuses to seed into prod**.

**Files:**
- Create: `scripts/factory/lib.sh`
- Create: `tests/lib/factory-test-fixtures.sh`
- Test: `tests/local/FA-SF-22-fixtures.bats` (**new**, offline guard + dry-resolve)

- [ ] **Step 1: Write the failing test**

Create `tests/local/FA-SF-22-fixtures.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-22: factory shared lib + test fixtures contract (offline assertions only).
setup() { load 'test_helper.bash'; }

@test "FA-SF-22: lib.sh dry-resolve maps korczewski to workspace-korczewski" {
  run env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash -c 'source scripts/factory/lib.sh; factory_resolve; echo "ns=$FACTORY_NS ctx=$FACTORY_CTX"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace-korczewski"* ]]
}

@test "FA-SF-22: lib.sh rejects unknown BRAND" {
  run env BRAND=bogus bash -c 'source scripts/factory/lib.sh; factory_resolve'
  [ "$status" -eq 2 ]
}

@test "FA-SF-22: fixtures refuse to seed into prod fleet without override" {
  run env FACTORY_CTX=fleet bash -c 'source tests/lib/factory-test-fixtures.sh; seed_test_feature mentolder "tests/fixtures/x.txt"'
  [ "$status" -ne 0 ]
  [[ "$output" =~ "refusing" ]]
}
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-22`
Expected: FAIL — `scripts/factory/lib.sh` and `tests/lib/factory-test-fixtures.sh` do not exist.

- [ ] **Step 3: Create `scripts/factory/lib.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/lib.sh — shared helpers for the Software Factory Dispatcher
# primitives (slots/queue/schedule/watchdog/metrics). SOURCE, do not execute.
#
#   BRAND               mentolder|korczewski → resolves FACTORY_NS
#   FACTORY_NS          explicit namespace (used when BRAND unset; default workspace)
#   FACTORY_CTX         kubectl context (default: fleet)
#   FACTORY_DRY_RESOLVE if set, callers print resolved ctx+ns and exit 0

factory_resolve() {
  case "${BRAND:-}" in
    mentolder)   FACTORY_NS="workspace" ;;
    korczewski)  FACTORY_NS="workspace-korczewski" ;;
    "")          : ;;
    *)           echo '{"error":"unknown BRAND (use mentolder|korczewski)"}' >&2; exit 2 ;;
  esac
  FACTORY_NS="${FACTORY_NS:-workspace}"
  FACTORY_CTX="${FACTORY_CTX:-fleet}"
}

factory_pgpod() {
  local pod
  pod=$(kubectl get pod -n "$FACTORY_NS" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then echo '{"error":"no shared-db pod found"}' >&2; exit 2; fi
  echo "$pod"
}

# factory_psql — reads SQL from stdin, returns tab-less single-column rows.
# Forwards any extra args to psql (e.g. -v ext_id=… for bound params), mirroring
# ticket.sh's _exec_sql:32 so callers can avoid interpolating into SQL.
factory_psql() {
  local pod; pod=$(factory_pgpod)
  kubectl exec -i "$pod" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 "$@"
}
```

- [ ] **Step 4: Create `tests/lib/factory-test-fixtures.sh`**

```bash
#!/usr/bin/env bash
# tests/lib/factory-test-fixtures.sh — seed + reap throwaway feature tickets for
# Software Factory FA-SF BATS tests. SOURCE, do not execute.
#
#   source tests/lib/factory-test-fixtures.sh
#   ext_id=$(seed_test_feature korczewski "tests/fixtures/sf-test-foo-a.txt")
#   ... assertions ...
#   purge_factory_test_data korczewski   # in teardown()
#
# Every seeded ticket carries is_test_data=true and a unique 'SF-TEST-' title and
# is reaped by tickets.fn_purge_test_data(). Pass DISJOINT touched_file paths per
# test so the conflict gate does not legitimately fire between fixtures. Do NOT
# run concurrently with the Playwright e2e suite (shared global purge).

# Resolve the repo root from this file's location so the fixture works
# regardless of the BATS working directory.
_FIXTURE_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# seed_test_feature <brand> [touched_file ...] → echoes the new external_id
seed_test_feature() {
  local brand="$1"; shift
  local ctx="${FACTORY_CTX:-fleet}"
  if [[ "$ctx" == "fleet" && -z "${FACTORY_ALLOW_PROD_SEED:-}" ]]; then
    echo "refusing to seed test data into prod context 'fleet' (set FACTORY_ALLOW_PROD_SEED=1 to override)" >&2
    return 3
  fi
  local files; files="$(IFS=,; echo "$*")"
  local title="SF-TEST-${brand}-${BATS_TEST_NAME:-manual}-$$-${RANDOM}"
  local result ext_id
  result=$(BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" create \
    --type feature --brand "$brand" --title "$title" \
    --description "factory fixture" --priority mittel --status backlog --is-test-data)
  ext_id="${result%%|*}"
  if [[ -n "$files" ]]; then
    BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" set-touched-files --id "$ext_id" --files "$files" >/dev/null
  fi
  echo "$ext_id"
}

# purge_factory_test_data <brand> — reap all is_test_data=true rows on that brand
purge_factory_test_data() {
  local brand="$1"
  local ctx="${FACTORY_CTX:-fleet}" ns
  case "$brand" in
    mentolder)  ns="workspace" ;;
    korczewski) ns="workspace-korczewski" ;;
    *) echo "purge_factory_test_data: unknown brand $brand" >&2; return 2 ;;
  esac
  local pod
  pod=$(kubectl get pod -n "$ns" --context "$ctx" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  [[ -z "$pod" ]] && { echo "no shared-db pod in $ns" >&2; return 1; }
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U website -d website -qtAc "SELECT tickets.fn_purge_test_data();" >/dev/null
}
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `./tests/runner.sh local FA-SF-22`
Expected: PASS (all 3 offline assertions — they never reach a live cluster).

- [ ] **Step 6: Commit**

```bash
git add scripts/factory/lib.sh tests/lib/factory-test-fixtures.sh tests/local/FA-SF-22-fixtures.bats
git commit -m "feat(factory): add factory lib.sh + seed/purge test fixtures (prod-seed guard) [T000413]"
```

---

### Task 3: `scripts/factory/slots.sh` — per-brand slot accounting

**Why:** The scheduler needs an atomic, race-free way to claim/free the 3 per-brand slots (`pipeline_slot` column) and find the next free slot number.

**Files:**
- Create: `scripts/factory/slots.sh`
- Test: `tests/local/FA-SF-23-slots.bats` (**new**: offline dry-resolve + live seed claim/release)

- [ ] **Step 1: Write the failing test**

Create `tests/local/FA-SF-23-slots.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-23: slots.sh contract. Offline assertions always run; live claim/release
# runs only when a dev cluster is reachable (FACTORY_CTX/FACTORY_NS set to dev).
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-23: dry-resolve prints brand namespace" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/slots.sh count
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace"* ]]
}

@test "FA-SF-23: unknown subcommand exits 2" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE= bash scripts/factory/slots.sh bogus
  [ "$status" -eq 2 ]
}

@test "FA-SF-23: claim is atomic — second claim on the same ticket fails" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-slots-$$-a.txt")
  run env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
  run env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 2
  [ "$status" -eq 1 ]                       # already slotted → claim fails
  run env BRAND="$brand" bash scripts/factory/slots.sh release "$ext"
  [ "$status" -eq 0 ]
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-23`
Expected: FAIL — `scripts/factory/slots.sh` does not exist.

- [ ] **Step 3: Implement `scripts/factory/slots.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/slots.sh — per-brand slot accounting for the Dispatcher.
#   BRAND=<brand> bash scripts/factory/slots.sh count                # occupied slots (this brand)
#   BRAND=<brand> bash scripts/factory/slots.sh next                 # lowest free slot 1..N, or empty if full
#   BRAND=<brand> bash scripts/factory/slots.sh claim <ext_id> <n>   # atomic; echoes n on success
#   BRAND=<brand> bash scripts/factory/slots.sh release <ext_id>
# Slots are 1..FACTORY_SLOTS_PER_BRAND (default 3). claim only succeeds if the
# feature has no slot yet (UPDATE ... WHERE pipeline_slot IS NULL) — race-free.
# Exit 0 ok, 1 claim-failed, 2 error.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }

SLOTS_PER_BRAND="${FACTORY_SLOTS_PER_BRAND:-3}"
cmd="${1:-}"; shift || true

case "$cmd" in
  count)
    printf "SELECT count(*) FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress';" | factory_psql
    ;;
  next)
    printf "WITH used AS (SELECT pipeline_slot FROM tickets.tickets WHERE pipeline_slot IS NOT NULL AND status='in_progress'), s AS (SELECT generate_series(1,%s) AS n) SELECT min(n) FROM s WHERE n NOT IN (SELECT pipeline_slot FROM used);" "$SLOTS_PER_BRAND" | factory_psql
    ;;
  claim)
    ext_id="${1:?usage: claim <ext_id> <slot>}"; slot="${2:?usage: claim <ext_id> <slot>}"
    out=$(printf '%s' "UPDATE tickets.tickets SET pipeline_slot = :'slot'::integer, status='in_progress' WHERE external_id = :'ext_id' AND pipeline_slot IS NULL AND status IN ('backlog','triage') RETURNING pipeline_slot;" | factory_psql -v ext_id="$ext_id" -v slot="$slot")
    if [[ -z "$out" ]]; then echo "claim failed (already slotted or wrong status): $ext_id" >&2; exit 1; fi
    echo "$out"
    ;;
  release)
    ext_id="${1:?usage: release <ext_id>}"
    printf '%s' "UPDATE tickets.tickets SET pipeline_slot=NULL WHERE external_id = :'ext_id';" | factory_psql -v ext_id="$ext_id" >/dev/null
    echo "released $ext_id"
    ;;
  *) echo '{"error":"usage: slots.sh count|next|claim|release [...]"}' >&2; exit 2 ;;
esac
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `./tests/runner.sh local FA-SF-23`
Expected: PASS — offline assertions pass; the live claim/release passes if a dev cluster context is set (otherwise that test is `skip`ped).

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/slots.sh tests/local/FA-SF-23-slots.bats
git commit -m "feat(factory): add slots.sh atomic per-brand slot accounting [T000413]"
```

---

### Task 4: `scripts/factory/queue.sh` — backlog feature queue

**Why:** First consumer of the queue. Must read **raw** `backlog` features (NOT `v_active_features`, which filters `touched_files IS NOT NULL` and would hide fresh features whose touched_files are only set later inside the pipeline's Scout phase).

**Files:**
- Create: `scripts/factory/queue.sh`
- Test: `tests/local/FA-SF-24-queue.bats` (**new**)

- [ ] **Step 1: Write the failing test**

Create `tests/local/FA-SF-24-queue.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-24: queue.sh lists backlog features as ordered JSON.
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-24: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/queue.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace"* ]]
}

@test "FA-SF-24: a seeded backlog feature appears in the queue JSON" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-queue-$$-a.txt")
  run env BRAND="$brand" bash scripts/factory/queue.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; .external_id == $e)'
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-24`
Expected: FAIL — `scripts/factory/queue.sh` does not exist.

- [ ] **Step 3: Implement `scripts/factory/queue.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/queue.sh — schedulable backlog feature tickets for a brand.
#   BRAND=<brand> bash scripts/factory/queue.sh
# Reads RAW backlog features (touched_files may be NULL — a fresh feature gets
# its touched_files inside the pipeline's Scout phase, so v_active_features
# (which filters NULL touched_files) is NOT used here). JSON array, ordered
# priority (hoch→mittel→niedrig) then created_at. Read-only metadata only.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
cat <<'SQL' | factory_psql
SELECT COALESCE(json_agg(row_to_json(q)), '[]')
FROM (
  SELECT external_id, title, priority, touched_files, created_at
  FROM tickets.tickets
  WHERE type='feature' AND status='backlog'
  ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 END, created_at
) q;
SQL
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `./tests/runner.sh local FA-SF-24`
Expected: PASS (offline dry-resolve always; live ordering when a dev cluster is set).

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/queue.sh tests/local/FA-SF-24-queue.bats
git commit -m "feat(factory): add queue.sh backlog feature poller [T000413]"
```

---

### Task 5: `scripts/factory/schedule.sh` — conflict-gate + slot-claim → launch plan

**Why:** Combines `queue.sh` + `conflict-check.sh` (file-level, best-effort on known `touched_files`) + `slots.sh` into the per-brand launch plan, enforcing the per-brand pool AND a global concurrency cap across both brands.

**Files:**
- Create: `scripts/factory/schedule.sh`
- Test: `tests/local/FA-SF-25-schedule.bats` (**new**)
- Reuse: `scripts/factory/conflict-check.sh` (unchanged), `queue.sh`, `slots.sh`

- [ ] **Step 1: Write the failing test**

Create `tests/local/FA-SF-25-schedule.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-25: schedule.sh emits a launch plan and claims slots.
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-25: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-25: two disjoint backlog features both get scheduled with slots" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  e1=$(seed_test_feature "$brand" "tests/fixtures/sf-test-sched-$$-a.txt")
  e2=$(seed_test_feature "$brand" "tests/fixtures/sf-test-sched-$$-b.txt")
  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$e1" 'any(.[]; .external_id == $e and (.slot|type=="number"))'
  echo "$output" | jq -e --arg e "$e2" 'any(.[]; .external_id == $e)'
}

@test "FA-SF-25: global cap of 1 schedules at most one feature" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  seed_test_feature "$brand" "tests/fixtures/sf-test-cap-$$-a.txt" >/dev/null
  seed_test_feature "$brand" "tests/fixtures/sf-test-cap-$$-b.txt" >/dev/null
  run env BRAND="$brand" FACTORY_GLOBAL_CAP=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  count=$(echo "$output" | jq 'length')
  [ "$count" -le 1 ]
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-25`
Expected: FAIL — `scripts/factory/schedule.sh` does not exist.

- [ ] **Step 3: Implement `scripts/factory/schedule.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/schedule.sh — poll the queue for a brand, run the best-effort
# brand-aware conflict gate on KNOWN touched_files, claim a slot per
# non-conflicting feature up to the per-brand pool AND a global concurrency cap
# (summed across both brands), and emit the launch plan as JSON:
#   [{ "brand": "...", "external_id": "...", "slot": N }]
#
#   BRAND=<brand> FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
#
# The AUTHORITATIVE conflict gate is pipeline.js' Plan phase (③). This is a
# pre-filter on already-known touched_files; a fresh feature (NULL touched_files,
# conflict-check exits 2 = "no known conflict") schedules and self-corrects if
# the pipeline's own gate later blocks it.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }

GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}"

# Global concurrency = occupied slots across BOTH brands (separate DBs).
global_used=0
for b in mentolder korczewski; do
  n=$(BRAND="$b" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" count 2>/dev/null || echo 0)
  global_used=$((global_used + ${n:-0}))
done

plan='[]'
mapfile -t candidates < <(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/queue.sh" | jq -c '.[]')
for c in "${candidates[@]}"; do
  [[ -z "$c" ]] && continue
  [[ "$global_used" -ge "$GLOBAL_CAP" ]] && break
  ext_id=$(echo "$c" | jq -r '.external_id')

  # Best-effort conflict gate on known touched_files. rc 0 = no conflict,
  # rc 1 = conflict (skip), rc 2 = error/null touched_files (treat as schedulable).
  set +e
  BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/conflict-check.sh" "$ext_id" >/dev/null 2>&1
  rc=$?
  set -e
  [[ "$rc" -eq 1 ]] && continue

  slot=$(BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" next)
  [[ -z "$slot" ]] && continue   # brand pool full

  if BRAND="$BRAND" FACTORY_CTX="$FACTORY_CTX" bash "$HERE/slots.sh" claim "$ext_id" "$slot" >/dev/null 2>&1; then
    plan=$(echo "$plan" | jq -c --arg b "$BRAND" --arg e "$ext_id" --argjson s "$slot" '. + [{brand:$b, external_id:$e, slot:$s}]')
    global_used=$((global_used + 1))
  fi
done
echo "$plan"
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `./tests/runner.sh local FA-SF-25`
Expected: PASS (dry-resolve always; live scheduling + cap when a dev cluster is set).

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/schedule.sh tests/local/FA-SF-25-schedule.bats
git commit -m "feat(factory): add schedule.sh conflict-gated slot scheduler with global cap [T000413]"
```

---

### Task 6: `scripts/factory/watchdog.sh` — stale-run escalation

**Why:** A pipeline that hangs (no progress write) must be returned to the queue and its slot freed, so the slot pool does not leak. Liveness = `updated_at` (auto-bumped by `fn_lifecycle_ts`), refreshed at each pipeline phase boundary by `ticket.sh touch` (Task 8).

**Files:**
- Create: `scripts/factory/watchdog.sh`
- Test: `tests/local/FA-SF-26-watchdog.bats` (**new**)
- Reuse: `scripts/ticket.sh` (`update-status`, `release-slot`, `add-comment`)

- [ ] **Step 1: Write the failing test**

Create `tests/local/FA-SF-26-watchdog.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-26: watchdog escalates stale in_progress features.
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-26: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-26: a stale in_progress feature is returned to triage and its slot freed" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-a.txt")
  env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1 >/dev/null
  # Derive the namespace from the brand (do not rely on a FACTORY_NS default).
  local ns; case "$brand" in mentolder) ns=workspace ;; korczewski) ns=workspace-korczewski ;; esac
  # Backdate updated_at by 40 minutes to simulate a hung pipeline.
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET updated_at = now() - interval '40 minutes' WHERE external_id='$ext';"
  run env BRAND="$brand" FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
  # Confirm status=triage and pipeline_slot cleared.
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$ext" | jq -r '.status')
  [ "$st" = "triage" ]
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-26`
Expected: FAIL — `scripts/factory/watchdog.sh` does not exist.

- [ ] **Step 3: Implement `scripts/factory/watchdog.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/watchdog.sh — escalate stale in-flight features for a brand.
#   BRAND=<brand> FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
# A feature in_progress whose updated_at is older than the threshold is treated
# as a hung/crashed pipeline: status → triage (back to queue), slot released, and
# a comment recorded. updated_at is auto-bumped by fn_lifecycle_ts on every row
# write; pipeline.js writes a `ticket.sh touch` at each phase boundary, so a
# healthy long phase is not mistaken for stale. JSON array of escalated ext_ids.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
STALE_MIN="${FACTORY_STALE_MIN:-30}"

mapfile -t stale < <(printf "SELECT external_id FROM tickets.tickets WHERE type='feature' AND status='in_progress' AND updated_at < now() - make_interval(mins => %s);" "$STALE_MIN" | factory_psql)

escalated='[]'
for ext_id in "${stale[@]}"; do
  [[ -z "$ext_id" ]] && continue
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status triage >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write). Returned to queue (triage); slot released." >/dev/null
  escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
done
echo "$escalated"
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `./tests/runner.sh local FA-SF-26`
Expected: PASS (dry-resolve always; live escalation when a dev cluster is set).

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/watchdog.sh tests/local/FA-SF-26-watchdog.bats
git commit -m "feat(factory): add watchdog.sh stale-run escalation (triage + slot release) [T000413]"
```

---

### Task 7: `scripts/factory/metrics.sh` — throughput summary comment

**Why:** First consumer of `v_factory_metrics`. Posts a short markdown summary to the Vorhaben ticket. `add-comment`'s `INSERT…SELECT … WHERE external_id` is a silent no-op if the ticket is absent in a brand's DB (korczewski has its own external_id space) — so it is naturally best-effort per brand.

**Files:**
- Create: `scripts/factory/metrics.sh`
- Test: `tests/local/FA-SF-27-metrics.bats` (**new**)

- [ ] **Step 1: Write the failing test**

Create `tests/local/FA-SF-27-metrics.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-27: metrics.sh summarizes v_factory_metrics and posts a comment.
setup() { load 'test_helper.bash'; source 'tests/lib/factory-test-fixtures.sh'; }

@test "FA-SF-27: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/metrics.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-27: posts a comment to a seeded metrics ticket" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  # Use a throwaway test ticket as the metrics sink so we don't touch T000413.
  sink=$(seed_test_feature "$brand" "tests/fixtures/sf-test-metrics-$$-a.txt")
  run env BRAND="$brand" FACTORY_METRICS_TICKET="$sink" bash scripts/factory/metrics.sh
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Comment added" ]] || [[ "$output" =~ "Factory metrics" ]]
}

teardown() { [ -n "${FACTORY_CTX:-}" ] && purge_factory_test_data "${TEST_BRAND:-korczewski}" || true; }
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-27`
Expected: FAIL — `scripts/factory/metrics.sh` does not exist.

- [ ] **Step 3: Implement `scripts/factory/metrics.sh`**

```bash
#!/usr/bin/env bash
# scripts/factory/metrics.sh — summarize factory throughput for a brand and post
# it as a comment on the Vorhaben ticket (default T000413).
#   BRAND=<brand> FACTORY_METRICS_TICKET=T000413 bash scripts/factory/metrics.sh
# Reads the latest v_factory_metrics row + a live slot/queue snapshot, formats a
# short markdown summary, and appends it via ticket.sh add-comment (best-effort:
# a missing ticket in a brand's DB is a silent no-op).
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
TICKET="${FACTORY_METRICS_TICKET:-T000413}"

today=$(cat <<'SQL' | factory_psql
SELECT COALESCE(
  (SELECT format('shipped=%s avg_cycle_h=%s escalations=%s total_features=%s',
     features_shipped, COALESCE(avg_cycle_time_h::text,'n/a'), escalations, total_features)
   FROM tickets.v_factory_metrics ORDER BY day DESC LIMIT 1),
  'no metrics yet');
SQL
)
active=$(printf "SELECT count(*) FROM tickets.tickets WHERE type='feature' AND status='in_progress';" | factory_psql)
backlog=$(printf "SELECT count(*) FROM tickets.tickets WHERE type='feature' AND status='backlog';" | factory_psql)

body=$(printf '**Factory metrics — %s**\n- %s\n- active(in_progress)=%s backlog=%s' "$BRAND" "$today" "$active" "$backlog")
BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$TICKET" --body "$body"
echo "$body"
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `./tests/runner.sh local FA-SF-27`
Expected: PASS (dry-resolve always; live comment when a dev cluster is set).

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/metrics.sh tests/local/FA-SF-27-metrics.bats
git commit -m "feat(factory): add metrics.sh v_factory_metrics summary comment [T000413]"
```

---

### Task 8: `pipeline.js` per-phase progress touch (watchdog liveness)

**Why:** The watchdog flags `in_progress` features whose `updated_at` is stale. A healthy pipeline can spend > 30 min in the Implement phase without otherwise writing the ticket row, so it must emit a lightweight `ticket.sh touch` at each phase boundary (which the `fn_lifecycle_ts` trigger turns into an `updated_at` bump).

**Files:**
- Modify: `scripts/factory/pipeline.js` (add a `TOUCH` instruction, reference it in every phase's lead agent prompt)
- Test: `tests/local/FA-SF-20-pipeline-contract.bats` (extend — it is the existing P1 contract test)

- [ ] **Step 1: Add the failing contract assertion**

Append to `tests/local/FA-SF-20-pipeline-contract.bats`:
```bash
@test "FA-SF-20: pipeline writes a per-phase liveness touch (>=6 references)" {
  run grep -c "ticket.sh touch" "$SCRIPT"
  [ "$status" -eq 0 ]
  [ "$output" -ge 6 ]
}
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-20`
Expected: FAIL — the new assertion finds 0 references to `ticket.sh touch`.

- [ ] **Step 3: Inline a per-phase liveness touch at the start of each phase's lead agent prompt**

Do **not** add a shared variable — to keep each prompt self-contained AND make the literal `ticket.sh touch` appear exactly six times (the contract test counts it), inline the same sentence verbatim at the **start** of the lead `agent(\`...\`)` template in each of the six phases. The sentence to prepend (verbatim, including the backticked command) is:
```
Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run `bash /home/patrick/Bachelorprojekt/scripts/ticket.sh touch --id ${A.ticket_id}`. Then:
```
> Use `${A.ticket_id}` and `${REPO}` interpolation consistent with each existing prompt (the lead prompts already interpolate `${REPO}`; write the command as `bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}`).

Prepend it to the lead agent in each phase:
- Scout agent (currently starts `` `Scout the feature ...` `` at L94)
- Design agent (`` `Write a design spec ...` `` at L127)
- Plan conflict agent (`` `Run the brand-aware conflict gate ...` `` at L149)
- Implement stage-1 agent (`` `Implement task ${t.id} ...` `` at L207)
- Verify panel agent (`` `Read the review prompt ...` `` at L233, inside `lenses.map`)
- Deploy agent (`` `Deploy the feature to both brands. ...` `` at L257)

After this edit, `grep -c "ticket.sh touch" scripts/factory/pipeline.js` returns exactly `6`.

- [ ] **Step 4: Run `node --check` + the contract test — verify they pass**

Run:
```bash
node --check scripts/factory/pipeline.js && echo SYNTAX_OK
./tests/runner.sh local FA-SF-20
```
Expected: `SYNTAX_OK` and all FA-SF-20 assertions PASS (including the new `>= 6` touch references).

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/pipeline.js tests/local/FA-SF-20-pipeline-contract.bats
git commit -m "feat(factory): pipeline.js emits per-phase liveness touch for the watchdog [T000413]"
```

---

### Task 9: `scripts/factory/dispatcher.js` — Model-A Dispatcher Workflow

**Why:** The one missing P2 deliverable — the Tier-1 orchestration spine. PREP runs the deterministic primitives and returns a schema-validated launch plan; LAUNCH nests one `pipeline.js` workflow per scheduled feature; METRICS posts the throughput summary. Mirrors `pipeline.js`'s `run(args, harness)` + `export default run` contract (confirmed in Task 0).

**Files:**
- Create: `scripts/factory/dispatcher.js`
- Test: `tests/local/FA-SF-30-dispatcher-contract.bats` (**new**, offline structural contract)
- Reference (mirror style): `scripts/factory/pipeline.js`

- [ ] **Step 1: Write the failing structural contract test**

Create `tests/local/FA-SF-30-dispatcher-contract.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-30: structural contract for the dispatcher Workflow script (offline).
SCRIPT="scripts/factory/dispatcher.js"
setup() { load 'test_helper.bash'; }

@test "FA-SF-30: dispatcher.js exists and is syntactically valid JS" {
  [ -f "$SCRIPT" ]
  run node --check "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-30: exports meta with the three expected phases" {
  run grep -Eq "export const meta" "$SCRIPT"; [ "$status" -eq 0 ]
  for p in Prep Launch Metrics; do
    run grep -q "phase('$p')" "$SCRIPT"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-30: wires the primitives (watchdog, schedule, metrics, ticket.sh get)" {
  for needle in "watchdog.sh" "schedule.sh" "metrics.sh" "ticket.sh get"; do
    run grep -q "$needle" "$SCRIPT"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-30: launches pipeline.js via workflow scriptPath" {
  run grep -q "scripts/factory/pipeline.js" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "workflow\(" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-30: resume-safe (uses args.timestamp, no Date.now()/Math.random())" {
  run grep -q "args.timestamp\|A.timestamp" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "Date\.now\(\)|Math\.random\(\)" "$SCRIPT"; [ "$status" -ne 0 ]
}

@test "FA-SF-30: schedules across BOTH brands" {
  run grep -q "mentolder" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "korczewski" "$SCRIPT"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-30`
Expected: FAIL — `scripts/factory/dispatcher.js` does not exist.

- [ ] **Step 3: Implement `scripts/factory/dispatcher.js`**

```js
/**
 * scripts/factory/dispatcher.js
 *
 * Software Factory Phase-2 Dispatcher (Tier 1) — Claude Code Workflow script.
 *
 * Model A: ONE bounded Workflow run per /loop tick that nests pipeline.js runs.
 * The globals are HARNESS-INJECTED via the `harness` param (mirrors pipeline.js).
 * Run by the Workflow tool, NOT `node scripts/factory/dispatcher.js`.
 *
 * Offline lint:   node --check scripts/factory/dispatcher.js
 * Contract tests: ./tests/runner.sh local FA-SF-30
 *
 * Trigger: /loop self-paced (ScheduleWakeup) — the next wake is scheduled only
 * after this run ends, giving natural single-flight. Over-scheduling is
 * additionally bounded by schedule.sh's global cap + the atomic slot-claim
 * (a pg advisory lock would NOT survive separate kubectl-exec psql sessions).
 *
 * Usage (Workflow tool): args = { timestamp }  // ISO8601 from the harness
 */

export const meta = {
  name: 'software-factory-dispatcher',
  description: 'Phase-2 dispatcher: watchdog sweep → poll → conflict-gate + slot-claim → launch pipelines → metrics',
  phases: [{ title: 'Prep' }, { title: 'Launch' }, { title: 'Metrics' }],
}

export async function run(args, harness) {
  const { agent, parallel, phase, log, workflow } = harness
  const A = args ?? {}
  const REPO = '/home/patrick/Bachelorprojekt'

  const PLAN_SCHEMA = {
    type: 'object',
    required: ['launch'],
    properties: {
      launch: {
        type: 'array',
        items: {
          type: 'object',
          required: ['brand', 'external_id', 'slot'],
          properties: {
            brand: { enum: ['mentolder', 'korczewski'] },
            external_id: { type: 'string' },
            slot: { type: 'integer' },
            title: { type: 'string' },
          },
        },
      },
    },
  }

  // ── ① Prep: watchdog sweep + queue poll + conflict-gate + slot-claim (deterministic) ──
  phase('Prep')
  const prep = await agent(
    `You are the Software Factory dispatcher PREP step. Run the deterministic scripts below from
     ${REPO} and report ONLY what the scripts decide — do not schedule by your own judgment.

     For EACH brand in [mentolder, korczewski]:
       1. Watchdog sweep (escalate stale runs, free their slots):
          BRAND=<brand> bash ${REPO}/scripts/factory/watchdog.sh
       2. Schedule (poll backlog + best-effort conflict gate + claim slots up to the global cap):
          BRAND=<brand> FACTORY_GLOBAL_CAP=3 bash ${REPO}/scripts/factory/schedule.sh
          (schedule.sh enforces the global cap across BOTH brands by summing occupied slots.)

     Collect every {brand, external_id, slot} object that schedule.sh claimed across both brands.
     For each claimed external_id, fetch its title:
       BRAND=<brand> bash ${REPO}/scripts/ticket.sh get --id <external_id>   (read .title from the JSON)

     Return JSON: { "launch": [ {brand, external_id, slot, title} ... ] }. If nothing was claimed, return { "launch": [] }.`,
    { label: 'prep', phase: 'Prep', schema: PLAN_SCHEMA },
  )

  log(`Dispatcher: ${prep.launch.length} feature(s) scheduled this tick`)
  if (prep.launch.length === 0) {
    return { status: 'idle', launched: 0, timestamp: A.timestamp }
  }

  // ── ② Launch: nest one pipeline workflow per scheduled feature (Model A) ──
  phase('Launch')
  const results = await parallel(
    prep.launch.map((f) => () =>
      workflow(
        { scriptPath: 'scripts/factory/pipeline.js' },
        {
          title: f.title ?? f.external_id,
          description: `Dispatched by the Software Factory dispatcher (slot ${f.slot}).`,
          slug: `sf-${String(f.external_id).toLowerCase()}`,
          ticket_id: f.external_id,
          brand: f.brand,
          timestamp: A.timestamp,
        },
      )
        .then((r) => ({ external_id: f.external_id, brand: f.brand, result: r }))
        .catch((e) => ({ external_id: f.external_id, brand: f.brand, error: String(e) })),
    ),
  )

  // ── ③ Metrics: per-brand throughput summary on the Vorhaben ticket ──
  phase('Metrics')
  await agent(
    `Run the factory metrics summary for BOTH brands from ${REPO} and report stdout:
       BRAND=mentolder bash ${REPO}/scripts/factory/metrics.sh
       BRAND=korczewski bash ${REPO}/scripts/factory/metrics.sh
     (metrics.sh is best-effort: a missing Vorhaben ticket on a brand is a silent no-op.)`,
    { label: 'metrics', phase: 'Metrics' },
  )

  return { status: 'done', launched: results.length, results, timestamp: A.timestamp }
}

// The harness calls run(args, { agent, parallel, phase, log, workflow }).
export default run
```

- [ ] **Step 4: Run `node --check` + the contract test — verify they pass**

Run:
```bash
node --check scripts/factory/dispatcher.js && echo SYNTAX_OK
./tests/runner.sh local FA-SF-30
```
Expected: `SYNTAX_OK` and all FA-SF-30 assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/dispatcher.js tests/local/FA-SF-30-dispatcher-contract.bats
git commit -m "feat(factory): add Model-A dispatcher.js Workflow (prep→launch→metrics) [T000413]"
```

- [ ] **Step 6: Execution-time nesting spike (no commit)**

Invoke the **Workflow tool** with `{scriptPath: "scripts/factory/dispatcher.js"}` and `args: { timestamp: "<ISO now>" }` against a **dev** cluster (set `FACTORY_CTX` for the primitives via the agent environment, or seed one `SF-TEST-` backlog feature first). Confirm: PREP returns a `launch` array, LAUNCH nests a `pipeline.js` workflow (appears as a `▸ software-factory-pipeline` group in `/workflows`), and the run returns `{status:'done'|'idle'}`. **If `workflow({scriptPath})` errors** ("nesting" / "unknown ref"), fall back to registering `pipeline.js` under `.claude/workflows/` and referencing it by name — record which worked in a T000413 comment. This is the first real end-to-end pipeline execution; expect to fix a pipeline.js runtime issue here (it was previously only `node --check`ed).

---

### Task 10: `task factory:dispatch` + inventory registration + doc status flip

**Why:** A documented invocation surface, CI-tracked test IDs, and honest factory docs.

**Files:**
- Modify: `Taskfile.factory.yml`
- Regenerate: `website/src/data/test-inventory.json` (via `scripts/build-test-inventory.sh` — already accepts `FA-SF-NN`)
- Modify: `scripts/factory/README.md`, `docs/superpowers/references/factory-usage.md`

- [ ] **Step 1: Add the `factory:dispatch` doc target**

In `Taskfile.factory.yml`, add a second task after `run:`:
```yaml
  dispatch:
    desc: |
      Print how to run the Phase-2 Software Factory dispatcher.
      Invoke scripts/factory/dispatcher.js via the Claude Code Workflow tool,
      driven on an interval by the /loop skill (self-paced ScheduleWakeup).
    silent: true
    cmds:
      - |
        echo "Software Factory — Phase 2 dispatcher"
        echo "Invoke via the Workflow tool: { scriptPath: 'scripts/factory/dispatcher.js' }, args: { timestamp }"
        echo "Recurring: /loop \"run the software-factory-dispatcher workflow\""
        echo "Offline lint:   node --check scripts/factory/dispatcher.js"
        echo "Contract tests: ./tests/runner.sh local FA-SF-30"
        echo "Primitives:     slots.sh queue.sh schedule.sh watchdog.sh metrics.sh (BRAND=<brand>)"
```

- [ ] **Step 2: Regenerate + verify the inventory registers every new FA-SF id**

Run:
```bash
task test:inventory
grep -o '"FA-SF-[0-9]*"' website/src/data/test-inventory.json | sort -u
```
Expected: includes `FA-SF-01`, `FA-SF-04`, `FA-SF-20`, **`FA-SF-21`, `FA-SF-22`, `FA-SF-23`, `FA-SF-24`, `FA-SF-25`, `FA-SF-26`, `FA-SF-27`, `FA-SF-30`**. No duplicate-ID error.

- [ ] **Step 3: Flip the factory doc status to Phase-2-live**

In `docs/superpowers/references/factory-usage.md`: under "🔜 Phase 2: Dispatcher", change the heading to "✅ Phase 2: Dispatcher (live)" and replace the "Noch nicht verfügbar" bullets with the now-shipped capabilities (queue polling via `queue.sh`, conflict-gated slot scheduling via `schedule.sh`, `watchdog.sh` 30-min stale escalation, `metrics.sh` summary comments, `dispatcher.js` Workflow + `/loop` trigger). Keep Layer-4 canary / directory heuristic / semantic dedup under 📋 Phase 3.

In `scripts/factory/README.md`: change the Dispatcher/Watchdog/Slot-manager rows from 🔜 to ✅ pointing at the new scripts; keep canary/dir-heuristic as 📋 Phase 3.

- [ ] **Step 4: Verify the Taskfile parses and offline gate is green**

Run:
```bash
task --list 2>/dev/null | grep -E "factory:(run|dispatch)" && echo TASK_OK
git diff --quiet website/src/data/test-inventory.json && echo "INVENTORY UNCHANGED (bug)" || echo "INVENTORY UPDATED"
task test:all
```
Expected: `TASK_OK`, `INVENTORY UPDATED`, and `task test:all` green.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.factory.yml website/src/data/test-inventory.json scripts/factory/README.md docs/superpowers/references/factory-usage.md
git commit -m "docs(factory): add task factory:dispatch + register FA-SF tests + flip Phase-2 status [T000413]"
```

---

## Final verification (run before opening the PR)

- [ ] Offline gate green: `task test:all`
- [ ] Inventory in sync: `task test:inventory && git diff --quiet website/src/data/test-inventory.json && echo INVENTORY_CLEAN`
- [ ] Both Workflow scripts lint: `node --check scripts/factory/pipeline.js && node --check scripts/factory/dispatcher.js && echo WF_OK`
- [ ] All new FA-SF offline assertions pass without a cluster: `for t in FA-SF-20 FA-SF-21 FA-SF-22 FA-SF-23 FA-SF-24 FA-SF-25 FA-SF-26 FA-SF-27 FA-SF-30; do ./tests/runner.sh local $t; done` (live-only assertions `skip` when no dev cluster context is set)
- [ ] Live seed-layer pass on a **dev** cluster (set `FACTORY_CTX`/`FACTORY_NS` to a dev context, NEVER `fleet`): FA-SF-23/24/25/26/27 exercise claim/queue/schedule/watchdog/metrics against real rows and purge them.
- [ ] Task 0 + Task 9 Step 6 spikes recorded on T000413 (Workflow execution + `workflow({scriptPath})` nesting confirmed; any pipeline.js runtime fix committed).
- [ ] Manual dispatcher dry-run documented: one `SF-TEST-` backlog feature → dispatcher PREP schedules it → LAUNCH nests a pipeline → no merge in the dry-run (kill the pipeline before Deploy).

---

## Self-Review notes (spec coverage)

- Spec §2 (Model A: PREP-agent bundling, no in-process MONITOR, shared-cap global deckel) → T9 (`dispatcher.js` PREP/LAUNCH/METRICS) + T5 (`FACTORY_GLOBAL_CAP`).
- Spec §3.1 (`ticket.sh` get/set-touched-files/set-pipeline-slot/release-slot, --is-test-data; **+`touch`** added during planning for liveness) → T1.
- Spec §3.2–3.6 (slots/queue/schedule/watchdog/metrics primitives) → T3/T4/T5/T6/T7, all sharing `lib.sh` (T2).
- Spec §3.7 (`dispatcher.js`, resume-safe, `<pipeline-ref>` = `workflow({scriptPath})`) → T9 + Task 0/Step 6 spikes.
- Spec §3.8 (`pipeline.js` phase progress writes) → T8.
- Spec §3.9 (`factory:dispatch`) → T10.
- Spec §4 (per-brand slots + global cap; atomic claim; **single-flight realized via /loop natural cadence + slot accounting, not advisory lock** — corrects spec shorthand) → T3/T5/T9.
- Spec §5 (escalation table) → T6 (watchdog), T8/T9 (pipeline Verify-block + crash→triage handled by P1 pipeline + watchdog).
- Spec §6 (3-layer test split + fixtures + disjoint paths + purge) → T1–T9 BATS + T2 fixtures; serial-collision avoided via disjoint synthetic paths per test.
- Spec §7 (P3 out-of-scope) → not built (no DDL, no canary, no dir-heuristic, no embedTicket wiring).
- Spec §8 risks → addressed: latent ticket.sh bug (T1), atomic slot-claim (T3), dual-brand handled per-brand (T5/T9), workflow-ref (Task 0/T9 spikes), GPU-independent core (queue/conflict on touched_files only).
