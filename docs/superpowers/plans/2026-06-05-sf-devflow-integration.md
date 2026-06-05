---
title: dev-flow ↔ Software Factory Integration — Implementation Plan
ticket_id: T000425
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# dev-flow ↔ Software Factory Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merged-but-never-run Software Factory actually execute (fix the IIFE no-op, add a safe dry-run, guard against regression), then connect it to the human dev-flow so a planned ticket can be handed off and its existing plan reused.

**Architecture:** Phase D fixes `pipeline.js`/`dispatcher.js` (both wrap their body in a fire-and-forget `;(async()=>{…})()` IIFE → the harness never awaits it → 0 agents run, return lost; verified empirically), adds `FACTORY_DRY_RUN`, a BATS structural guard, and a real nested-workflow execution smoke. Phase A adds a `ticket.sh enqueue` handoff, a plan-reuse entrypoint in `pipeline.js`, brand-aware conflict cross-visibility, and telemetry write-back. No DDL changes (schema owned by `website/src/lib/tickets-db.ts`).

**Tech Stack:** Claude Code Workflow scripts (JS, harness-injected globals), Bash CLIs over `kubectl exec … psql`, BATS offline tests, go-task.

---

## Worktree & git-crypt note

All work happens in the worktree `/tmp/wt-sf-devflow-integration` on branch `feature/sf-devflow-integration`. The repo is **git-crypt-locked**; every `git add`/`status`/`commit` in this worktree must inject the filter passthrough (no key needed):

```bash
export GIT_CONFIG_COUNT=3
export GIT_CONFIG_KEY_0=filter.git-crypt.clean    GIT_CONFIG_VALUE_0=cat
export GIT_CONFIG_KEY_1=filter.git-crypt.smudge   GIT_CONFIG_VALUE_1=cat
export GIT_CONFIG_KEY_2=filter.git-crypt.required GIT_CONFIG_VALUE_2=false
```

Stage **only** the files each task names (`git add <explicit paths>`) — never `git add -A` (it would try to re-clean the locked secrets).

---

## File Structure

| File | Tasks | Responsibility |
|---|---|---|
| `tests/local/FA-SF-31-workflow-entrypoint.bats` | D1 | Offline guard: forbids the IIFE no-op wrapper in factory workflow scripts |
| `scripts/factory/pipeline.js` | D2, D5, D7, A2, A6 | Unwrap IIFE; remove dead `update` fallback; dry-run Deploy branch; plan-reuse entrypoint; telemetry |
| `scripts/factory/dispatcher.js` | D2, D8, A3 | Unwrap IIFE; thread `dry_run`; pass plan-ref/branch to nested pipeline |
| `scripts/ticket-attach.sh` | D4 | Fix dead `mentolder` context default → `fleet` |
| `scripts/factory/README.md` | D6 | P2 status “geplant”→shipped; drop raw-SQL quickstart |
| `scripts/ticket.sh` | A1 | New `enqueue` subcommand; `get` returns `plan_ref` |
| `scripts/factory/conflict-check.sh` | A4 | Filter `type IN ('feature','task')` for cross-visibility |
| `.claude/skills/dev-flow-plan/SKILL.md` | A5 | “an Factory übergeben” option at the STOP point |
| `.claude/skills/dev-flow-execute/SKILL.md` | A5 | Record `touched_files` on the ticket |
| `Taskfile.factory.yml` | A5 | `factory:enqueue` wrapper; document `FACTORY_DRY_RUN` |
| `website/src/data/test-inventory.json` | D1 | Regenerated to register FA-SF-31 |

---

# MILESTONE D — Prove the factory runs

## Task D1: Structural guard FA-SF-31 (failing test first)

**Files:**
- Create: `tests/local/FA-SF-31-workflow-entrypoint.bats`
- Modify: `website/src/data/test-inventory.json` (regenerated)

- [x] **Step 1: Write the failing test**

