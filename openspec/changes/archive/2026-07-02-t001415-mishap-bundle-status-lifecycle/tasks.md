---
title: "t001415-mishap-bundle-status-lifecycle — Implementation Plan"
ticket_id: T001415
domains: [infra, dev-flow, tickets]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001415-mishap-bundle-status-lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix three independent reliability gaps in the dev-flow Lock/Merge/Auto-Close chain — a stale agent-lock claim when the owner PID dies, a missing `mergeable=CONFLICTING` preflight in the CI watcher, and a missing factory poll that auto-closes tickets when their PR is merged outside the factory pipeline.

**Architecture:** Three self-contained Bash-script edits (one new script + two existing-script extensions) plus two SKILL/README touch-ups, all in a single branch with a single BATS verification pass. No manifest, Kustomize, or website changes — pure shell and Markdown.

**Tech Stack:** Bash, `gh` CLI, `jq`, BATS (`tests/unit/lib/bats-core`).

_Ticket: T001415_

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-07-01-t001415-mishap-bundle-design.md`.
- Failing-test contract already committed: `tests/spec/t001415-mishap-bundle.bats` (9 `@test` entries, 7 RED on this branch — do not rewrite or renumber them; make them green).
- Keep every script fail-open where the existing code is fail-open (`2>/dev/null || true` pattern).
- No new env-var defaults outside the existing `AGENT_LOCK_*` naming family.
- `BRAND` is always required in `auto-close-merged.sh` (mirror `auto-enqueue.sh` contract).

## File Structure

```
scripts/agent-lock.sh                                          # M1: pid-dead reap branch
scripts/devflow-ci-watch.sh                                    # M2: CONFLICTING preflight → exit 4
.claude/skills/dev-flow-execute/SKILL.md                       # M2: rebase-conflict recovery doc
scripts/factory/auto-close-merged.sh                           # M3 (new): gh pr list → ticket.sh update-status
scripts/factory/wakeup.sh                                      # M3: invoke auto-close-merged per brand
tests/spec/t001415-mishap-bundle.bats                          # existing RED contract — drives GREEN verification
openspec/changes/t001415-mishap-bundle-status-lifecycle/       # proposal + tasks + delta spec (this change)
```

### Pre-flight S1 budgets (effective threshold − live `wc -l`)

All touched scripts are `.sh` (static limit 500, none baselined → effective threshold = 500). `SKILL.md` and the new BATS file are ungated by S1.

| File | wc -l | S1 budget |
|------|-------|-----------|
| `scripts/agent-lock.sh` | 317 | 183 |
| `scripts/devflow-ci-watch.sh` | 103 | 397 |
| `scripts/factory/wakeup.sh` | 142 | 358 |
| `scripts/factory/auto-close-merged.sh` (new) | 0 | 500 |

All edits add well under 100 lines per file, so all four stay far below their 500-line thresholds.

---

### Task M1: agent-lock dead-owner-PID reap branch

**Files:**
- Modify: `scripts/agent-lock.sh` (extend `_reapable()` after line 92; add optional `_pid_alive()` helper near line 50)
- Test: `tests/spec/t001415-mishap-bundle.bats` (existing — `T001415-M1: *` tests)

**Interfaces:**
- Consumes: existing helpers `_lock_field`, `_lock_dir`, `_now`, `_reap_log`, `AGENT_LOCK_GRACE`.
- Produces: a new reap reason `pid-dead` in `.reap.log` when `kill -0 "$owner_pid"` fails AND the claim is older than `AGENT_LOCK_GRACE` seconds.

**Fix approach (from design Finding 1):** Owner-PID aliveness becomes the first reap check (before `worktree-missing`). An empty `owner_pid` field (legacy locks without it) skips the check (fail-open). The existing reap branches keep their current semantics — only the new branch is added.

- [ ] **Step 1: Run the BATS contract to confirm the RED baseline for M1**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001415-mishap-bundle.bats --filter 'M1'
# Expected: FAIL — test 1 red (no pid-dead reap), test 2 already green (young claim protected).
```

- [ ] **Step 2: Add a `_pid_alive()` helper**

Insert after `_sid_alive()` (after line 50, before `_detect_tool()`):

```bash
_pid_alive() {  # <pid>
  [ -n "${1:-}" ] || return 1
  kill -0 "$1" 2>/dev/null
}
```

Returns 0 if the PID is alive, 1 otherwise. Empty input is treated as "unknown" (return 1) — the caller decides what to do with an empty PID.

- [ ] **Step 3: Extend `_reapable()` with the pid-dead branch**

