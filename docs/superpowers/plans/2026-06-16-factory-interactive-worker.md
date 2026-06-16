---
title: Factory Interactive Worker Implementation Plan
ticket_id: T000911
domains: [website, infra, db, ops, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Factory Interactive Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let interactive Claude Code sessions act as quality-gating workers in the Software Factory — auto-detect weak DeepSeek-Scout output, gate the autopilot on branch+plan readiness, and provide a `/factory-worker-on` skill so a human can plan ticket(s) the autopilot can't.

**Architecture:** Three automatic guards (pure-JS Scout-quality detector in `pipeline.js`, a Bash readiness check in `factory-prep-bridge.sh`, a sentinel-lock slot reducer in `dispatcher.js`) plus one interactive skill. No new DB column — the `SCOUT_WEAK=true` internal ticket comment is the persistent marker. No automatic Scout retry; weak Scout parks the ticket for a human.

**Tech Stack:** Node.js (CommonJS-style `require` inside the Workflow ESM `pipeline.js`), Bash, BATS (offline), `scripts/ticket.sh`, `scripts/agent-lock.sh`.

---

## Background the implementer needs

Read these before starting — they explain non-obvious constraints:

- **Spec:** `docs/superpowers/specs/2026-06-16-factory-interactive-worker-design.md` (source of truth for behavior).
- **`pipeline.js` is a Workflow script.** It runs under a harness that injects globals (`agent`, `parallel`, `pipeline`, `phase`, `log`, `args`). It is offline-checked with `node --check` only — it is never `node`-executed directly in tests. Inside it, `require('child_process')` and `require('./module.cjs')` are used freely (see lines 17, 26, 39, 62). New helper modules it requires must be loadable by `node --check`-style static loading: prefer a `.cjs` or plain `.js` with `module.exports`.
- **`ticket.sh` comment command is `add-comment`, NOT `comment`.** Signature: `add-comment --id <external_id> --body <body> [--author <author_label>] [--visibility <visibility>]`. Default `visibility` is already `internal` (see `cmd_add_comment` in `scripts/ticket.sh`). The spec text says `ticket.sh comment --visibility internal` — translate that to `add-comment --visibility internal`.
- **`ticket.sh stage-plan`** exists (`cmd_stage_plan`, delegates to `vda/ticket/stage-plan.sh`).
- **`agent-lock.sh`** subcommands used here: `claim`, `release`, `list`, `check`. `claim ticket <id> --label <l> --worktree <wt>`; `release ticket <id>`; `list` prints all live claims; `check ticket <id>` returns exit 3 if a live interactive session holds the ticket (already used in `factory-prep-bridge.sh:97`).
- **S1 line budgets (all three edited files are NOT baselined → static extension limit applies):**

  | File | Ext limit | Current `wc -l` | Budget (limit − current) |
  |------|-----------|-----------------|--------------------------|
  | `scripts/factory/pipeline.js` | 600 (.js) | 599 | **1 line** — effectively zero headroom. The Scout-check logic MUST live in the new module `scout-quality-check.js`; `pipeline.js` may add only the `require` + a small guarded call block. Keep the net add ≤ ~15 lines by writing terse code, OR extract an equal number of lines elsewhere. If the change would push it past 600, the implementer MUST factor the inserted block into a one-line helper call. |
  | `scripts/factory/factory-prep-bridge.sh` | 300 (.sh) | 134 | 166 lines |
  | `scripts/factory/dispatcher.js` | 600 (.js) | 205 | 395 lines |
  | `scripts/factory/scout-quality-check.js` (new) | 600 (.js) | 0 | cut well under 600 |
  | `scripts/factory/readiness-check.sh` (new) | 300 (.sh) | 0 | cut well under 300 |

  > **`pipeline.js` is the tight one.** Confirm with `wc -l scripts/factory/pipeline.js` before AND after every edit. Target ≤ 600 after the change. There is no baseline entry, so the threshold is the hard 600 static limit, not a frozen value.

- **S3 (no brand-domain literals):** never write `*.mentolder.de` / `*.korczewski.de` string literals in code. The DB host is reached via `kubectl exec ... deploy/shared-db` (see `factory-autopilot/SKILL.md` for the exact pattern) — no domain literals needed.
- **S4 (no orphans):** every new `scripts/*.sh` / `*.js` must be reachable. `scout-quality-check.js` is reached via `require` in `pipeline.js`; `readiness-check.sh` is reached via `source`/call in `factory-prep-bridge.sh`. Both new BATS files are wired into the BATS selection through `task test:inventory` regeneration + the `tests/unit/` glob.

---

## File Structure

**New files:**
- `scripts/factory/scout-quality-check.js` — pure-JS `evaluateScoutQuality(scoutResult)`; `module.exports`. No deps.
- `scripts/factory/readiness-check.sh` — Bash `check_ticket_readiness <branch> <plan_path>`; emits readiness JSON. No side effects beyond `git ls-remote` / `git show`.
- `.claude/skills/factory-worker/SKILL.md` — the `/factory-worker-on` interactive skill.
- `tests/unit/factory-scout-quality.bats` — offline tests for the Scout-quality module.
- `tests/unit/factory-readiness.bats` — offline tests for the readiness check.

**Modified files:**
- `scripts/factory/pipeline.js` — `require` the new module; after Scout-validate, run `evaluateScoutQuality`; on `weak`, write `SCOUT_WEAK` comment + return `{status:'scout_weak'}`.
- `scripts/factory/factory-prep-bridge.sh` — after parsing `branch`/`plan_path` per candidate, call `readiness-check.sh`; drop not-ready tickets from `launch`, log them as skipped.
- `scripts/factory/dispatcher.js` — before the LAUNCH `parallel()` block, detect an `interactive-worker` lock via `agent-lock.sh list` and reduce parallel slots by 1 (min 1).

---

## Task 1: `scout-quality-check.js` — pure quality evaluator

**Files:**
- Create: `scripts/factory/scout-quality-check.js`
- Test: `tests/unit/factory-scout-quality.bats` (written in Task 7)

- [ ] **Step 1: Write the module**

The function takes the Scout result object the pipeline already has (`scout`, which carries `complexity`, `touched_files`, `risk_areas`, `similar_tickets`, optionally `suggested_files`). The spec adds three quality fields the evaluator reads: `touched_files` (array), `spec_content` (string, the design-spec text if produced), and `plan_path` (string). Weak if ANY of: `touched_files` empty, `spec_content` shorter than 300 chars, `plan_path` falsy.

> Design note: in the live pipeline the spec/plan are produced AFTER Scout. The evaluator is intentionally generic so it can be called at the post-Scout gate with whatever fields are populated (e.g. `spec_content` may be the concatenated `title + description` available at Scout time, or the spec text if the Design phase already ran). The caller (Task 2) decides which fields to pass. The function itself is pure and only inspects the object it is given.

```javascript
/**
 * scripts/factory/scout-quality-check.js
 * Pure quality evaluator for Software-Factory Scout output.
 * No external dependencies. Loadable via require() from pipeline.js (Workflow script).
 *
 * @param {{touched_files?: unknown, spec_content?: unknown, plan_path?: unknown}} scoutResult
 * @returns {{weak: boolean, reasons: string[]}}
 */
function evaluateScoutQuality(scoutResult) {
  const reasons = []
  const r = scoutResult && typeof scoutResult === 'object' ? scoutResult : {}

  const touched = Array.isArray(r.touched_files) ? r.touched_files : []
  if (touched.length === 0) reasons.push('touched_files_empty')

  const spec = typeof r.spec_content === 'string' ? r.spec_content : ''
  if (spec.length < 300) reasons.push('spec_too_short')

  if (!r.plan_path) reasons.push('no_plan_path')

  return { weak: reasons.length > 0, reasons }
}

module.exports = { evaluateScoutQuality }
```

- [ ] **Step 2: Sanity-check it loads**

Run: `node --check scripts/factory/scout-quality-check.js && node -e "console.log(require('./scripts/factory/scout-quality-check.js').evaluateScoutQuality({touched_files:[],spec_content:'',plan_path:null}))"`
Expected: `{ weak: true, reasons: [ 'touched_files_empty', 'spec_too_short', 'no_plan_path' ] }`

- [ ] **Step 3: Confirm line budget**

Run: `wc -l scripts/factory/scout-quality-check.js`
Expected: well under 600.

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/scout-quality-check.js
git commit -m "feat(factory): pure scout-quality evaluator (evaluateScoutQuality)"
```

---

## Task 2: Wire Scout-quality gate into `pipeline.js`

**Files:**
- Modify: `scripts/factory/pipeline.js` (add `require` near the existing module requires at lines 17–18; add the gate block after Scout-validation, i.e. after line 198 `phaseEvent('scout', 'done', ...)` and before the SCS `fetch` block at line 200)

The gate runs **after** the Scout output is validated as schema-correct (line 177–198) so we know `scout.touched_files` is an array. At that point the Design/Plan phases have NOT run, so `plan_path` is not yet known — passing `plan_path` would always flag weak. Per the spec's intent (catch *unusable* Scout), evaluate on the two signals available at Scout time: `touched_files` and a `spec_content` proxy (`title + description`). Pass `plan_path: 'pending'` so the `no_plan_path` reason does not fire at this gate (it is reserved for the readiness check in Task 4, which is the authoritative plan-presence gate).

- [ ] **Step 1: Add the require**

After line 18 (`const BL = require('./build-loop.cjs')`), add:

```javascript
const SQ = require('./scout-quality-check.js')
```

- [ ] **Step 2: Add the gate block**

Immediately after line 198 (`phaseEvent('scout', 'done', \`${(scout.touched_files || []).length} touched_files\`)`), insert:

```javascript
const sq = SQ.evaluateScoutQuality({
  touched_files: scout.touched_files,
  spec_content: `${A.title ?? ''}\n${A.description ?? ''}`,
  plan_path: 'pending',
})
if (sq.weak) {
  log(`Scout weak: ${sq.reasons.join(',')} — parking ticket for interactive worker`)
  try {
    cp.execFileSync('bash', [`${REPO}/scripts/ticket.sh`, 'add-comment',
      '--id', String(A.ticket_id), '--author', 'factory', '--visibility', 'internal',
      '--body', `SCOUT_WEAK=true\ntouched_files=${scout.touched_files.length}\nspec_length=${(`${A.title ?? ''}\n${A.description ?? ''}`).length}\nreason=${sq.reasons[0]}`],
      { stdio: 'ignore', timeout: 15000 })
  } catch (e) { log(`scout_weak comment failed (non-fatal): ${e.message}`) }
  phaseEvent('scout', 'blocked', `scout_weak: ${sq.reasons.join(',')}`)
  return { status: 'scout_weak', ticket_id: A.ticket_id, reasons: sq.reasons }
}
```

> `cp` is already in scope (declared `const cp = require('child_process')` at line 155). `REPO`, `A`, `log`, `phaseEvent`, `scout` are all in scope at this point. The `return` exits `main()` cleanly inside the `try { if (!REUSE) { ... } }` block — the existing `finally` cleanup (line 598) still runs.

- [ ] **Step 3: Verify it still parses and check the budget**

Run: `node --check scripts/factory/pipeline.js && wc -l scripts/factory/pipeline.js`
Expected: no syntax error; line count **≤ 600**. If it exceeds 600, condense the gate block (e.g. compute the spec proxy once into a `const specProxy = ...` and reuse) until it fits.

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory): gate weak Scout output -> SCOUT_WEAK comment + scout_weak status"
```

---

## Task 3: `readiness-check.sh` — branch + plan-on-branch guard

**Files:**
- Create: `scripts/factory/readiness-check.sh`
- Test: `tests/unit/factory-readiness.bats` (written in Task 7)

- [ ] **Step 1: Write the script**

The function checks that the branch exists on `origin` and that the plan file is committed on that branch. It emits a single-line JSON to stdout. It must be `source`-able (so `factory-prep-bridge.sh` can call the function) AND runnable directly (so BATS can invoke it). Pattern: define the function, then call it with `"$@"` only when executed (not sourced).

```bash
#!/usr/bin/env bash
# scripts/factory/readiness-check.sh
# check_ticket_readiness <branch> <plan_path>
# Emits one-line JSON: {"ready":true|false,"reason":"ok"|"no_branch"|"no_plan_on_branch"|"missing_args"}
# Exit 0 when ready, exit 1 when not ready / bad args.
set -uo pipefail