Create `tests/local/FA-SF-31-workflow-entrypoint.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-31: factory Workflow scripts must NOT wrap their body in a fire-and-forget
# IIFE. The harness runs the script body and treats the run as complete when the
# top-level statements finish; a `;(async()=>{…})()` body is never awaited, so no
# agent() runs and the return is lost (verified: IIFE → 0 agents/22ms/undefined,
# top-level await → agents run + return propagates). Guard both runnable scripts.

@test "FA-SF-31: pipeline.js has no fire-and-forget async IIFE wrapper" {
  run grep -Eq '\(async[[:space:]]*\([[:space:]]*\)[[:space:]]*=>' scripts/factory/pipeline.js
  [ "$status" -ne 0 ]
  run grep -Eq '^[[:space:]]*\}\)\(\)[[:space:]]*$' scripts/factory/pipeline.js
  [ "$status" -ne 0 ]
}

@test "FA-SF-31: dispatcher.js has no fire-and-forget async IIFE wrapper" {
  run grep -Eq '\(async[[:space:]]*\([[:space:]]*\)[[:space:]]*=>' scripts/factory/dispatcher.js
  [ "$status" -ne 0 ]
  run grep -Eq '^[[:space:]]*\}\)\(\)[[:space:]]*$' scripts/factory/dispatcher.js
  [ "$status" -ne 0 ]
}

@test "FA-SF-31: both scripts still parse and use top-level await" {
  run node --check scripts/factory/pipeline.js;   [ "$status" -eq 0 ]
  run node --check scripts/factory/dispatcher.js; [ "$status" -eq 0 ]
  run grep -Eq 'await (agent|workflow|parallel|pipeline)\(' scripts/factory/pipeline.js;   [ "$status" -eq 0 ]
  run grep -Eq 'await (agent|workflow|parallel|pipeline)\(' scripts/factory/dispatcher.js; [ "$status" -eq 0 ]
}
```

- [x] **Step 2: Run it — expect FAIL (current code is IIFE-wrapped)**

Run: `./tests/runner.sh local FA-SF-31`
Expected: the first two tests FAIL (both scripts currently contain `;(async () => {` and `})()`).

- [x] **Step 3: Regenerate the test inventory**

Run: `task test:inventory`
Expected: `website/src/data/test-inventory.json` now contains an `FA-SF-31` entry.

- [x] **Step 4: Commit the (red) test + inventory**

```bash
git add tests/local/FA-SF-31-workflow-entrypoint.bats website/src/data/test-inventory.json
git commit -m "test(factory): add FA-SF-31 guard against fire-and-forget IIFE [T000425]"
```

---

## Task D2: Unwrap the IIFE in pipeline.js and dispatcher.js (make D1 green)

**Files:**
- Modify: `scripts/factory/pipeline.js` (remove wrapper open line 46 + final `})()`)
- Modify: `scripts/factory/dispatcher.js` (remove wrapper open line 28 + final `})()`)

- [x] **Step 1: Unwrap pipeline.js**

Delete the wrapper-open line (currently line 46):

```js
;(async () => {
```

…and the wrapper-close line at the end of the file:

```js
})()
```

The body (`const A = args ?? {}` … `return { status: 'done', … }`) is already at column 0, so removing exactly those two lines yields a canonical top-level workflow body. Do not change anything between them.

- [x] **Step 2: Unwrap dispatcher.js**

Delete the wrapper-open line (currently line 28) `;(async () => {` and the final `})()` (currently line 110). The body stays 2-space indented — that is cosmetically fine and `node --check` still passes; do not reformat further.

- [x] **Step 3: Verify the guard is green + syntax valid**

Run: `node --check scripts/factory/pipeline.js && node --check scripts/factory/dispatcher.js`
Expected: exit 0 for both.
Run: `./tests/runner.sh local FA-SF-31`
Expected: PASS (all three tests).
Run: `./tests/runner.sh local FA-SF-20 && ./tests/runner.sh local FA-SF-30`
Expected: PASS (the existing contract tests are unaffected).

- [x] **Step 4: Commit**

```bash
git add scripts/factory/pipeline.js scripts/factory/dispatcher.js
git commit -m "fix(factory): unwrap fire-and-forget IIFE so workflows actually run [T000425]"
```

---

## Task D3: Execution smoke — prove nesting end-to-end (manual Workflow checkpoint)

This is the real proof that D2 fixed the no-op. It runs via the **Workflow tool** (the harness), which is unavailable in BATS/CI, so it is a manual execution checkpoint, not an automated test.

- [x] **Step 1: Run the nested-workflow probe**

Using the Workflow tool, run this throwaway parent (it writes nothing to the repo):

```js
export const meta = { name: 'sf-nesting-smoke', description: 'prove workflow nesting runs + returns', phases: [{ title: 'Nest' }] }
phase('Nest')
const child = await workflow({ scriptPath: 'scripts/factory/pipeline.js' }, {
  title: 'smoke', description: 'smoke', slug: 'sf-smoke', ticket_id: 'SF-SMOKE',
  brand: 'mentolder', timestamp: '2026-06-05T00:00:00Z', dry_run: true,
})
return { childReturnType: typeof child, child: child ?? null }
```