In `_reapable()` (lines 87-105), add the pid-dead check as the FIRST reap check, before the `worktree-missing` branch:

```bash
_reapable() {
  local f="$1" sid wt hb ct now age pid
  [ -f "$f" ] || return 0
  sid="$(_lock_field "$f" owner_sid)"; wt="$(_lock_field "$f" worktree)"
  hb="$(_lock_field "$f" heartbeat_at)"; ct="$(_lock_field "$f" created_at)"; now="$(_now)"
  pid="$(_lock_field "$f" owner_pid)"
  if [ -n "$pid" ]; then
    if ! _pid_alive "$pid"; then
      age=$(( now - ${ct:-0} ))
      if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
        _reap_log "$f" pid-dead; return 0
      fi
    fi
  fi
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

Rationale: pid-dead fires first so the auditable reason names the actual cause. The grace window protects young claims (subshell PID recycling). Empty `owner_pid` (legacy locks) skips the check; the existing reap branches still decide.

- [ ] **Step 4: Run the M1 tests to verify GREEN**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001415-mishap-bundle.bats --filter 'M1'
# Expected: 2 tests pass — pid-dead reap with reason, young claim protected.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-lock.sh
git commit -m "fix(agent-lock): reap claims whose owner PID is dead after grace window [T001415]"
```

---

### Task M2: devflow-ci-watch CONFLICTING-PR preflight

**Files:**
- Modify: `scripts/devflow-ci-watch.sh` (extend the existing `MERGE_STATE` preflight block at lines 21-37)
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (Schritt 5.5 — document the exit-code-4 rebase-conflict handoff)
- Test: `tests/spec/t001415-mishap-bundle.bats` (existing — `T001415-M2: *` tests)

**Interfaces:**
- Consumes: `PR_URL` (positional arg 2), `gh pr view --json mergeable`.
- Produces: an early exit code `4` on `mergeable == CONFLICTING` (distinct from the T001408 DIRTY exit `3`, the CI-red exit `1`, and the usage exit `2`); a stderr message naming "conflict" with a "rebase manually" suggestion.

**Fix approach (from design Finding 2):** After the existing DIRTY preflight (T001408), additionally query `gh pr view --json mergeable`. On `CONFLICTING`, exit 4 with a clear message and do NOT attempt an auto-resolve (semantic merge conflicts cannot be safely auto-resolved). On `UNKNOWN` (GitHub has not yet evaluated), proceed normally.

- [ ] **Step 1: Confirm the RED baseline for M2**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001415-mishap-bundle.bats --filter 'M2'
# Expected: FAIL — neither mergeable query nor CONFLICTING exit 4 is present.
```

- [ ] **Step 2: Extend the preflight with the mergeable check**

In `scripts/devflow-ci-watch.sh`, after the `DIRTY` preflight block (lines 21-37) and before `CI_ATTEMPT=0` (line 39), insert:

```bash
# Conflict preflight: a PR with real merge conflicts (mergeable=CONFLICTING)
# never starts CI checks — bail with a clear message instead of hanging.
MERGEABLE=$(gh pr view "$PR_URL" --json mergeable -q '.mergeable' 2>/dev/null || echo "")
if [[ "$MERGEABLE" == "CONFLICTING" ]]; then
  echo "❌ PR hat echte Merge-Konflikte gegen main (mergeable=CONFLICTING) — manueller Rebase nötig (kein Auto-Resolve möglich)." >&2
  echo "   Worktree: $WORK_WT  Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)" >&2
  echo "   Fix: rebase den Branch auf origin/main, dann rufe devflow-ci-watch.sh erneut auf." >&2
  exit 4
fi
```

The `MERGEABLE == "UNKNOWN"` case is intentionally not handled — UNKNOWN means GitHub has not evaluated the PR yet, which is normal right after a push; the poll loop will pick up the answer.

- [ ] **Step 3: Document the exit-code-4 recovery in dev-flow-execute Schritt 5.5**

In `.claude/skills/dev-flow-execute/SKILL.md` Schritt 5.5 (~line 439-444), after the existing exit-code-3 rebase-conflict paragraph, add a paragraph stating that exit code `4` means the PR has real merge conflicts against main (not just a stale branch) and the implementer subagent must resolve them manually before re-running the watcher — it must NOT spawn a second subagent for the same branch.

- [ ] **Step 4: Run the M2 tests to verify GREEN**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001415-mishap-bundle.bats --filter 'M2'
# Expected: 2 tests pass — mergeable query present, CONFLICTING exit 4 present.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/devflow-ci-watch.sh .claude/skills/dev-flow-execute/SKILL.md
git commit -m "fix(devflow-ci-watch): exit 4 on CONFLICTING PRs with clear rebase-manual message [T001415]"
```