check_ticket_readiness() {
  local branch="${1:-}" plan_path="${2:-}"

  if [[ -z "$branch" || "$branch" == "null" || -z "$plan_path" || "$plan_path" == "null" ]]; then
    printf '{"ready":false,"reason":"missing_args"}\n'
    return 1
  fi

  if ! git ls-remote --exit-code origin "refs/heads/$branch" >/dev/null 2>&1; then
    printf '{"ready":false,"reason":"no_branch"}\n'
    return 1
  fi

  if ! git show "origin/$branch:$plan_path" >/dev/null 2>&1; then
    printf '{"ready":false,"reason":"no_plan_on_branch"}\n'
    return 1
  fi

  printf '{"ready":true,"reason":"ok"}\n'
  return 0
}

# Run only when executed directly, not when sourced.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  check_ticket_readiness "$@"
fi
```

- [ ] **Step 2: Smoke-check the bad-args path (no git needed)**

Run: `bash scripts/factory/readiness-check.sh "" ""; echo "rc=$?"`
Expected: `{"ready":false,"reason":"missing_args"}` then `rc=1`.

- [ ] **Step 3: Confirm line budget**

Run: `wc -l scripts/factory/readiness-check.sh`
Expected: well under 300.

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/readiness-check.sh
git commit -m "feat(factory): readiness-check.sh — branch + plan-on-branch guard"
```