- [x] **Step 2: Confirm the child actually executed**

Expected: `childReturnType === 'object'` and a non-null `child` (the pipeline returns `{status: 'dry-run', …}` once Task D7 lands — until then it returns `{status:'done'|'blocked', …}`). The decisive signal vs. the old no-op: the child run shows **>0 agents and seconds of duration** in `/workflows`, not 0 agents / ~20ms. If the child returns `undefined` / runs in ~20ms, D2 did not take — STOP and re-check the unwrap.

> Note: this run hits the live `find-similar-tickets.mjs` + `conflict-check.sh` (fail-soft) and is the first real `pipeline.js` execution — expect to surface a runtime bug here and fix it (see Task D9). Run with `dry_run: true` so Deploy cannot ship.

---

## Task D4: Fix ticket-attach.sh dead context (E1)

**Files:**
- Modify: `scripts/ticket-attach.sh:19` (+ the two `mentolder` mentions in the header comment, lines 11 & 13)

- [x] **Step 1: Change the default context to fleet**

Line 19, replace:

```bash
CTX="${TICKET_CTX:-mentolder}"
```

with:

```bash
CTX="${TICKET_CTX:-fleet}"
```

Also update the header comments (line 11 “on the mentolder cluster” → “on the fleet cluster”; line 13 “Requires kubectl context `mentolder` reachable.” → “Requires kubectl context `fleet` reachable.”) so they stop teaching the dead context.

- [x] **Step 2: Verify syntax + default**

Run: `bash -n scripts/ticket-attach.sh && grep -n 'TICKET_CTX:-fleet' scripts/ticket-attach.sh`
Expected: exit 0 and the line prints. `mentolder` no longer appears as a default.

- [x] **Step 3: Commit**

```bash
git add scripts/ticket-attach.sh
git commit -m "fix(tickets): ticket-attach default context mentolder(dead)->fleet [T000425]"
```

---

## Task D5: Remove dead `ticket.sh update` fallback in pipeline.js (E2)

**Files:**
- Modify: `scripts/factory/pipeline.js` (the Scout-persist agent prompt, around the current line 111-116)

- [x] **Step 1: Delete the dead fallback**

`ticket.sh` has no `update` subcommand (only `set-touched-files`). In the `scout:persist` agent prompt, remove the fallback lines so the prompt reads only:

```js
await agent(
  `Run the following command to record which files this feature touches on the ticket:
   bash ${REPO}/scripts/ticket.sh set-touched-files --id ${A.ticket_id} --files ${JSON.stringify(scout.touched_files.join(','))}
   Report the command output.`,
  { label: 'scout:persist', phase: 'Scout' },
)
```

(Delete the two lines that said “If the set-touched-files subcommand does not exist, fall back to: … ticket.sh update …”.)

- [x] **Step 2: Verify**

Run: `node --check scripts/factory/pipeline.js && ! grep -q 'ticket.sh update ' scripts/factory/pipeline.js`
Expected: exit 0 (valid JS, dead fallback gone).
Run: `./tests/runner.sh local FA-SF-20`
Expected: PASS (still references `scripts/ticket.sh`).

- [x] **Step 3: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "fix(factory): drop dead ticket.sh update fallback in Scout persist [T000425]"
```

---

## Task D6: README — P2 status + drop raw SQL (E3)

**Files:**
- Modify: `scripts/factory/README.md`

- [x] **Step 1: Update the doc**

- Change any “Phase 2 (Dispatcher) — geplant/planned” wording to reflect that it is **shipped** (merged PR #1330, `dispatcher.js` + `queue/slots/schedule/watchdog/metrics.sh` present).
- Replace the raw-SQL quickstart (e.g. `psql … UPDATE … touched_files`) with the supported CLI: `bash scripts/ticket.sh set-touched-files --id T###### --files a,b,c` (CLAUDE.md forbids ad-hoc SQL against `tickets`).
- Add one line documenting the new dry-run: “Safe trial run: pass `dry_run: true` in the pipeline args (or `FACTORY_DRY_RUN=1`) — Deploy reports the diff but does not merge/deploy.”

- [x] **Step 2: Commit**

```bash
git add scripts/factory/README.md
git commit -m "docs(factory): mark Phase 2 shipped; drop raw-SQL quickstart [T000425]"
```

---

## Task D7: Dry-run mode in pipeline.js Deploy phase (D3)

**Files:**
- Modify: `scripts/factory/pipeline.js` (Config block + Deploy phase)
- Modify: `tests/local/FA-SF-31-workflow-entrypoint.bats` (add a dry-run assertion)

