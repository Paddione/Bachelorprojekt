---
title: "mishap-devflow-queue-T002272 — Implementation Plan"
ticket_id: T002272
domains: [software-factory/queue, skills/dev-flow-plan, skills/dev-flow-execute, tests/spec]
status: active
---

# mishap-devflow-queue-T002272 — Implementation Plan

_Ticket: T002272_

Mishap-Bundle with 3 entries, each already verified against the current `main` tip
(`3d91067da`) before being planned here:

- **Entry 1 (open):** `stage-plan` makes a task ticket dispatchable the instant it sets
  `plan_staged`, before a human has decided whether the factory should run it — T002267
  (PR #3311) fixed the agent-lock liveness bug that made this worse, but the timing gap
  itself (protection depends on the lock being live at exactly the right moment) remains.
  Fixed here with an explicit `execution_released` readiness flag (design option "a" from
  the ticket: a hands-off flag `stage-plan` sets and the human/`dev-flow-execute` releases).
- **Entry 2 (open):** `dev-flow-execute` SKILL.md still orders the CI-fix loop (Step 5.5)
  before enabling auto-merge (Step 6) — the exact ordering that left PR #3305 without
  `autoMergeRequest` set when the session ended mid-CI-watch. Fixed by moving auto-merge
  activation to immediately after `gh pr create`.
- **Entry 3 (verified, doc-only):** the concrete example
  (`tests/spec/factory-reclaim-lock-respect.bats:152`) is already fixed on `main`. A
  targeted repo scan for the same anti-pattern (`[[ "$output" == *...* ]]` against a
  script that prints `$0` in its usage line) found **1 historical case total, already
  fixed, 0 further open occurrences** across ~50 test files exercising such scripts. Given
  that low case count, a CI lint is not justified by cost/benefit — this plan adds a
  convention note instead (no script/lint changes for this entry).

Not in scope: T002271 (bug-type tickets falling out of `queue.sh` entirely — separate
ticket, `needs_human`) and `scripts/factory/dispatcher-prep.sh` (T002269, parallel ticket
— untouched here).

## File Structure

- `scripts/vda/ticket/stage-plan.sh` — add `--hold` flag: sets
  `readiness.execution_released=false`, skips the force-tick write + `factory.service`
  start when present; unchanged otherwise
- `scripts/ticket.sh` — add `release-hold` subcommand (sets
  `readiness.execution_released=true`, re-requests force-tick); update the `Commands:`
  usage line
- `scripts/factory/queue.sh` — gate the `type='task' AND status='plan_staged'` branch on
  `COALESCE((readiness->>'execution_released')::boolean, true) = true`
- `.claude/skills/dev-flow-plan/SKILL.md` — Step 4.5/5: pass `--hold` on the interactive
  `stage-plan` call; STOPP text mentions the ticket is held back from the factory
- `.claude/skills/references/ticket-stage-procedure.md` — document `--hold` as the SSOT
  for the stage-plan call shape
- `.claude/skills/dev-flow-execute/SKILL.md` — new opening step calling
  `ticket.sh release-hold`; move `gh pr merge --auto --squash --delete-branch` from Step 6
  to immediately after `gh pr create` in Step 5, ahead of the Step 5.5 CI-fix loop
- `CLAUDE.md` — one new bullet next to the existing "BATS convention (tests/spec/)" line
  documenting the `$output`-vs-worktree-path anti-pattern (Entry 3, doc-only)
- `tests/spec/software-factory.bats` — RED/GREEN tests for the `queue.sh` gate
- `tests/spec/dev-flow-plan.bats` — RED/GREEN tests for `stage-plan --hold` /
  `release-hold` / SKILL.md wording
- `tests/spec/ci-cd.bats` — RED/GREEN test for the dev-flow-execute Step 5/5.5/6 ordering

## Tasks

### Task 1: `queue.sh` respects `execution_released`

**File:** `scripts/factory/queue.sh`

1. RED test first — add to `tests/spec/software-factory.bats`:
   ```bash
   @test "T002272-M1: queue.sh WHERE clause gates plan_staged tasks on execution_released" {
     run grep -n "execution_released" "$REPO_ROOT/scripts/factory/queue.sh" 2>/dev/null || \
       run grep -n "execution_released" scripts/factory/queue.sh
     [ "$status" -eq 0 ]
   }
   bats tests/spec/software-factory.bats -f "T002272-M1"
   # expected: FAIL (queue.sh does not reference execution_released yet — red)
   ```
2. In `scripts/factory/queue.sh`, change:
   ```sql
   OR (type='task' AND status='plan_staged')
   ```
   to:
   ```sql
   OR (type='task' AND status='plan_staged'
       AND COALESCE((readiness->>'execution_released')::boolean, true) = true)
   ```
   Keep the existing comment above the clause and extend it to note the new gate and why
   the default is `true` (backward-compatible: only tickets that were explicitly held via
   `stage-plan --hold` are excluded).
3. Re-run: `bats tests/spec/software-factory.bats -f "T002272-M1"` — expected PASS.

### Task 2: `stage-plan --hold` and `ticket.sh release-hold`

**Files:** `scripts/vda/ticket/stage-plan.sh`, `scripts/ticket.sh`

1. RED test first — add to `tests/spec/dev-flow-plan.bats`:
   ```bash
   @test "T002272-M1: stage-plan accepts --hold" {
     run grep -n -- "--hold" "$REPO/scripts/vda/ticket/stage-plan.sh"
     [ "$status" -eq 0 ]
   }
   @test "T002272-M1: ticket.sh has a release-hold subcommand" {
     run bash -c "grep -c '^  release-hold)' '$REPO/scripts/ticket.sh'"
     [ "$output" != "0" ]
   }
   bats tests/spec/dev-flow-plan.bats -f "T002272-M1"
   # expected: FAIL (neither --hold nor release-hold exist yet — red)
   ```
2. In `scripts/vda/ticket/stage-plan.sh`:
   - Add `--hold` to the `while`-loop argument parser as a no-value boolean flag (`hold=1`).
   - After the existing `UPDATE tickets.tickets SET status='plan_staged', slot_count = …`
     statement, when `hold=1`, run a second `UPDATE` setting
     `readiness = COALESCE(readiness,'{}'::jsonb) || '{"execution_released":false}'::jsonb`
     for the same `external_id` (mirror the existing `_readiness_to_json`/lastenheft
     pattern already used elsewhere in `ticket.sh`).
   - Wrap the existing force-tick-flag `INSERT ... force-tick-requested` block and the
     `systemctl --user start factory.service` call in `if [[ "$hold" != "1" ]]; then … fi`.
   - Update the final `echo` to mention the held state when `hold=1`
     (e.g. `"Ticket $id staged in Kommissionierung (status=plan_staged, execution held)"`).
3. In `scripts/ticket.sh`:
   - Add a `cmd_release_hold()` function (near `cmd_stage_plan`) that: takes `--id`,
     runs an `UPDATE tickets.tickets SET readiness = COALESCE(readiness,'{}'::jsonb) ||
     '{"execution_released":true}'::jsonb WHERE external_id = :'ext_id'`, then re-inserts
     the `force-tick-requested` control-flag row (same `INSERT ... ON CONFLICT` shape used
     in `stage-plan.sh`, `set_by='release-hold'`), then best-effort
     `systemctl --user start factory.service 2>/dev/null || true`.
   - Wire it into the command dispatcher (`release-hold) cmd_release_hold "$@" ;;`) and add
     `release-hold` to the `Commands:` usage string (alongside `stage-plan`).
4. Re-run: `bats tests/spec/dev-flow-plan.bats -f "T002272-M1"` — expected PASS.

### Task 3: Wire `--hold`/`release-hold` into the dev-flow skill docs

**Files:** `.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/references/ticket-stage-procedure.md`, `.claude/skills/dev-flow-execute/SKILL.md`

1. RED test first — add to `tests/spec/dev-flow-plan.bats`:
   ```bash
   @test "T002272-M1: dev-flow-plan SKILL.md stage-plan call passes --hold" {
     run grep -n -- "stage-plan.*--hold" "$PLAN_SKILL" "$REPO/.claude/skills/references/ticket-stage-procedure.md"
     [ "$status" -eq 0 ]
   }
   @test "T002272-M1: dev-flow-execute SKILL.md calls release-hold" {
     run grep -n "release-hold" "$EXEC_SKILL"
     [ "$status" -eq 0 ]
   }
   bats tests/spec/dev-flow-plan.bats -f "T002272-M1"
   # expected: FAIL (docs not updated yet — red)
   ```
2. In `.claude/skills/references/ticket-stage-procedure.md`, update the documented
   `stage-plan` invocation to include `--hold` for the interactive dev-flow-plan caller,
   and add one sentence explaining the flag (points at
   `openspec/specs/dev-flow-plan.md` REQ-DFP-HOLD-001/002 as SSOT).
3. In `.claude/skills/dev-flow-plan/SKILL.md` Step 4.5 (references
   `ticket-stage-procedure.md` already — just add a short callout that the interactive
   path always uses `--hold`) and Step 5 STOPP text (append: "Ticket ist per
   `execution_released=false` vom Factory-Dispatch zurückgehalten, bis
   `dev-flow-execute` es mit `release-hold` freigibt.").
4. In `.claude/skills/dev-flow-execute/SKILL.md`, add a new opening step (before the
   existing Step 1/2, e.g. "Schritt 0.5: Ticket freigeben") that runs
   `bash scripts/ticket.sh release-hold --id "$TICKET_ID"` — best-effort, `|| true`,
   since a ticket staged without `--hold` (mishap-tracker auto-plans) simply has no hold
   to release.
5. Re-run: `bats tests/spec/dev-flow-plan.bats -f "T002272-M1"` — expected PASS.

### Task 4: Reorder auto-merge before the CI-fix loop in dev-flow-execute

**File:** `.claude/skills/dev-flow-execute/SKILL.md`

1. RED test first — add to `tests/spec/ci-cd.bats`:
   ```bash
   @test "T002272-M2: dev-flow-execute Step 5 requests auto-merge before the CI-watch loop" {
     EXEC_SKILL="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
     merge_line=$(grep -n -- "gh pr merge --auto" "$EXEC_SKILL" | head -1 | cut -d: -f1)
     watch_line=$(grep -n "devflow-ci-watch.sh \"\$TICKET_ID\"" "$EXEC_SKILL" | head -1 | cut -d: -f1)
     [ -n "$merge_line" ] && [ -n "$watch_line" ]
     [ "$merge_line" -lt "$watch_line" ]
   }
   bats tests/spec/ci-cd.bats -f "T002272-M2"
   # expected: FAIL (today gh pr merge --auto is AFTER devflow-ci-watch.sh — red)
   ```
2. In `.claude/skills/dev-flow-execute/SKILL.md`:
   - Move the `gh pr merge --auto --squash --delete-branch` line (currently the closing
     command of "Schritt 6: Auto-Merge wenn CI grün") to directly follow the
     `commit-commands:commit-push-pr` / `gh pr create` line in "Schritt 5: PR erstellen".
   - Keep the M1-lesson (T001899) callout — reword it to state it is satisfied by Step 5
     already containing an implementation-commit push, so no reordering issue arises.
   - Keep "Schritt 5.5: CI/CD-Fix-Schleife" where it is, but reword its intro sentence
     from "überwache CI und behebe Fehler — bevor du mergst" to "überwache CI und behebe
     Fehler — Auto-Merge ist bereits angefordert (Schritt 5) und greift, sobald die
     Required Checks grün sind".
   - Keep the fail-closed phase-chain-gate (`assert-phase-chain`) in "Schritt 6" as the
     remaining content of that step (it still gates ticket-closure sanity even though the
     merge command itself moved) — reword the step heading to "Schritt 6: Phase-Chain-Gate
     & Merge-Wait" instead of "Auto-Merge wenn CI grün".
3. Re-run: `bats tests/spec/ci-cd.bats -f "T002272-M2"` — expected PASS.

### Task 5: Entry 3 — convention note, no lint (doc-only)

**File:** `CLAUDE.md`

1. No RED/GREEN test for this task — it is a documentation-only convention note, not a
   behavior change; STRUCT2 for this plan is satisfied by Tasks 1–4 above.
2. In `CLAUDE.md`, directly below the existing "BATS convention (tests/spec/)" bullet
   (the one starting "New `@test` entries belong in..."), add one new bullet:
   > **BATS `$output` matching:** never assert `[[ "$output" == *"<term>"* ]]` unqualified
   > against a script's full stdout+stderr — if the script prints `$0` in its usage/help
   > text (common; `grep -rl 'echo.*\$0\|Usage:.*\$0' scripts/*.sh` lists current
   > offenders), the invoking worktree's directory name (itself usually derived from the
   > change slug) can satisfy the match even when the feature being tested does not exist
   > yet. Narrow the assertion to the relevant output line first
   > (`... | grep '^Commands:' | grep -c 'term'`). One confirmed case fixed in
   > `tests/spec/factory-reclaim-lock-respect.bats` (T002267/T002272); repo-wide scan
   > found no further open occurrences, so this stays a documented convention rather than
   > a CI lint for now — re-evaluate if more cases surface.
3. This bullet doubles as the record of the case-count finding (T002272 Entry 3): 1
   historical case, already fixed; 0 further open occurrences found.

## Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