---

## Task 4: Readiness-guard in `factory-prep-bridge.sh`

**Files:**
- Modify: `scripts/factory/factory-prep-bridge.sh` (add a source/guard step inside the per-ticket loop, after `branch`/`plan_path` are parsed at lines 110–120, before the `launch=$(echo ...)` append at line 122)

Behavior per spec: a candidate ticket is appended to `launch` ONLY if it has both a `branch` and a `plan_path` AND `readiness-check.sh` reports ready. Tickets without `branch`/`plan_path` (no plan yet) are skipped. Not-ready tickets are removed from `launch` (i.e. never added) and recorded in `skipped` with `reason=not_ready`, logged as `SKIP reason=not_ready ticket=$ext_id`.

- [ ] **Step 1: Source the readiness helper once near the top**

After line 9 (`log() { echo "[PREP] $*" >&2; }`), add:

```bash
# Readiness guard (T: factory-interactive-worker) — provides check_ticket_readiness
# shellcheck source=scripts/factory/readiness-check.sh
source "$HERE/readiness-check.sh"
```

- [ ] **Step 2: Insert the guard before the `launch` append**

Replace the existing append block (lines 122–130, the `launch=$(echo "$launch" | jq -c ...)` statement) by FIRST inserting the guard immediately before it:

```bash
    # --- Readiness guard: branch + plan must exist on origin ---
    if [[ "$branch" == "null" || -z "$branch" || "$plan_path" == "null" || -z "$plan_path" ]]; then
      log "SKIP reason=not_ready ticket=$ext_id (no branch/plan — not yet planned)"
      BRAND="$brand" bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" >/dev/null 2>&1 || true
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "not_ready" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi
    if ! check_ticket_readiness "$branch" "$plan_path" >/dev/null 2>&1; then
      log "SKIP reason=not_ready ticket=$ext_id (branch/plan not on origin)"
      BRAND="$brand" bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" >/dev/null 2>&1 || true
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "not_ready" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi
```