- [x] **Step 1: Add the failing assertion**

Append to `FA-SF-31`:

```bash
@test "FA-SF-31: pipeline.js has a dry-run branch that does NOT merge/deploy" {
  run grep -Eq 'dry_run|FACTORY_DRY_RUN|DRY_RUN' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  # In the dry-run branch the deploy agent must be guarded: assert a DRY_RUN const exists
  run grep -Eq 'const DRY_RUN' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}
```

Run: `./tests/runner.sh local FA-SF-31` → the new test FAILS.

- [x] **Step 2: Read the flag in the Config block**

After `const WT = …` add:

```js
// Dry-run: skip the destructive Deploy actions (push/merge/prod-deploy). Passed
// in args by the dispatcher / task; default off. Lets us run Scout→Verify safely.
const DRY_RUN = A.dry_run === true || A.dry_run === 'true'
```

- [x] **Step 3: Branch the Deploy phase**

Replace the `phase('Deploy')` block so that when `DRY_RUN` is set it does NOT push/merge/deploy. Concretely, at the start of the Deploy phase:

```js
phase('Deploy')
if (DRY_RUN) {
  const report = await agent(
    `DRY RUN — do NOT push, merge, or deploy anything. From ${REPO}:
     1. Show the planned diff: git diff origin/main...HEAD (branch feature/${slug}).
     2. Summarise the review findings already gathered (${reviews.length} review lens result(s)).
     3. Release the pipeline slot and return the ticket to the queue (nothing shipped):
        bash ${REPO}/scripts/ticket.sh release-slot --id ${A.ticket_id}
        bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status backlog
     Report the diff stat + a one-line verdict. Take NO other action.`,
    { label: 'deploy:dry-run', phase: 'Deploy' },
  )
  return { status: 'dry-run', report, reviews: reviews.length, tasks: tasks.length }
}
// … existing real-deploy agent unchanged below …
```

- [x] **Step 4: Verify**

Run: `node --check scripts/factory/pipeline.js && ./tests/runner.sh local FA-SF-31`
Expected: exit 0; FA-SF-31 PASS (including the new dry-run assertion).

- [x] **Step 5: Commit**

```bash
git add scripts/factory/pipeline.js tests/local/FA-SF-31-workflow-entrypoint.bats
git commit -m "feat(factory): FACTORY_DRY_RUN — Deploy reports diff, never ships [T000425]"
```

---

## Task D8: Thread dry_run through the dispatcher + Taskfile

**Files:**
- Modify: `scripts/factory/dispatcher.js` (child args)
- Modify: `Taskfile.factory.yml` (document the flag)

- [x] **Step 1: Pass dry_run to the nested pipeline**

In `dispatcher.js`, the Config reads `const A = args ?? {}`. In the Launch `workflow(...)` child-args object, add:

```js
        dry_run: A.dry_run === true || A.dry_run === 'true',
```

so a dispatcher run started with `{ timestamp, dry_run: true }` fans dry-run into every nested pipeline.

- [x] **Step 2: Document in Taskfile.factory.yml**

In the `dispatch` task’s echo block, add a line:

```
echo "Safe trial: pass args { timestamp, dry_run: true } — pipelines report diffs, never merge/deploy."
```

- [x] **Step 3: Verify + commit**

Run: `node --check scripts/factory/dispatcher.js && ./tests/runner.sh local FA-SF-31`
Expected: exit 0; PASS.

```bash
git add scripts/factory/dispatcher.js Taskfile.factory.yml
git commit -m "feat(factory): thread dry_run from dispatcher into nested pipelines [T000425]"
```

---

## Task D9: Dry-run end-to-end proof + runtime fixes (exploratory)

This is the first real end-to-end execution of the pipeline. **Runtime bugs are expected** (spec R3); fix them as they surface, committing each fix separately with `[T000425]`.

- [x] **Step 1: Verify dual-brand factory schema parity (spec R4)**

Run:
```bash
for ns in workspace workspace-korczewski; do
  kubectl --context fleet -n "$ns" exec deploy/shared-db -c postgres -- \
    psql -U website -d website -qtAc "SELECT to_regclass('tickets.tickets') IS NOT NULL AND
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='pipeline_slot');"
done
```
Expected: `t` for both namespaces. If `f`, the factory objects are not live on that brand — stop and run the idempotent website-boot init before continuing.

- [x] **Step 2: Seed an SF-TEST fixture ticket**

