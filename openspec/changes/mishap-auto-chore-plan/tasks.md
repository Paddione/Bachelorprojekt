---
title: "mishap-auto-chore-plan — Implementation Plan"
ticket_id: T001844
domains: [software-factory, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-auto-chore-plan — Implementation Plan

_Ticket: T001844_

Design spec: `docs/superpowers/specs/2026-07-15-mishap-auto-chore-plan-design.md`.

## File Structure

| File | Ist-Zeilen | Budget (wirksame Schwelle) |
|------|-----------|----------------------------|
| `.claude/skills/mishap-tracker/SKILL.md` | 137 | kein S1-Limit (`.md` ist nicht in `gates.yaml → s1.limits`) |
| `scripts/factory/queue.sh` | 23 | 477 (Limit 500, nicht-baselined) |
| `scripts/factory/slots.sh` | 37 | 463 (Limit 500, nicht-baselined) |
| `scripts/factory/dispatcher-bridge.sh` | 93 | 407 (Limit 500, nicht-baselined) |
| `scripts/factory/pipeline.js` | 766 | S1-exempt (`gates.yaml → s1.ignore`, T000460) |
| `tests/spec/software-factory.bats` | 3458 | kein S1-Limit (`.bats` fehlt in `s1.limits`; orphan-allow `tests/**/*.bats`) |

All budgets computed from `wc -l` + `jq -r '."S1:<path>".metric // "nicht-baselined"' docs/code-quality/baseline.json`; every touched code file has ≥ 400 lines of headroom or is exempt, so no split/shrink step is required.

Design correction carried into this plan: the design spec says the skill reads
`severity` via `ticket.sh get --id <ext-id>`, but `scripts/vda/ticket/get.sh` builds a JSON
object with NO `severity` (and no `description`) key. The gating therefore reads the skill's
own in-session `MISHAP_LOG` entry types — equivalent to `mishap.go`'s `hasCritical` — which
also removes a DB round-trip and works offline. No change to `get.sh` or `mishap.go`.

## Task 1 — RED: add failing factory-plumbing tests

Add five offline, grep-based `@test` cases to `tests/spec/software-factory.bats` (append after
the existing FA-SF-45 block near line 1958, following the established `grep -Eq …` /
`grep -Fq …` structural-assertion style). These reproduce the gap: the four factory scripts do
not yet handle `plan_staged` task tickets or `chore/` branches, so the tests FAIL on the
current branch.

Add exactly these tests (assertions must match the Task 2–5 snippets verbatim):

```bash
# ── FA-SF-52: mishap auto-chore-plan factory plumbing [T001844] ──────────────#
@test "FA-SF-52: queue.sh also selects plan_staged task tickets" {
  run grep -Eq "type='task' AND status='plan_staged'" scripts/factory/queue.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-52: slots.sh claim allows plan_staged status" {
  run grep -Fq "status IN ('backlog','triage','plan_staged')" scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-52: dispatcher-bridge strips feature|fix|chore prefix from slug" {
  run grep -Fq "s#^(feature|fix|chore)/#" scripts/factory/dispatcher-bridge.sh
  [ "$status" -eq 0 ]
  # old feature-only strip must be gone
  run grep -Fq "sed 's/^feature\\///'" scripts/factory/dispatcher-bridge.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-52: pipeline.js deploy guard admits chore branches" {
  run grep -Fq '^(feature|fix|chore)/' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-52: pipeline.js PR title uses chore prefix for chore branches" {
  run grep -Fq "WORK_BRANCH.startsWith('chore/') ? 'chore' : 'feat'" scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  run grep -Fq '${titlePrefix}(${slug})' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}
```

Run the new tests and confirm they are RED:

```bash
tests/unit/lib/bats-core/bin/bats --filter 'FA-SF-52' tests/spec/software-factory.bats
# expected: FAIL (red — none of the four scripts carry the new tokens yet)
```

## Task 2 — queue.sh: consume plan_staged task tickets

In `scripts/factory/queue.sh`, widen the `WHERE` clause so task tickets that already carry a
staged plan are scheduled, without requiring the feature-only `lastenheft_locked` flag.
Replace the current predicate:

```sql
  WHERE type='feature' AND status='backlog'
    -- Pflichtenheft → Lastenheft gate: the autopilot only picks up tickets whose
    -- Lastenheft is locked (requirements firm = AI-ready). Fail-closed on absent flag.
    AND COALESCE((readiness->>'lastenheft_locked')::boolean, false) = true
```

with:

```sql
  WHERE (
      -- Feature backlog: Lastenheft-locked (requirements firm = AI-ready).
      (type='feature' AND status='backlog'
       AND COALESCE((readiness->>'lastenheft_locked')::boolean, false) = true)
      -- Staged chore/task tickets (e.g. mishap-tracker auto-plans): the plan is
      -- already authored + lint-gated by stage-plan, so no lastenheft gate applies.
      OR (type='task' AND status='plan_staged')
    )
```

The `SELECT … external_id, title, priority, touched_files, created_at` projection and the
`ORDER BY` are unchanged. This makes the FA-SF-52 `queue.sh` test GREEN.

## Task 3 — slots.sh: allow claiming a plan_staged ticket

In `scripts/factory/slots.sh`, the `claim` branch guards the atomic UPDATE with
`status IN ('backlog','triage')`. A staged task ticket sits at `plan_staged`, so extend the
list. Change the `claim` UPDATE's WHERE from `AND status IN ('backlog','triage')` to:

```
AND status IN ('backlog','triage','plan_staged')
```

(Only that one `IN (...)` list changes; the `pipeline_slot IS NULL` race guard and
`SET … status='in_progress'` are unchanged.) This makes the FA-SF-52 `slots.sh` test GREEN.

## Task 4 — dispatcher-bridge.sh: prefix-agnostic slug extraction

In `scripts/factory/dispatcher-bridge.sh` line ~43, the slug is stripped with a
feature-only `sed 's/^feature\///'`, which leaves `chore/<slug>` with a stray `chore/` (slash
leaks into the worktree path). Make it prefix-agnostic. Replace:

```bash
  slug="$(echo "$row" | jq -r '.branch // ""' | sed 's/^feature\///')"
```

with:

```bash
  slug="$(echo "$row" | jq -r '.branch // ""' | sed -E 's#^(feature|fix|chore)/##')"
```

The existing `[[ -z "$slug" ]] && slug="sf-…"` fallback on the next line is unchanged. This
makes the FA-SF-52 `dispatcher-bridge` test GREEN (new token present, old token gone).

## Task 5 — pipeline.js: chore branches through deploy guard + PR title

`scripts/factory/pipeline.js` is S1-exempt; `node --check` must still pass. Two edits:

1. **Deploy HARD-GUARD (line ~671–672).** The guard rejects any branch not matching
   `^(feature|fix)/`. Since a mishap chore ticket's `WORK_BRANCH` is auto-detected as
   `chore/<slug>` from the `FACTORY-PLAN-REF` comment (`pipeline.js:114–134`, `REUSE` path),
   admit `chore` in BOTH the comment prose and the `grep -Eq` regex. Replace both occurrences
   of `^(feature|fix)/` in that guard block with `^(feature|fix|chore)/`, e.g.:

   ```js
      a. Branch: WORK_BRANCH must match ^(feature|fix|chore)/ .
         printf '%s' "${WORK_BRANCH}" | grep -Eq '^(feature|fix|chore)/' || { echo "BLOCK: WORK_BRANCH ${WORK_BRANCH} not feature/*|fix/*|chore/*"; exit 1; }
   ```

2. **PR title (line ~684).** It hardcodes `feat(${slug})`. Derive the prefix from the work
   branch instead. Immediately after the `WORK_BRANCH` definition (line ~134) add:

   ```js
   const titlePrefix = WORK_BRANCH.startsWith('chore/') ? 'chore' : 'feat'
   ```

   and change the PR-create step from `--title "feat(${slug}): ${A.title}"` to:

   ```js
      2. Open PR: gh pr create --title "${titlePrefix}(${slug}): ${A.title}" --base main
   ```

Verify the file still parses:

```bash
node --check scripts/factory/pipeline.js   # expected: exit 0
```

Both FA-SF-52 `pipeline.js` assertions (`^(feature|fix|chore)/` and the `titlePrefix` ternary
+ `${titlePrefix}(${slug})`) now match, turning them GREEN. `conflict-check.sh` already carries
`type IN ('feature','task')` (line ~121) — no change needed.

## Task 6 — mishap-tracker SKILL.md: document the auto-chore-plan flow

Edit `.claude/skills/mishap-tracker/SKILL.md` (documentation only; `.md` has no S1 limit).
Insert a new section between Step 3 (buffer flush) and Step 4 (fallback), titled
`## Step 3.5: Non-critical bundle → auto-chore-plan`, that specifies the flow the executing
agent runs when a bundle ticket has just been created (external id `<ext-id>`):

1. **Gate on the local `MISHAP_LOG` (NOT `ticket.sh get`).** Compute `has_critical` = any
   `MISHAP_LOG` entry whose `type` is `broken` or `security`. Note explicitly in the doc that
   `ticket.sh get` exposes no `severity`/`description`, so the in-session log is authoritative
   (mirrors `mishap.go` `classifyBundle` → `severity=major`). If `has_critical` → **stop**:
   ticket stays `status=triage` for manual triage (today's behavior). Else continue.
2. **Slug.** `slug="mishap-$(echo "<ext-id>" | tr '[:upper:]' '[:lower:]')"`.
3. `bash scripts/openspec.sh propose "$slug" --ticket <ext-id>` — seeds the plan-lint-conform
   `openspec/changes/$slug/tasks.md` skeleton (headless; no brainstorming).
4. **Delegate authoring to a fresh subagent** (provision per
   `.claude/skills/references/subagent-provisioning.md`; include the anti-context-overflow
   handoff directive). Pass the full `MISHAP_LOG` entries as context. The subagent fills
   `openspec/changes/$slug/tasks.md` with:
   - one Fix-Task per `MISHAP_LOG` entry, each naming the affected component and the concrete
     remediation from that entry's `description`;
   - at least one real RED failing-test step carrying the literal phrase `expected: FAIL` plus
     a real runner invocation (`bats … tests/spec/<file>.bats` or `vitest …`) against an
     existing test file — the plan-lint STRUCT2 requirement;
   - a final verify task listing `task test:changed`, `task freshness:regenerate`,
     `task freshness:check` (STRUCT3);
   - required frontmatter (`title`, `ticket_id`, `domains`, `status`) and the
     `# <slug> — Implementation Plan` / `## File Structure` shape (STRUCT1).
5. `bash scripts/plan-lint.sh openspec/changes/$slug/tasks.md` — hard gate. On FAIL, re-delegate
   with the linter output (bounded to 2 retries). If still failing: **do not** call
   `stage-plan`; leave the ticket at `status=triage` and report the lint failure (no rollback
   needed — nothing was staged).
6. `./scripts/ticket.sh stage-plan --id <ext-id> --branch "chore/$slug" --plan "openspec/changes/$slug/tasks.md"`
   — sets `status=plan_staged`, writes the `FACTORY-PLAN-REF branch=chore/$slug plan=…` comment
   and marks scout/design/plan phase-events done (existing `stage-plan.sh` behavior).
7. Commit + push the `chore/$slug` branch:
   `git add openspec/changes/$slug && git commit -m "chore(plans): stage $slug for factory [<ext-id>]" && git push -u origin "chore/$slug"`.
   From here the Software Factory (Tasks 2–5) auto-detects the `FACTORY-PLAN-REF`, schedules
   the ticket, and drives it to merge.

Also update **Step 5 (Summary)** to additionally report, when a bundle was non-critical,
whether an auto-chore-plan was staged (branch `chore/$slug`, `status=plan_staged`) or skipped
(lint failure → `status=triage`).

No BATS assertion targets SKILL.md prose (documentation, not executable); the executable
contract for this change is covered by the FA-SF-52 factory-plumbing tests in Task 1.

## Task 7 — Regenerate test inventory

A new `@test` was added in Task 1, so the committed inventory must be refreshed:

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/software-factory.bats
```

Commit the regenerated `website/src/data/test-inventory.json` alongside the test change (CI
fails if it drifts).

## Task 8 — GREEN + final verification

1. Confirm the Task-1 tests are now GREEN:

   ```bash
   tests/unit/lib/bats-core/bin/bats --filter 'FA-SF-52' tests/spec/software-factory.bats
   # expected: PASS (all 5 tests green after Tasks 2–6)
   ```

2. Validate the OpenSpec change:

   ```bash
   bash scripts/openspec.sh validate    # or: task test:openspec
   ```

3. Run the three mandatory CI gates:

   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```