Keep the existing `launch=$(echo "$launch" | jq -c ... )` append exactly as-is right after this guard.

> The `release-slot` call mirrors the existing session-coordination guard (lines 99–100) so a not-ready ticket does not leave a dangling claimed slot.

- [ ] **Step 3: Validate the script parses**

Run: `bash -n scripts/factory/factory-prep-bridge.sh && wc -l scripts/factory/factory-prep-bridge.sh`
Expected: no syntax error; line count well under 300.

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/factory-prep-bridge.sh
git commit -m "feat(factory): readiness-guard drops un-planned/not-on-origin tickets from launch"
```

---

## Task 5: Sentinel slot-reduction in `dispatcher.js`

**Files:**
- Modify: `scripts/factory/dispatcher.js` (insert before the LAUNCH `parallel()` block at line 124–125)

Behavior per spec: before launching, check `agent-lock.sh list` for an `interactive-worker` label. If present, reduce the parallel slot count by 1 (minimum 1) and log it. The dispatcher launches one nested `workflow()` per entry in `launches`; "reducing slots" means launching at most `maxParallel` of them this tick and deferring the rest (they remain claimed/scheduled and get picked up next tick — but to avoid leaving slots dangling, release the deferred ones back like the budget path does).

> `dispatcher.js` is a Workflow script and "cannot execFileSync" (see line 76 comment). The sentinel detection must therefore be done by an `agent()` call that runs the bash and returns the result — consistent with how every other shell-out in this file is structured.

- [ ] **Step 1: Add the sentinel detection via an agent call**

Immediately after `phase('Launch')` (line 124) and before `const results = await parallel(` (line 125), insert:

```javascript
  // ── Sentinel: an interactive worker is active → yield one parallel slot ──
  const SENTINEL_SCHEMA = {
    type: 'object',
    required: ['interactive_worker_active'],
    properties: { interactive_worker_active: { type: 'boolean' } },
  }
  const sentinel = await agent(
    `Run this and report the result as JSON ONLY:
       bash ${REPO}/scripts/agent-lock.sh list | grep -q interactive-worker && echo found || echo none
     If output is "found": return {"interactive_worker_active": true}
     If output is "none":  return {"interactive_worker_active": false}`,
    { label: 'sentinel-check', phase: 'Launch', schema: SENTINEL_SCHEMA },
  )

  let maxParallel = launches.length
  if (sentinel && sentinel.interactive_worker_active) {
    maxParallel = Math.max(1, launches.length - 1)
    log(`Dispatcher: interactive-worker detected, reducing slots to ${maxParallel}`)
  }

  const toLaunch = launches.slice(0, maxParallel)
  const deferred = launches.slice(maxParallel)
  if (deferred.length) {
    log(`Dispatcher: deferring ${deferred.length} feature(s) to next tick (interactive-worker yield)`)
    await agent(
      `Release the slots for these deferred features so they re-queue cleanly next tick:
       ${JSON.stringify(deferred.map((f) => ({ external_id: f.external_id, brand: f.brand })))}
       For EACH: BRAND=<brand> bash ${REPO}/scripts/ticket.sh release-slot --id <external_id>
       Report which slots were released.`,
      { label: 'sentinel-defer', phase: 'Launch' },
    )
  }
```

- [ ] **Step 2: Point `parallel()` at `toLaunch` instead of `launches`**

Change line 126–127 from `launches.map(` to `toLaunch.map(`. The mapped arrow body is unchanged.

```javascript
  const results = await parallel(
    toLaunch.map(
      (f) => () =>
        workflow(
```

> Leave the downstream `launches.length` reference in the METRICS otel call (line 201) as-is — it reports how many were scheduled this tick, which is still correct. (Optional: the implementer may switch it to `toLaunch.length` for precision, but it is not required by the spec.)

- [ ] **Step 3: Verify it parses and check the budget**

Run: `node --check scripts/factory/dispatcher.js && wc -l scripts/factory/dispatcher.js`
Expected: no syntax error; line count well under 600.

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/dispatcher.js
git commit -m "feat(factory): dispatcher yields one slot when interactive-worker lock is active"
```

---

## Task 6: `/factory-worker-on` skill

**Files:**
- Create: `.claude/skills/factory-worker/SKILL.md`

Follow the exact Markdown/frontmatter style of `.claude/skills/factory-autopilot/SKILL.md` (mishap-tracking blockquote, numbered phases, fenced bash blocks). The DB query uses the same `kubectl exec ... deploy/shared-db` pattern shown in `factory-autopilot/SKILL.md` (no brand-domain literals).

- [ ] **Step 1: Write the skill file**

```markdown
---
name: factory-worker
description: Interactive Software-Factory worker. Invoke via /factory-worker-on when DeepSeek-Scout produced weak output (SCOUT_WEAK) or tickets sit in planning with no committed plan, and a human needs to scout + plan them so the autopilot can build them. Yields one autopilot parallel slot while active.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# factory-worker

A human-driven worker that complements the headless `factory-autopilot`. Where DeepSeek-Scout
fails (empty `touched_files`, thin spec → `SCOUT_WEAK=true` comment) or a ticket has no committed
plan, the interactive session scouts, brainstorms, and plans the ticket via `dev-flow-plan`, then
stages the plan so the autopilot picks it up on its next tick.

While this skill holds the sentinel lock, the autopilot dispatcher reduces its parallel slots by 1
(see `scripts/factory/dispatcher.js`), leaving the human room in the queue.

---

## Phase 1 — Claim the sentinel lock

Hold an `interactive-worker`-labelled claim so the dispatcher yields a slot:

```bash
bash scripts/agent-lock.sh claim ticket interactive-scout \
  --label interactive-worker --worktree "$PWD"
```

If this exits non-zero, another interactive worker is already active — coordinate, do not run a
second one.

---

## Phase 2 — Scan for tickets needing a human plan

Query the shared DB for tickets in `planning`/`backlog` that either have no committed plan
(`branch`/`plan_ref` unset) or carry a `SCOUT_WEAK=true` internal comment:

```bash
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- \
  psql -U postgres -d website -c "
SELECT t.external_id, t.title, t.brand, t.status
FROM tickets.tickets t
WHERE t.status IN ('planning','backlog')
  AND (
    t.plan_ref IS NULL
    OR EXISTS (
      SELECT 1 FROM tickets.ticket_comments c
      WHERE c.ticket_id = t.id
        AND c.body LIKE 'SCOUT_WEAK=true%'
        AND c.visibility = 'internal'
    )
  )
ORDER BY t.planning_rank ASC NULLS LAST, t.created_at ASC
LIMIT 10;"
```

> Column names: confirm against the live schema if the query errors (`\d tickets.tickets`,
> `\d tickets.ticket_comments`). Do not `SELECT *` or select large `content`/`body` columns over
> wide result sets (CLAUDE.md DB gotcha).

Present the result as a numbered list (external_id, title, brand, status) and ask the user which
ticket to plan.

---

## Phase 3 — Show context for the chosen ticket

```bash
bash scripts/ticket.sh get --id <EXTERNAL_ID>
```

If a `SCOUT_WEAK` comment exists, surface it so the user knows why the autopilot parked the ticket
(e.g. `touched_files=0`, `spec_length=<n>`).

---

## Phase 4 — Plan via dev-flow-plan

Invoke `dev-flow-plan` for the chosen ticket. It handles worktree setup, brainstorming, spec, and
plan creation, then commits and pushes the plan to the feature branch and stops. Note the resulting
`<branch>` and `<plan_path>` (relative repo path, e.g. `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`).

---

## Phase 5 — Stage the plan for the autopilot

After the plan is committed and pushed to the branch:

```bash
bash scripts/ticket.sh stage-plan --id <EXTERNAL_ID> --branch <branch> --plan <plan_path>
```

The next dispatcher tick's readiness guard (`scripts/factory/readiness-check.sh`, called from
`factory-prep-bridge.sh`) will confirm the branch + plan exist on `origin` and admit the ticket to
the autopilot's launch list.

Repeat Phases 2–5 for additional tickets, or proceed to Phase 6.

---

## Phase 6 — Release the sentinel lock

```bash
bash scripts/agent-lock.sh release ticket interactive-scout
```

The dispatcher regains its full parallel slot count on the next tick.

---

## Related Skills

| Skill | Beziehung |
|-------|-----------|
| `factory-autopilot` | Gegenstück — headless dispatcher this worker feeds |
| `dev-flow-plan` | Kern — does the actual scout/brainstorm/plan work |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/factory-worker/SKILL.md
git commit -m "feat(factory): /factory-worker-on interactive worker skill"
```

---

## Task 7: BATS tests (offline)

**Files:**
- Create: `tests/unit/factory-scout-quality.bats`
- Create: `tests/unit/factory-readiness.bats`

Both files must be tagged `offline` (no kubectl, no live cluster) so they run in CI's offline test job. Follow the existing style of `tests/unit/factory-blocked.bats` (`load test_helper`, `PROJECT_DIR` resolution). The bats-tag convention in this repo is a comment marker; mirror what other offline unit tests use. Inspect one first:

```bash
grep -rl 'bats:tag\|offline' tests/unit/*.bats | head; sed -n '1,12p' tests/unit/factory-blocked.bats
```

Apply the same tagging mechanism those files use (e.g. a `# bats file_tags=offline` line if present, or per-test `# bats test_tags=offline`). If no existing offline tag mechanism is found, add `# bats file_tags=offline` at the top of each new file.

### `tests/unit/factory-scout-quality.bats`

- [ ] **Step 1: Write the test file**

The module is `node`-loadable, so drive it with `node -e` and assert on JSON output.

```bash
#!/usr/bin/env bats
# bats file_tags=offline
# factory-scout-quality.bats — Unit tests for evaluateScoutQuality (pure JS, no cluster)

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
MOD="${PROJECT_DIR}/scripts/factory/scout-quality-check.js"

setup() { export PROJECT_DIR MOD; }

@test "scout-quality: module exists" {
  [ -f "$MOD" ]
}

@test "scout-quality: empty touched_files -> weak with touched_files_empty" {
  run node -e "const {evaluateScoutQuality}=require('$MOD'); const r=evaluateScoutQuality({touched_files:[],spec_content:'x'.repeat(400),plan_path:'p.md'}); process.stdout.write(JSON.stringify(r))"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"weak":true'* ]]
  [[ "$output" == *'touched_files_empty'* ]]
}

@test "scout-quality: spec under 300 chars -> weak with spec_too_short" {
  run node -e "const {evaluateScoutQuality}=require('$MOD'); const r=evaluateScoutQuality({touched_files:['a.ts'],spec_content:'short',plan_path:'p.md'}); process.stdout.write(JSON.stringify(r))"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"weak":true'* ]]
  [[ "$output" == *'spec_too_short'* ]]
}

@test "scout-quality: missing plan_path -> weak with no_plan_path" {
  run node -e "const {evaluateScoutQuality}=require('$MOD'); const r=evaluateScoutQuality({touched_files:['a.ts'],spec_content:'x'.repeat(400),plan_path:null}); process.stdout.write(JSON.stringify(r))"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"weak":true'* ]]
  [[ "$output" == *'no_plan_path'* ]]
}

@test "scout-quality: clean output -> not weak, empty reasons" {
  run node -e "const {evaluateScoutQuality}=require('$MOD'); const r=evaluateScoutQuality({touched_files:['a.ts','b.ts'],spec_content:'x'.repeat(400),plan_path:'docs/plan.md'}); process.stdout.write(JSON.stringify(r))"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"weak":false'* ]]
  [[ "$output" == *'"reasons":[]'* ]]
}
```

- [ ] **Step 2: Run it**

Run: `bats tests/unit/factory-scout-quality.bats`
Expected: 5 tests pass.

### `tests/unit/factory-readiness.bats`

- [ ] **Step 3: Write the test file**

Use a throwaway local git repo with a fake `origin` remote (a bare repo) so the test is fully offline — no network, no real `origin`. Build it in `$BATS_TEST_TMPDIR` (outside the repo tree, per the BATS temp-outside-tree convention).

```bash
#!/usr/bin/env bats
# bats file_tags=offline
# factory-readiness.bats — Unit tests for check_ticket_readiness (offline, local git fixture)

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
RC="${PROJECT_DIR}/scripts/factory/readiness-check.sh"

setup() {
  export PROJECT_DIR RC
  WORK="$(mktemp -d "${BATS_TEST_TMPDIR:-/tmp}/readiness.XXXXXX")"
  BARE="$WORK/origin.git"
  CLONE="$WORK/clone"
  git init --quiet --bare "$BARE"
  git clone --quiet "$BARE" "$CLONE"
  (
    cd "$CLONE"
    git config user.email t@t.test
    git config user.name test
    mkdir -p docs/superpowers/plans
    echo "# plan" > docs/superpowers/plans/test-plan.md
    git add -A
    git commit --quiet -m "add plan"
    git branch -M feature/has-plan
    git push --quiet -u origin feature/has-plan
  )
  export CLONE
}

teardown() { rm -rf "$WORK"; }

@test "readiness: missing args -> not ready, missing_args" {
  run bash "$RC" "" ""
  [ "$status" -eq 1 ]
  [[ "$output" == *'"ready":false'* ]]
  [[ "$output" == *'missing_args'* ]]
}

@test "readiness: branch not on origin -> not ready, no_branch" {
  run bash -c "cd '$CLONE' && bash '$RC' feature/does-not-exist docs/superpowers/plans/test-plan.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *'"ready":false'* ]]
  [[ "$output" == *'no_branch'* ]]
}

@test "readiness: plan file missing on branch -> not ready, no_plan_on_branch" {
  run bash -c "cd '$CLONE' && bash '$RC' feature/has-plan docs/superpowers/plans/missing.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *'"ready":false'* ]]
  [[ "$output" == *'no_plan_on_branch'* ]]
}

@test "readiness: branch + plan present -> ready, ok" {
  run bash -c "cd '$CLONE' && bash '$RC' feature/has-plan docs/superpowers/plans/test-plan.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ready":true'* ]]
  [[ "$output" == *'"reason":"ok"'* ]]
}
```

> Note: `readiness-check.sh` resolves `origin` from the CWD's git config, so the tests `cd` into the clone (whose `origin` is the bare repo). The first test (missing args) returns before any git call, so it needs no CWD setup.

- [ ] **Step 4: Run it**

Run: `bats tests/unit/factory-readiness.bats`
Expected: 4 tests pass.

- [ ] **Step 5: Commit both test files**

```bash
git add tests/unit/factory-scout-quality.bats tests/unit/factory-readiness.bats
git commit -m "test(factory): offline BATS for scout-quality + readiness-check"
```

---

## Task 8: Final verification (PFLICHT)

**Files:** none (verification only). Run from the worktree root.

- [ ] **Step 1: Run the new BATS directly**

Run: `bats tests/unit/factory-scout-quality.bats tests/unit/factory-readiness.bats`
Expected: 9 tests pass, 0 failures.

- [ ] **Step 2: Static-check the edited scripts**

```bash
node --check scripts/factory/pipeline.js
node --check scripts/factory/dispatcher.js
node --check scripts/factory/scout-quality-check.js
bash -n scripts/factory/factory-prep-bridge.sh
bash -n scripts/factory/readiness-check.sh
```
Expected: all silent (exit 0).

- [ ] **Step 3: Targeted changed-domain tests**

Run: `task test:changed`
Expected: passes. (Runs vitest `--changed`, the BATS selection for changed domains, and `quality:check` S1–S4 ratchet.)

- [ ] **Step 4: Regenerate freshness + test inventory**

```bash
task freshness:regenerate
task test:inventory
```
Expected: regenerates `website/src/data/test-inventory.json` (now including the two new BATS files) and other generated artifacts.

- [ ] **Step 5: CI-equivalent freshness/quality gate**

Run: `task freshness:check`
Expected: PASS — confirms S1 line ratchet (esp. `pipeline.js` ≤ 600), S2/S3/S4, and the baseline key-count assertion (no new baseline entries added).

> If `freshness:check` fails on S1 for `pipeline.js`, the gate block in Task 2 grew the file past 600. Condense it (single `const specProxy`, one-line comment) rather than adding a baseline exception — a baseline exception trips the key-count assertion.

- [ ] **Step 6: Commit regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/code-quality/repo-index.json docs/generated 2>/dev/null || true
git add -A
git commit -m "chore(factory): regenerate freshness artifacts + test inventory"
```

> If `freshness:regenerate` touched conflict-magnet files (`docs/generated/**`, `docs/code-quality/repo-index.json`, `k3d/docs-content-built/architecture/index.html`), commit them; resolve any later rebase conflicts on these with `git checkout --ours` per CLAUDE.md.

- [ ] **Step 7: Final confirmation**

Run: `git status` and `git log --oneline -8`
Expected: clean tree; commits for Tasks 1–8 present.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Mechanism 1 → Tasks 1–2; Mechanism 2 → Tasks 3–4; Mechanism 3 → Task 6; dispatcher slot-reduction → Task 5; BATS acceptance criteria → Task 7; verification gate → Task 8. All 7 acceptance-criteria checkboxes in the spec map to a task.
- **Naming consistency:** `evaluateScoutQuality` (Tasks 1, 2, 7), `check_ticket_readiness` (Tasks 3, 4, 7), `interactive-worker` label (Tasks 5, 6), `SCOUT_WEAK=true` marker (Tasks 2, 6). All consistent.
- **Spec deviation (documented):** spec writes `ticket.sh comment`; the real command is `add-comment` (default `--visibility internal`). The plan uses `add-comment` throughout. Spec query references `tickets.ticket_comments` / `planning_rank`; the skill query notes to confirm column names against the live schema.
- **Scout-gate timing nuance:** at the post-Scout gate `plan_path` is not yet known, so Task 2 passes `plan_path:'pending'` to avoid a spurious `no_plan_path` flag; the authoritative plan-presence check is the readiness guard (Task 4). The pure evaluator still implements all three criteria for reuse/testing.