```bash
export TICKET_CTX=fleet
RES=$(bash scripts/ticket.sh create --type feature --brand mentolder --is-test-data \
  --title "SF dry-run smoke" \
  --description "Trivial dry-run target: append a line to scripts/factory/README.md" \
  --status backlog)
echo "$RES"   # external_id|uuid
```

- [x] **Step 3: Run pipeline.js standalone in dry-run**

Via the Workflow tool: run `scripts/factory/pipeline.js` with args `{ title, description, slug: 'sf-dryrun-smoke', ticket_id: <external_id>, brand: 'mentolder', timestamp: '2026-06-05T00:00:00Z', dry_run: true }`. Watch `/workflows`.
Expected: phases Scout→…→Deploy run with real agents; Deploy returns `{status:'dry-run', …}`; **no PR merged, no deploy**. Fix any runtime error and re-run.

- [x] **Step 4: Run the dispatcher path in dry-run**

Via the Workflow tool: run `scripts/factory/dispatcher.js` with args `{ timestamp: '2026-06-05T00:00:00Z', dry_run: true }`.
Expected: PREP claims the fixture’s slot, LAUNCH nests the pipeline (real agents, not a 20ms no-op), METRICS posts a summary; the fixture’s slot is released and it returns to `backlog`.

- [x] **Step 5: Purge the fixture + record observations**

```bash
kubectl --context fleet -n workspace exec deploy/shared-db -c postgres -- \
  psql -U website -d website -qtAc "SELECT tickets.fn_purge_test_data();"
```
Add a short “D5 proof: observed runtime fixes” note to `scripts/factory/README.md` (what broke, what was fixed). Commit any runtime fixes + the note.

```bash
git add -- scripts/factory/ docs/ 2>/dev/null; git commit -m "fix(factory): runtime fixes from first dry-run end-to-end [T000425]" || echo "no runtime fixes needed"
```

---

# MILESTONE A — Connect the entry point

## Task A1: `ticket.sh enqueue` + `get` returns plan_ref

**Files:**
- Modify: `scripts/ticket.sh` (new `cmd_enqueue`, extend `cmd_get`, dispatch + usage)
- Modify: `tests/local/FA-SF-21-ticket-cli.bats` (add enqueue arg-validation cases)

Plan-reference storage (spec R1, decided here, DDL-free): `enqueue` writes a structured comment `FACTORY-PLAN-REF branch=<branch> plan=<plan_path>` (author `factory`) into `tickets.ticket_comments`, and `get` surfaces the latest such comment as a `plan_ref` field. The dispatcher already calls `ticket.sh get`, so no new read path is needed.

- [x] **Step 1: Add failing arg-validation tests**

Append to `tests/local/FA-SF-21-ticket-cli.bats` (mirror its existing offline style):

```bash
@test "FA-SF-21: enqueue requires --id" {
  run bash scripts/ticket.sh enqueue --branch feature/x --plan docs/p.md
  [ "$status" -eq 2 ]
}
@test "FA-SF-21: enqueue rejects unknown option" {
  run bash scripts/ticket.sh enqueue --id T000001 --bogus z
  [ "$status" -eq 2 ]
}
@test "FA-SF-21: unknown command still errors" {
  run bash scripts/ticket.sh frobnicate
  [ "$status" -ne 0 ]
}
```

Run: `./tests/runner.sh local FA-SF-21` → the enqueue tests FAIL (subcommand missing).

- [x] **Step 2: Implement `cmd_enqueue`**

Add to `scripts/ticket.sh` (after `cmd_touch`, before the dispatch block):

```bash
cmd_enqueue() {
  local id="" branch="" plan=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id)     id="$2"; shift 2 ;;
      --branch) branch="$2"; shift 2 ;;
      --plan)   plan="$2"; shift 2 ;;
      *)        echo "Unknown enqueue option: $1" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  # Flip into the factory queue: type=feature, status=backlog (claimable by slots.sh).
  _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET type='feature', status='backlog' WHERE external_id = :'ext_id';
EOF
  # Record a DDL-free plan reference for the pipeline's plan-reuse entrypoint.
  if [[ -n "$branch" || -n "$plan" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'factory', :'ref', 'internal' FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  fi
  echo "Ticket $id enqueued for the Software Factory (type=feature, status=backlog)"
}
```

- [x] **Step 3: Surface `plan_ref` in `cmd_get`**

In `cmd_get`’s `json_build_object(...)`, add a `plan_ref` key sourced from the latest matching comment. Replace the SELECT with:

```sql
SELECT json_build_object(
  'external_id', t.external_id, 'id', t.id, 'type', t.type, 'brand', t.brand,
  'title', t.title, 'status', t.status, 'priority', t.priority,
  'touched_files', t.touched_files, 'pipeline_slot', t.pipeline_slot,
  'created_at', t.created_at, 'updated_at', t.updated_at,
  'plan_ref', (
    SELECT c.body FROM tickets.ticket_comments c
    WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %'
    ORDER BY c.created_at DESC LIMIT 1
  )
) FROM tickets.tickets t WHERE t.external_id = :'ext_id';
```

- [x] **Step 4: Register the subcommand**

In the dispatch `case "$cmd" in` block add `enqueue) cmd_enqueue "$@" ;;` and append `enqueue` to the usage line (line ~395).

- [x] **Step 5: Verify + commit**

Run: `bash -n scripts/ticket.sh && ./tests/runner.sh local FA-SF-21`
Expected: exit 0; PASS.

```bash
git add scripts/ticket.sh tests/local/FA-SF-21-ticket-cli.bats
git commit -m "feat(tickets): ticket.sh enqueue + get plan_ref for factory handoff [T000425]"
```

---

## Task A2: Plan-reuse entrypoint in pipeline.js

**Files:**
- Modify: `scripts/factory/pipeline.js` (Config + early branch before Scout)

When the pipeline is launched with a plan reference (`A.plan_path` + `A.branch`), it must skip self-planning (Scout/Design/Plan), work on the human’s existing branch, parse the human plan into the task schema, and go straight to Implement → Verify → Deploy. The self-planning path (no plan-ref) is unchanged.

- [ ] **Step 1: Read the reuse inputs in Config**

After the `DRY_RUN` const add:

```js
// Plan-reuse: when a human dev-flow plan is handed off, work on that branch and
// reuse its plan instead of self-planning (Scout/Design/Plan). Falsy → self-plan.
const REUSE_BRANCH = A.branch || null          // e.g. feature/<slug>
const REUSE_PLAN   = A.plan_path || null        // e.g. docs/superpowers/plans/<file>.md
const REUSE = !!(REUSE_BRANCH && REUSE_PLAN)
const WORK_BRANCH = REUSE ? REUSE_BRANCH : `feature/${slug}`
const WORK_WT = REUSE ? `/tmp/wt-${slug}-reuse` : WT
```

- [ ] **Step 2: Branch before Scout (avoid duplicate `let` + `scout` coupling)**

The existing `pipeline.js` already declares `let specPath = null` and `let tasks = []` for the self-plan path, and the Implement guard is `if (!isSimple && tasks.length)` (which references `scout`, absent on reuse). Make these exact changes:

1. **Hoist** the existing `let specPath = null` and `let tasks = []` declarations to the top of the body (just after the Config consts). **Remove** the inline `let` keywords where they currently appear (turn them into plain assignments / drop them) so nothing is declared twice.

2. **Wrap** the existing Scout, Design, and Plan phases in `if (!REUSE) { … }` so they run only on the self-plan path. (`scout`, `isSimple`, `specPath`, the conflict gate, and the self-plan `tasks = plan.tasks` all live inside this block.)

3. **Insert** the reuse block right after that `if (!REUSE)` block:

```js
if (REUSE) {
  phase('Plan')
  const reuse = await agent(
    `A human already planned this feature via dev-flow. Check out the existing branch
     ${WORK_BRANCH} into an isolated worktree at ${WORK_WT} (from ${REPO}), then read the
     plan file ${REUSE_PLAN} on that branch. Decompose it into independent tasks where no
     two tasks touch the same file: each { id, target_files:[...], acceptance_criteria:[...] }.
     Do NOT write a new plan or spec — reuse the human one. Return { tasks: [...] }.`,
    { label: 'plan:reuse', phase: 'Plan', schema: { type:'object', required:['tasks'], properties:{ tasks:{ type:'array', items:{ type:'object', required:['id','target_files','acceptance_criteria'], properties:{ id:{type:'string'}, target_files:{type:'array',items:{type:'string'}}, acceptance_criteria:{type:'array',items:{type:'string'}} } } } } } },
  )
  tasks = reuse.tasks
}
```

4. **Decouple the Implement guard from `scout`:** change `if (!isSimple && tasks.length)` to `if (tasks.length)` (a self-plan *simple* feature already yields `tasks = []`, so it is still skipped — the `!isSimple` check was redundant with `tasks.length`).

5. In the Implement, Verify, and Deploy phases, replace the hardcoded `feature/${slug}` with `${WORK_BRANCH}` and `${WT}` with `${WORK_WT}` so a reused human branch is the working branch.

- [ ] **Step 3: Verify**

