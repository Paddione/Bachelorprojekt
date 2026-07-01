---
title: "t001408-mishap-bundle — Implementation Plan"
ticket_id: T001408
domains: [infra, dev-flow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001408-mishap-bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three independent reliability gaps in the dev-flow CI/merge/lock chain — a false-positive agent-lock reap, a missing DIRTY-mergeState preflight in the CI watcher, and an invalid `gh pr checks --json` call.

**Architecture:** Three self-contained Bash-script/skill-doc edits, one per finding (M1/M2/M3), sharing a single branch and a single BATS verification pass. No manifest, Kustomize, or website changes — pure shell and Markdown.

**Tech Stack:** Bash, `gh` CLI, `jq`, BATS (`tests/unit/lib/bats-core`).

_Ticket: T001408_

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-07-01-t001408-mishap-bundle-design.md`.
- Failing-test contract already committed: `tests/spec/t001408-mishap-bundle.bats` (7 `@test` entries, all RED on this branch — do not rewrite or renumber them; make them green).
- Keep every script fail-open where the existing code is fail-open (`2>/dev/null || true` pattern).
- No new env-var defaults outside the existing `AGENT_LOCK_*` naming family.

## File Structure

```
scripts/agent-lock.sh                       # M1: grace-period + reap-log in _reapable()
scripts/devflow-ci-watch.sh                 # M2: mergeStateStatus preflight + rebase; M3: valid statusCheckRollup query
.claude/skills/dev-flow-execute/SKILL.md    # M2: document the rebase-conflict self-service in Schritt 5.5
tests/spec/t001408-mishap-bundle.bats       # existing RED contract — no edits, drives GREEN verification
```

### Pre-flight S1 budgets (effective threshold − live `wc -l`)

Both scripts are `.sh` (static limit 500, neither baselined → effective threshold = 500). `SKILL.md` is Markdown and is not gated by S1.

| File | wc -l | S1 budget |
|------|-------|-----------|
| `scripts/agent-lock.sh` | 249 | 251 |
| `scripts/devflow-ci-watch.sh` | 74 | 426 |

Both edits add well under 30 lines each, so both stay far below their 500-line thresholds. `.claude/skills/dev-flow-execute/SKILL.md` (662 lines) is Markdown — ungated by S1.

---

### Task M1: agent-lock grace-period + reap diagnostics

**Files:**
- Modify: `scripts/agent-lock.sh` (add `AGENT_LOCK_GRACE` default near line 19; add `_reap_log()` helper; extend `_reapable()` at lines 77-86)
- Test: `tests/spec/t001408-mishap-bundle.bats` (existing — `T001408-M1: *` tests)

**Interfaces:**
- Consumes: existing helpers `_lock_field`, `_lock_dir`, `_now`, `_sid_alive`, and the `AGENT_LOCK_TTL` default (1800).
- Produces: new `AGENT_LOCK_GRACE` env default (120s) and a `$(_lock_dir)/.reap.log` audit trail with `timestamp scope/id reason` lines (`reason` ∈ `worktree-missing` / `sid-dead` / `heartbeat-ttl`).

**Fix approach (from design Finding 1):** A dead *numeric* SID must no longer reap a claim younger than `AGENT_LOCK_GRACE`; the heartbeat-TTL path stays the ultimate fallback for genuinely stale sessions. Every reap decision appends a reason line for post-incident diagnosis.

- [ ] **Step 1: Run the BATS contract to confirm the RED baseline for M1**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001408-mishap-bundle.bats
# Expected: FAIL — tests 1-3 (T001408-M1: *) are red: no AGENT_LOCK_GRACE,
# the young claim is reaped, and no .reap.log is written.
```

- [ ] **Step 2: Add the `AGENT_LOCK_GRACE` default**

Next to the existing `AGENT_LOCK_TTL="${AGENT_LOCK_TTL:-1800}"` line (line 19):

```bash
AGENT_LOCK_GRACE="${AGENT_LOCK_GRACE:-120}"
```

This makes `@test "T001408-M1: agent-lock.sh defines an AGENT_LOCK_GRACE window"` (test 1) pass.

- [ ] **Step 3: Add the `_reap_log()` helper**

Place it just above `_reapable()` (before line 76):

```bash
# Append an append-only audit line whenever a claim is classified reapable.
# Fail-open: a write failure is ignored (consistent with the rest of the script).
# NOTE: .reap.log is not rotated here — small text lines; rotate in a follow-up if it grows.
_reap_log() {  # <lock-file> <reason>
  printf '%s %s/%s %s\n' "$(_now)" \
    "$(_lock_field "$1" scope)" "$(_lock_field "$1" id)" "$2" \
    >> "$(_lock_dir)/.reap.log" 2>/dev/null || true
}
```

- [ ] **Step 4: Extend `_reapable()` with the grace window + reap logging**

Replace the body at lines 77-86 with:

```bash
_reapable() {
  local f="$1" sid wt hb ct now age
  [ -f "$f" ] || return 0
  sid="$(_lock_field "$f" owner_sid)"; wt="$(_lock_field "$f" worktree)"
  hb="$(_lock_field "$f" heartbeat_at)"; ct="$(_lock_field "$f" created_at)"; now="$(_now)"
  if [ -n "$wt" ] && [ "$wt" != "-" ] && [ ! -d "$wt" ]; then _reap_log "$f" worktree-missing; return 0; fi
  if [ -n "$sid" ]; then
    if _sid_alive "$sid"; then return 1; fi
    # Dead numeric SID: a young claim (< AGENT_LOCK_GRACE) is protected from a
    # reap on the SID check alone — a transient session-id mismatch between tool
    # calls must not drop a fresh claim. Fall through to the heartbeat-TTL check.
    age=$(( now - ${ct:-0} ))
    if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
      _reap_log "$f" sid-dead; return 0
    fi
  fi
  if [ -n "$hb" ] && [ "$(( now - hb ))" -gt "$AGENT_LOCK_TTL" ]; then _reap_log "$f" heartbeat-ttl; return 0; fi
  return 1
}
```

Rationale: the `worktree-missing` branch stays unhardened (a missing directory is an unambiguous dead signal). The numeric-SID branch now respects the grace window, then defers to heartbeat-TTL — so a truly dead session still gets reaped after `AGENT_LOCK_TTL`.

- [ ] **Step 5: Run the M1 tests to verify GREEN**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001408-mishap-bundle.bats --filter 'M1'
# Expected: 3 tests pass — grace window defined, young claim survives a dead
# numeric SID, and .reap.log records the reap reason.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-lock.sh
git commit -m "fix(agent-lock): grace-period + reap-log so young claims survive a dead numeric SID [T001408]"
```

---

### Task M2: devflow-ci-watch mergeStateStatus preflight + rebase self-service

**Files:**
- Modify: `scripts/devflow-ci-watch.sh` (insert preflight block after line 19, before the `while true` loop)
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (Schritt 5.5 — document the exit-code-3 rebase-conflict handoff)
- Test: `tests/spec/t001408-mishap-bundle.bats` (existing — `T001408-M2: *` tests)

**Interfaces:**
- Consumes: `PR_URL` (positional arg 2), `gh pr view --json mergeStateStatus`, `git rebase`, `git push --force-with-lease`.
- Produces: an early exit code `3` on an unresolvable rebase conflict (distinct from the CI-red exit `1` and usage exit `2`); a `git rebase origin/main` invocation guaranteeing the CI poll loop only runs on a mergeable branch.

**Fix approach (from design Finding 2):** Before entering the CI polling loop, check `mergeStateStatus`; on `DIRTY`, self-service `git fetch origin main && git rebase origin/main` (clean → force-push and continue; conflict → abort cleanly and exit non-zero for the caller to resolve). This runs in the script itself so it protects any caller, not just an attentive agent.

- [ ] **Step 1: Confirm the RED baseline for M2**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001408-mishap-bundle.bats --filter 'M2'
# Expected: FAIL — the script mentions neither mergeStateStatus nor a rebase against main.
```

- [ ] **Step 2: Insert the preflight block**

After the telemetry `phase` call (line 17) and before `CI_ATTEMPT=0` (line 19):

```bash
# Preflight: if GitHub reports the PR as DIRTY (needs rebase), CI never starts —
# self-service a rebase against origin/main instead of hanging in the poll loop.
MERGE_STATE=$(gh pr view "$PR_URL" --json mergeStateStatus -q '.mergeStateStatus' 2>/dev/null || echo "")
if [[ "$MERGE_STATE" == "DIRTY" ]]; then
  echo "⚠ PR mergeStateStatus=DIRTY — Rebase gegen origin/main vor dem CI-Poll ..."
  git fetch origin main 2>/dev/null || true
  if git rebase origin/main; then
    git push --force-with-lease
  else
    git rebase --abort 2>/dev/null || true
    echo "❌ Rebase-Konflikt gegen origin/main — manuelle Konfliktlösung nötig (kein Auto-Force)." >&2
    exit 3
  fi
fi
```

Edge cases handled: no PR / `gh` failure → `MERGE_STATE` empty → preflight skipped (fail-open); a stale force-push (foreign commits landed) → `--force-with-lease` refuses and the error propagates instead of being swallowed.

- [ ] **Step 3: Document the handoff in dev-flow-execute Schritt 5.5**

In `.claude/skills/dev-flow-execute/SKILL.md` Schritt 5.5 (~line 435-444), add a sentence stating that when `devflow-ci-watch.sh` exits `3` (rebase conflict), the implementer subagent resolves the conflict itself and re-runs the watcher — it must NOT spawn a second subagent for the same branch (the double-push risk from the mishap).

- [ ] **Step 4: Run the M2 tests to verify GREEN**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001408-mishap-bundle.bats --filter 'M2'
# Expected: 2 tests pass — mergeStateStatus checked before the loop; rebase against origin/main present.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/devflow-ci-watch.sh .claude/skills/dev-flow-execute/SKILL.md
git commit -m "fix(devflow-ci-watch): DIRTY-mergeState preflight rebase before CI poll [T001408]"
```

---

### Task M3: replace invalid `gh pr checks --json` with a working statusCheckRollup query

**Files:**
- Modify: `scripts/devflow-ci-watch.sh` (lines 28-29 — the `FAILED_CHECKS` derivation)
- Test: `tests/spec/t001408-mishap-bundle.bats` (existing — `T001408-M3: *` tests)

**Interfaces:**
- Consumes: `PR_URL`, `gh pr view --json statusCheckRollup`.
- Produces: a `FAILED_CHECKS` value derived from a valid GraphQL rollup that covers both `CheckRun` (`conclusion`/`detailsUrl`) and `StatusContext` (`state`/`targetUrl`) node shapes.

**Fix approach (from design Finding 3):** `gh pr checks` has no `--json` flag (verified via `gh pr checks --help`), so line 28 silently yields empty input and reports "green" before checks run. Replace it with a `gh pr view --json statusCheckRollup` query that defensively handles both rollup node types.

- [ ] **Step 1: Confirm the RED baseline for M3**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001408-mishap-bundle.bats --filter 'M3'
# Expected: FAIL — the invalid `gh pr checks --json` flag is still present and
# no statusCheckRollup query exists.
```

- [ ] **Step 2: Replace the `FAILED_CHECKS` derivation**

Replace lines 28-29 (`FAILED_CHECKS=$(gh pr checks --json name,state,link ...)` and its `jq` continuation) with:

```bash
  FAILED_CHECKS=$(gh pr view "$PR_URL" --json statusCheckRollup \
    -q '.statusCheckRollup[] | select(
          (.conclusion // "") == "FAILURE" or (.conclusion // "") == "TIMED_OUT"
          or (.state // "") == "FAILURE"
        ) | (.name // .context // "unknown") + ": " + (.detailsUrl // .targetUrl // "")')
```

The `-q` (gh's built-in jq mode) surfaces a schema-break as a non-zero exit on stderr instead of silently reporting green — a strict improvement over the old `| jq -r` pipe. Verify the exact field names against a real open PR during implementation (no open PR exists on this branch at plan time); the expression already covers both known node shapes.

Known limit (documented, out of scope for T001408): a PR with *no* checks started still yields an empty `FAILED_CHECKS` (green), because the script does not distinguish "no checks yet" from "all checks green" — track as a follow-up if it recurs.

- [ ] **Step 3: Run the M3 tests to verify GREEN**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001408-mishap-bundle.bats --filter 'M3'
# Expected: 2 tests pass — no `gh pr checks --json` call; failed checks derived from statusCheckRollup.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/devflow-ci-watch.sh
git commit -m "fix(devflow-ci-watch): derive failed checks from valid statusCheckRollup query [T001408]"
```

---

### Task M4: Full verification & final gates

**Files:**
- No source edits — verification only.

- [ ] **Step 1: Full BATS contract green (all 7 tests)**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001408-mishap-bundle.bats
# Expected: PASS — all 7 tests green (was 7/7 RED at plan time).
```

- [ ] **Step 2: Shellcheck the two edited scripts**

```bash
shellcheck scripts/agent-lock.sh scripts/devflow-ci-watch.sh
# Expected: no new warnings introduced by the edits.
```

- [ ] **Step 3: Run the three mandatory CI gates**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Step 4: Commit any regenerated freshness artifacts**

```bash
git add -A
git commit -m "chore: regenerate freshness artifacts [T001408]" || echo "nothing to regenerate"
```

## Self-Review

- **Spec coverage:** M1 = design Finding 1 (grace + reap-log), M2 = Finding 2 (mergeStateStatus preflight + rebase self-service), M3 = Finding 3 (statusCheckRollup replacement). All three findings mapped.
- **Test mapping:** M1 → tests 1-3, M2 → tests 4-5, M3 → tests 6-7; M4 runs the full file plus the mandatory gates.
- **Type/name consistency:** `_reap_log()`, `AGENT_LOCK_GRACE`, `MERGE_STATE`, `FAILED_CHECKS` used consistently across tasks.