---

### Task M3: factory poll auto-closes tickets whose PR is merged (HEADLINE)

**Files:**
- Create: `scripts/factory/auto-close-merged.sh` (new script, mirrors `auto-enqueue.sh` shape)
- Modify: `scripts/factory/wakeup.sh` (add per-brand `auto-close-merged.sh` invocation in the tick loop)
- Test: `tests/spec/t001415-mishap-bundle.bats` (existing — `T001415-M3: *` tests)
- Delta: `openspec/changes/t001415-mishap-bundle-status-lifecycle/specs/t001415-mishap-bundle.md` (already committed in this change)

**Interfaces:**
- Consumes: `BRAND` (env, required), `gh pr list --state merged --limit 30 --json number,title,mergedAt`, `scripts/ticket.sh update-status`.
- Produces: per merged PR whose title contains `[T\d{6}]`, an idempotent `ticket.sh update-status --id $TICKET --status done --resolution shipped|fixed` call when the ticket is in a non-terminal status.

**Fix approach (from design Finding 3):** New script `auto-close-merged.sh` mirrors the shape of `auto-enqueue.sh` (DRY-run, BRAND-required, fail-open stderr prefix). For each merged PR in the last 30, it extracts the first `T-NNNNNN` tag, looks up the ticket, and transitions non-terminal ones. `wakeup.sh` invokes the script for each brand before the dispatcher tick, in the same best-effort style as `auto-enqueue.sh` and `auto-triage.sh`.

- [ ] **Step 1: Confirm the RED baseline for M3**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001415-mishap-bundle.bats --filter 'M3'
# Expected: FAIL — auto-close-merged.sh does not exist, wakeup.sh does not call it.
```

- [ ] **Step 2: Create `scripts/factory/auto-close-merged.sh`**

Create the new script at `scripts/factory/auto-close-merged.sh` (chmod +x). The contract mirrors `scripts/factory/auto-enqueue.sh`:

```bash
#!/usr/bin/env bash
# scripts/factory/auto-close-merged.sh — factory poll: close tickets whose
# associated PR is already merged on GitHub but the local ticket status has
# not yet advanced to done. Closes the auto-close gap observed in T001415
# (T001371, T001412, T414 all merged without their tickets transitioning).
#
# Usage: BRAND=<brand> bash scripts/factory/auto-close-merged.sh [--dry-run]
#
# Env:
#   BRAND              — mentolder|korczewski (required)
#   FACTORY_DRY_RESOLVE — when set, skips cluster access (offline-test)
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"

DRY_RUN=false
while [[ $# -gt 0 ]]; do case "$1" in
  --dry-run) DRY_RUN=true; shift ;;
  --help)
    echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}") [--dry-run]"
    echo "  auto-close-merged: merged PRs with [T-NNNNNN] → ticket.sh update-status done"
    exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

if [[ -z "${BRAND:-}" ]]; then
  echo "ERROR: BRAND env var is required (mentolder|korczewski)" >&2
  exit 1
fi

if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "auto-close-merged [DRY-RESOLVE]: ctx=dry ns=dry brand=${BRAND}"
  exit 0
fi

factory_resolve

# Pull the most recent 30 merged PRs and walk each one. The list is small
# (last 30 merges) and the API cost is negligible (~30 calls / month).
PRS=$(gh pr list --state merged --limit 30 --json number,title 2>/dev/null || echo "[]")
if [[ -z "$PRS" || "$PRS" == "[]" || "$PRS" == "null" ]]; then
  echo "auto-close-merged: keine merged PRs in den letzten 30 für ${BRAND}" >&2
  exit 0
fi