Run: `node --check scripts/factory/pipeline.js && ./tests/runner.sh local FA-SF-31 && ./tests/runner.sh local FA-SF-20`
Expected: exit 0; PASS. (FA-SF-20 greps for `phase('Scout'..'Deploy')` which still exist.)
Add a grep assertion to FA-SF-31:

```bash
@test "FA-SF-31: pipeline.js has a plan-reuse entrypoint" {
  run grep -Eq 'REUSE|plan_path|WORK_BRANCH' scripts/factory/pipeline.js; [ "$status" -eq 0 ]
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/pipeline.js tests/local/FA-SF-31-workflow-entrypoint.bats
git commit -m "feat(factory): plan-reuse entrypoint — execute a handed-off human plan [T000425]"
```

---

## Task A3: Dispatcher passes plan-ref + branch to the nested pipeline

**Files:**
- Modify: `scripts/factory/dispatcher.js` (PREP prompt + schema + Launch child args)

- [ ] **Step 1: Have PREP read plan_ref**

In the PREP agent prompt, after fetching each title via `ticket.sh get`, also read its `plan_ref` field and parse `branch=` / `plan=`. Extend the prompt’s return instruction to: `{ "launch": [ {brand, external_id, slot, title, branch, plan_path} ... ] }` where `branch`/`plan_path` are null if the ticket has no `FACTORY-PLAN-REF` (self-plan).

Extend `PLAN_SCHEMA.properties.launch.items.properties` with:

```js
            branch: { type: 'string' },
            plan_path: { type: 'string' },
```

- [ ] **Step 2: Forward to the child**

In the Launch `workflow(...)` child-args, add:

```js
            branch: f.branch || null,
            plan_path: f.plan_path || null,
            slug: f.branch ? String(f.branch).replace(/^feature\//, '') : `sf-${String(f.external_id).toLowerCase()}`,
```

(Replace the existing hardcoded `slug:` line — when reusing, the slug must match the human branch so the plan file resolves.)

- [ ] **Step 3: Verify + commit**

Run: `node --check scripts/factory/dispatcher.js && ./tests/runner.sh local FA-SF-30 && ./tests/runner.sh local FA-SF-31`
Expected: exit 0; PASS.

```bash
git add scripts/factory/dispatcher.js
git commit -m "feat(factory): dispatcher forwards plan-ref/branch to nested pipeline [T000425]"
```

---

## Task A4: Conflict cross-visibility (include in-flight task tickets)

**Files:**
- Modify: `scripts/factory/conflict-check.sh:107`
- Modify: `tests/local/FA-SF-01-conflict-check.bats` (add a task-type overlap case)

- [ ] **Step 1: Broaden the filter**

Line 107, replace:

```sql
  AND t.type = 'feature'
```

with:

```sql
  AND t.type IN ('feature','task')
```

so an in-flight human dev-flow ticket (`type='task'`, `status='in_progress'`) with overlapping `touched_files` is detected as a conflict. (The `status IN ('backlog','in_progress','in_review')` clause on line 108 already covers in-flight.)

- [ ] **Step 2: Add a live-seed test**

In `FA-SF-01-conflict-check.bats`, add a test (using the existing fixture helpers in `tests/lib/factory-test-fixtures.sh`) that seeds a `type='task'` ticket with `touched_files = {k3d/configmap-domains.yaml}` in `in_progress`, then asserts `conflict-check.sh <new_id> k3d/configmap-domains.yaml` exits 1 and names that ticket. Gate it behind `FACTORY_CTX` like the other live-seed tests, and purge after.

- [ ] **Step 3: Verify + commit**

Run: `bash -n scripts/factory/conflict-check.sh && ./tests/runner.sh local FA-SF-01`
Expected: exit 0; PASS (offline cases; live-seed skips without `FACTORY_CTX`).

```bash
git add scripts/factory/conflict-check.sh tests/local/FA-SF-01-conflict-check.bats
git commit -m "feat(factory): conflict-check sees in-flight task tickets too [T000425]"
```

---

## Task A5: dev-flow handoff offer + touched_files + Taskfile wrapper

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` (Schritt 5)
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (Schritt 1.5)
- Modify: `Taskfile.factory.yml` (new `enqueue` task)

- [ ] **Step 1: Add the handoff option to dev-flow-plan Schritt 5**

After the “STOPP. Informiere den User…” block, add a third option:

```markdown
**Alternativ — an die Software Factory übergeben:** Statt `dev-flow-execute` selbst aufzurufen,
kann der geplante Branch autonom abgearbeitet werden. Frage den User; bei Zustimmung:
\`\`\`bash
bash scripts/ticket.sh enqueue --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" --plan "docs/superpowers/plans/<date>-<slug>.md"
\`\`\`
Das Ticket wird `type=feature/status=backlog` und vom Factory-Dispatcher mit **Plan-Reuse**
(kein Neu-Planen) abgearbeitet. STOPP danach.
```

- [ ] **Step 2: Record touched_files in dev-flow-execute Schritt 1.5**

After the `update-status … in_progress` line, add:

```markdown
Falls der Plan die berührten Dateien kennt, registriere sie für die Conflict-Gate
(damit ein paralleler Factory-Lauf die Kollision sieht):
\`\`\`bash
./scripts/ticket.sh set-touched-files --id "$TICKET_ID" --files "<comma-separated-paths>"
\`\`\`
```

- [ ] **Step 3: Add the Taskfile wrapper**

In `Taskfile.factory.yml` add:

```yaml
  enqueue:
    desc: "Hand a planned ticket to the Software Factory queue. Usage: task factory:enqueue -- T000123 feature/<slug> docs/superpowers/plans/<file>.md"
    cmds:
      - bash scripts/ticket.sh enqueue --id {{index .MATCH 0}} --branch {{index .MATCH 1}} --plan {{index .MATCH 2}}
    vars:
      MATCH:
        sh: echo "{{.CLI_ARGS}}"
```
(If the project’s task version doesn’t support `MATCH` parsing, fall back to a plain `bash scripts/ticket.sh enqueue {{.CLI_ARGS}}` passthrough — verify with `task factory:enqueue -- --id T000001` printing the right command.)

- [ ] **Step 4: Verify + commit**

Run: `task workspace:validate` (manifests unaffected, sanity) and confirm the two SKILL.md files render (grep the new `enqueue` lines).

```bash
git add .claude/skills/dev-flow-plan/SKILL.md .claude/skills/dev-flow-execute/SKILL.md Taskfile.factory.yml
git commit -m "feat(devflow): offer factory handoff + record touched_files [T000425]"
```

---

## Task A6: Telemetry write-back in pipeline.js

**Files:**
- Modify: `scripts/factory/pipeline.js` (Deploy phase real-deploy path)

- [ ] **Step 1: Write the PR number at creation time**

In the (non-dry-run) Deploy agent prompt, after `gh pr create`, add an instruction to record the PR number immediately (not only at archive):

```
After the PR is created, record its number on the ticket right away:
  PR=$(gh pr view --json number -q .number)
  bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body "Factory: PR #$PR opened (phase=Deploy)."
```

- [ ] **Step 2: Add a phase breadcrumb at Verify**

In the Verify phase, after the review panel, add a non-blocking status comment so a human inheriting a half-finished ticket has a trail:

```js
await agent(
  `Record a one-line factory status breadcrumb (non-blocking):
   bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify('Factory: phase=Verify, ' + reviews.flatMap(r=>r.findings).length + ' finding(s).')}`,
  { label: 'verify:breadcrumb', phase: 'Verify' },
)
```

- [ ] **Step 3: Verify + commit**

Run: `node --check scripts/factory/pipeline.js && ./tests/runner.sh local FA-SF-20 && ./tests/runner.sh local FA-SF-31`
Expected: exit 0; PASS.

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory): telemetry — PR# at creation + Verify breadcrumb [T000425]"
```

---

## Final verification (before PR)

- [ ] Run the full offline gate: `task test:all` → green.
- [ ] Run: `task test:inventory` and confirm `website/src/data/test-inventory.json` is unchanged (already committed in D1) — CI fails on drift.
- [ ] Confirm the dry-run proof (Task D9) was executed and `pipeline.js` ran with **>0 agents** (not a 20ms no-op).
- [ ] `git log --oneline` shows one focused commit per task, each tagged `[T000425]`.

---

## Notes for the executor
- **DRY/YAGNI:** reuse `ticket.sh`/`lib.sh`/`factory_psql` helpers; do not add a second DB access path.
- **No DDL:** plan-ref lives in `ticket_comments` (Task A1) — never `ALTER TABLE` (schema owned by `website/src/lib/tickets-db.ts`).
- **Order matters:** D1→D2 is the red→green for the no-op fix; D3 proves it; A1 must land before A2/A3 (they consume `plan_ref`).
- **Dry-run everywhere first:** every live pipeline/dispatcher execution in this plan uses `dry_run: true`. A real prod-deploy run is explicitly out of scope (spec R5) and a separate, deliberate follow-up.