# Extract the first [T-NNNNNN] tag from each title, look up the ticket's
# current status, and transition non-terminal ones.
echo "$PRS" | jq -r '.[] | "\(.number)\t\(.title)"' | while IFS=$'\t' read -r pr_num title; do
  ticket=$(printf '%s' "$title" | sed -nE 's/.*\[(T[0-9]{6})\].*/\1/p' | head -1)
  [[ -z "$ticket" ]] && continue

  # Look up the ticket's current status and type. SQL is read-only.
  row=$(cat <<SQL | factory_psql 2>/dev/null
SELECT status, type FROM tickets.tickets WHERE external_id = '$ticket' LIMIT 1;
SQL
)
  [[ -z "$row" ]] && { echo "auto-close-merged: $ticket (PR #$pr_num) existiert nicht in ${BRAND} — skip" >&2; continue; }
  status=$(printf '%s' "$row" | awk -F'|' '{print $1}' | tr -d ' ')
  ttype=$(printf '%s' "$row" | awk -F'|' '{print $2}' | tr -d ' ')

  case "$status" in
    done|archived) echo "auto-close-merged: $ticket (PR #$pr_num) bereits $status — skip" >&2; continue ;;
  esac

  resolution="shipped"
  [[ "$ttype" == "bug" ]] && resolution="fixed"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "auto-close-merged [DRY-RUN]: würde $ticket (PR #$pr_num, ${BRAND}) → done/$resolution"
    continue
  fi

  echo "auto-close-merged: $ticket (PR #$pr_num, ${BRAND}) $status → done/$resolution" >&2
  BRAND="$BRAND" bash "$(dirname "${BASH_SOURCE[0]}")/../ticket.sh" \
    update-status --id "$ticket" --status done --resolution "$resolution" || \
    echo "auto-close-merged: $ticket update-status fehlgeschlagen — continue" >&2
done

echo "auto-close-merged: fertig (BRAND=${BRAND}, DRY_RUN=${DRY_RUN})"
```

Mark executable: `chmod +x scripts/factory/auto-close-merged.sh`.

- [ ] **Step 3: Wire it into wakeup.sh**

In `scripts/factory/wakeup.sh`, after the `auto-triage` block (lines 109-112) and before the `claude -p` invocation, add:

```bash
  # T001415: Auto-Close von Tickets deren PR bereits gemergt ist
  # (worktree-lifecycle, dev-flow-execute, tickets/status-lifecycle).
  for _acm_brand in mentolder korczewski; do
    BRAND="$_acm_brand" bash "${REPO}/scripts/factory/auto-close-merged.sh" 2>&1 \
      | sed "s/^/[auto-close-merged:${_acm_brand}] /" >&2 || true
  done
```

This mirrors the existing per-brand `auto-enqueue.sh` and `auto-triage.sh` patterns — best-effort, stderr-prefixed, fail-open.

- [ ] **Step 4: Run the M3 tests to verify GREEN**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001415-mishap-bundle.bats --filter 'M3'
# Expected: 5 tests pass — script exists+executable, gh pr list present,
# [T-NNNNNN] extraction present, ticket.sh update-status present, wakeup.sh wired.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/auto-close-merged.sh scripts/factory/wakeup.sh
git commit -m "fix(factory-poll): auto-close tickets whose PR is merged (T001415 HEADLINE)"
```

---

### Task M4: Full verification & final gates

**Files:**
- No source edits — verification only.

- [ ] **Step 1: Full BATS contract green (all 9 tests)**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/t001415-mishap-bundle.bats
# Expected: PASS — all 9 tests green (was 7/9 RED at plan time).
```

- [ ] **Step 2: Shellcheck the three edited scripts**

```bash
shellcheck scripts/agent-lock.sh scripts/devflow-ci-watch.sh scripts/factory/auto-close-merged.sh
# Expected: no new warnings introduced by the edits.
```

- [ ] **Step 3: Smoke-test the new script in dry-run mode**

```bash
BRAND=mentolder bash scripts/factory/auto-close-merged.sh --dry-run
# Expected: no errors, prints the "fertig" line, lists any PRs it would close.
```

- [ ] **Step 4: Run the three mandatory CI gates**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Step 5: Commit any regenerated freshness artifacts**

```bash
git add -A
git commit -m "chore: regenerate freshness artifacts [T001415]" || echo "nothing to regenerate"
```

- [ ] **Step 6: Push the branch**

```bash
git push -u origin fix/t001415-status-lifecycle-bundle
```

## Self-Review

- **Spec coverage:** M1 = design Finding 1 (pid-dead reap), M2 = Finding 2 (CONFLICTING preflight + exit 4), M3 = Finding 3 (factory poll for auto-close, HEADLINE). All three findings mapped.
- **Test mapping:** M1 → tests 1-2, M2 → tests 3-4, M3 → tests 5-9; M4 runs the full file plus the mandatory gates.
- **Type/name consistency:** `_pid_alive()`, `pid-dead`, `MERGEABLE`, `auto-close-merged.sh`, `BRAND` used consistently across tasks.
- **Merge=Abschluss (T001092):** The M3 factory poll is the structural repair for the auto-close gap — once merged, every subsequent merged PR (factory-driven OR ticket-ops-driven) will close its ticket within one factory tick, regardless of which path produced the merge.
