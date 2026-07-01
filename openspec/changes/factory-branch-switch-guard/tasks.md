---
title: "factory-branch-switch-guard — Implementation Plan"
ticket_id: T001383
domains: [testing, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-branch-switch-guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

_Ticket: T001383_

**Goal:** Structurally prevent branch-switches in the shared main checkout — statically for
future factory code (CI-gated guard) and at runtime for foreign interactive sessions
(best-effort post-checkout revert to the lock's recorded branch).

**Architecture:** Two complementary, independent measures. (1) A reusable guard script
`scripts/factory/check-no-main-checkout.sh` that greps `scripts/factory/**` for raw
`git checkout`/`git switch` (worktree-scoped `-C "$WORK_WT"` calls exempt), driven by a
BATS test in CI — real prevention before merge. (2) `scripts/agent-lock.sh` upgrades:
`cmd_guard_postcheckout` gains a rebase/merge/cherry-pick exemption plus a best-effort revert
onto the `main-checkout` lock's recorded `branch` (never a raw SHA), and `cmd_guard_precommit`
self-claims that lock on every commit so the `branch` field stays populated.

**Tech Stack:** Bash (`set -uo pipefail`), BATS (`tests/unit/lib/bats-core`),
git plumbing (`git rev-parse --git-path`, `git show-ref`).

## Global Constraints

- Fail-open runtime guards: `guard-postcheckout` and the self-claim MUST NEVER exit non-zero
  and MUST NEVER block a commit or checkout (`|| true` on best-effort work).
- Revert target is ALWAYS a branch name from the lock's `branch` field, verified with
  `git show-ref --verify --quiet refs/heads/<branch>` — NEVER a raw commit SHA.
- Rebase/merge/cherry-pick in progress is an absolute exemption (no revert, no warning) —
  this protects legitimate `git pull --rebase origin main` syncs of other sessions.
- No signature change to `.githooks/pre-commit` / `.githooks/post-checkout`.
- BATS runtime tests MUST run in a throwaway git repo (`mktemp -d`) with an isolated
  `AGENT_LOCK_DIR` — NEVER against the real worktree; identity pinned via `AGENT_LOCK_SID`
  with `CLAUDE_SESSION_ID` unset and liveness faked via `AGENT_LOCK_FAKE_ALIVE`.

## File Structure

| File | Responsibility |
|------|----------------|
| `scripts/factory/check-no-main-checkout.sh` | NEW — reusable static guard (grep `scripts/factory/**` for raw checkout/switch); exit 1 on violation. Callable by BATS + CI. |
| `scripts/agent-lock.sh` | MODIFY — add `_git_op_in_progress`, `_self_claim_main_checkout`; extend `cmd_guard_postcheckout` (exemption + revert) and `cmd_guard_precommit` (self-claim). |
| `tests/spec/factory-branch-switch-guard.bats` | NEW — static-guard tests (A/A2/A3) + runtime regression tests (B rebase-exempt, C revert, D no-branch warn-only, E precommit self-claim). |
| `docs/superpowers/specs/2026-06-08-agent-session-coordination-design.md` | MODIFY — 2-3 sentence note in the `G-B` section pointing at the new best-effort revert. |

### S1 line-budget pre-flight (per plan-quality-gates S1)

`scripts/agent-lock.sh` is `.sh` (static limit 500) and **not baselined** → effective
threshold 500. Current `wc -l` = 249. Planned additions ≈ +28 lines → ≈ 277, well under.

| Datei | Ist | Budget |
|---|---|---|
| `scripts/agent-lock.sh` | 249 | 251 |

New files (`check-no-main-checkout.sh` ≈ 22 lines `.sh`/limit 500; `.bats` is ungated) are
cut with ample reserve. No baseline entries are added. S2 (no import cycles — pure bash, N/A),
S3 (no hostnames — N/A), S4 (orphans): the new guard lives under `scripts/factory/` which is
**not** an S4 candidate glob (`scripts/*.sh` is top-level only), so no orphan wiring is
required; it is nonetheless referenced by the BATS test (a `reference_source`) and callable
from CI.

---

## Task 1: Reusable static factory guard script

**Files:**
- Create: `scripts/factory/check-no-main-checkout.sh`
- Test: `tests/spec/factory-branch-switch-guard.bats` (tests A / A2 / A3)

**Interfaces:**
- Produces: an executable `scripts/factory/check-no-main-checkout.sh [root]` that scans
  `root` (default `scripts/factory`), prints offending `path:line:content` lines to stderr,
  and exits `1` iff a raw `git checkout`/`git switch` exists that is not `-C`-scoped and not a
  comment. Exit `0` on a clean tree. Consumed by Task 2's BATS tests.

- [ ] **Step 1: Write the failing tests (static guard).**

Create `tests/spec/factory-branch-switch-guard.bats` with the header and the three static
tests below. Test `A` invokes a script that does not exist yet — `expected: FAIL`.

```bash
#!/usr/bin/env bats
# tests/spec/factory-branch-switch-guard.bats
# SSOT: openspec/specs/software-factory.md (+ agent-lock session coordination)
# T001383 — Factory-Prozess Branch-Wechsel im geteilten main-Checkout verhindern.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  GUARD="$REPO/scripts/factory/check-no-main-checkout.sh"
  TMP="$(mktemp -d)"
}
teardown() { rm -rf "$TMP"; }

@test "A: factory static guard passes on the clean scripts/factory tree" {
  run bash "$GUARD" "$REPO/scripts/factory"
  [ "$status" -eq 0 ]
}

@test "A2: factory static guard flags an injected raw checkout" {
  mkdir -p "$TMP/factory"
  printf '#!/usr/bin/env bash\ngit checkout main\n' > "$TMP/factory/bad.sh"
  run bash "$GUARD" "$TMP/factory"
  [ "$status" -ne 0 ]
  [[ "$output" == *"bad.sh"* ]]
}

@test "A3: factory static guard exempts a worktree-scoped checkout" {
  mkdir -p "$TMP/factory"
  printf '#!/usr/bin/env bash\ngit -C "$WORK_WT" checkout main\n' > "$TMP/factory/ok.sh"
  run bash "$GUARD" "$TMP/factory"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run the static tests to verify they fail.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/factory-branch-switch-guard.bats -f "^A"`
Expected: FAIL — the guard script does not exist (`bash: ... No such file`), so all three
error out. This is the RED state for the static half. `expected: FAIL`.

- [ ] **Step 3: Create the guard script (minimal implementation).**

```bash
#!/usr/bin/env bash
# scripts/factory/check-no-main-checkout.sh — static session-coordination guard. [T001383]
# Fails (exit 1) if any script under scripts/factory/ issues a raw `git checkout`/
# `git switch` against the shared main checkout. Worktree-scoped calls
# (`git -C "$WORK_WT" ...`, or commands run after `cd` into a dedicated worktree)
# are permitted. Reused by the factory-branch-switch-guard BATS test and CI.
set -uo pipefail
root="${1:-scripts/factory}"
# grep output is path:lineno:content. Keep only real raw checkout/switch:
#   - drop comment lines (content starts with #)
#   - drop worktree-scoped `git -C ...` forms
#   - drop this guard's own file (its comments/regex mention the tokens)
hits="$(grep -rnE 'git[[:space:]]+(checkout|switch)([[:space:]]|$)' \
          "$root" --include='*.sh' --include='*.js' --include='*.mjs' --include='*.cjs' \
          2>/dev/null \
        | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' \
        | grep -vE 'git[[:space:]]+-C[[:space:]]' \
        | grep -v 'check-no-main-checkout.sh' \
        | grep -v 'worktree-create.sh' || true)"
if [ -n "$hits" ]; then
  echo "FACTORY-GUARD: raw git checkout/switch in the shared main checkout:" >&2
  printf '%s\n' "$hits" >&2
  exit 1
fi
exit 0
```

Then: `chmod +x scripts/factory/check-no-main-checkout.sh`.

- [ ] **Step 4: Run the static tests to verify they pass.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/factory-branch-switch-guard.bats -f "^A"`
Expected: PASS (3 ok) — clean tree passes, injected violation flagged, worktree-scoped exempt.

- [ ] **Step 5: Commit.**

```bash
git add scripts/factory/check-no-main-checkout.sh tests/spec/factory-branch-switch-guard.bats
git commit -m "test(session-coordination): static factory main-checkout guard [T001383]"
```

---

## Task 2: agent-lock guard upgrades (rebase exemption + revert + self-claim)

**Files:**
- Modify: `scripts/agent-lock.sh` (add helpers; rewrite `cmd_guard_postcheckout`,
  `cmd_guard_precommit` at lines 212–232)
- Test: `tests/spec/factory-branch-switch-guard.bats` (tests B / C / D / E)

**Interfaces:**
- Consumes: existing `_lock_file`, `_lock_field`, `_reapable`, `_my_sid`, `cmd_claim`.
- Produces: `_git_op_in_progress()` (exit 0 iff rebase/merge/cherry-pick mid-flight);
  `_self_claim_main_checkout()` (best-effort `cmd_claim main-checkout "" --branch <HEAD>`);
  a `guard-postcheckout` that reverts to the lock's `branch` and a `guard-precommit` that
  self-claims. Env gate `AGENT_LOCK_POSTCHECKOUT_REVERT` (default `1`; `0` = warn only).

- [ ] **Step 1: Write the failing runtime tests (B/C/D/E).**

Append to `tests/spec/factory-branch-switch-guard.bats`:

```bash
# Helper: throwaway repo on branch feature/x, isolated lock dir, pinned identity.
_mkrepo() {
  unset CLAUDE_SESSION_ID
  export AGENT_LOCK_SID="me-111"
  export AGENT_LOCK_DIR="$TMP/locks"; mkdir -p "$AGENT_LOCK_DIR"
  git init -q "$TMP/repo"
  git -C "$TMP/repo" config user.email t@t
  git -C "$TMP/repo" config user.name t
  git -C "$TMP/repo" commit -q --allow-empty -m init
  git -C "$TMP/repo" branch feature/x
  git -C "$TMP/repo" checkout -q feature/x
}

# Helper: write a live FOREIGN main-checkout lock (owner_sid 999 faked-alive).
_foreign_lock() {  # <branch-value>
  export AGENT_LOCK_FAKE_ALIVE="999"
  cat > "$AGENT_LOCK_DIR/main-checkout.json" <<JSON
{
  "scope": "main-checkout",
  "id": "",
  "owner_sid": "999",
  "worktree": "-",
  "branch": "$1",
  "heartbeat_at": "$(date +%s)"
}
JSON
}

@test "B: guard-postcheckout is exempt during a rebase (no revert, no warning)" {
  _mkrepo
  _foreign_lock "feature/x"
  mkdir -p "$TMP/repo/.git/rebase-merge"
  git -C "$TMP/repo" checkout -q main
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-postcheckout"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ "$(git -C "$TMP/repo" rev-parse --abbrev-ref HEAD)" = "main" ]
}

@test "C: guard-postcheckout reverts to the lock's branch on a foreign switch" {
  _mkrepo
  _foreign_lock "feature/x"
  git -C "$TMP/repo" checkout -q main
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-postcheckout"
  [ "$status" -eq 0 ]
  [ "$(git -C "$TMP/repo" rev-parse --abbrev-ref HEAD)" = "feature/x" ]
}

@test "D: guard-postcheckout with empty branch warns only, no checkout" {
  _mkrepo
  _foreign_lock ""
  git -C "$TMP/repo" checkout -q main
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-postcheckout"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Warnung"* ]]
  [ "$(git -C "$TMP/repo" rev-parse --abbrev-ref HEAD)" = "main" ]
}

@test "E: guard-precommit self-claims main-checkout with the current branch" {
  _mkrepo
  git -C "$TMP/repo" checkout -q -b chore/y
  run bash -c "cd '$TMP/repo' && bash '$LOCK' guard-precommit"
  [ "$status" -eq 0 ]
  br="$(sed -n 's/.*\"branch\": *\"\([^\"]*\)\".*/\1/p' "$AGENT_LOCK_DIR/main-checkout.json")"
  owner="$(sed -n 's/.*\"owner_sid\": *\"\([^\"]*\)\".*/\1/p' "$AGENT_LOCK_DIR/main-checkout.json")"
  [ "$br" = "chore/y" ]
  [ "$owner" = "me-111" ]
}
```

- [ ] **Step 2: Run B/C/D/E to verify the new-behavior ones fail.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/factory-branch-switch-guard.bats -f "^[BCDE]"`
Expected: FAIL — `C` (no revert today → HEAD stays main), `E` (no self-claim → no lock file),
and `B` (today it prints a warning → non-empty `$output`) all fail. `D` already passes (warn
only). This is the RED state for the runtime half. `expected: FAIL`.

- [ ] **Step 3: Add the two helper functions.**

Insert after `_holder_msg()` (around line 124) in `scripts/agent-lock.sh`:

```bash
# 0 = a rebase/merge/cherry-pick is mid-flight. git fires post-checkout during the
# internal ref moves of `git pull --rebase origin main`; reverting then would corrupt
# another session's legitimate operation. This exemption is the key safety fix. [T001383]
_git_op_in_progress() {
  local name p
  for name in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
    p="$(git rev-parse --git-path "$name" 2>/dev/null)" || continue
    [ -e "$p" ] && return 0
  done
  return 1
}

# Best-effort claim/refresh of the main-checkout lock for THIS session, recording the
# current branch so guard-postcheckout has a reliable revert target. Never blocks. [T001383]
_self_claim_main_checkout() {
  local br; br="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  [ -n "$br" ] && [ "$br" != "HEAD" ] || return 0
  cmd_claim main-checkout "" --branch "$br" --label "auto: pre-commit self-claim" >/dev/null 2>&1
}
```

- [ ] **Step 4: Rewrite `cmd_guard_postcheckout`.**

Replace the existing `cmd_guard_postcheckout` (lines 225–232) with:

```bash
cmd_guard_postcheckout() {
  local f; f="$(_lock_file main-checkout)"
  [ -f "$f" ] || return 0
  _reapable "$f" && return 0
  [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] && return 0
  # Exemption first: never warn or revert mid rebase/merge/cherry-pick.
  _git_op_in_progress && return 0
  echo "AGENT-LOCK (Warnung): main-Checkout $(_holder_msg "$f") — paralleler Branch-Switch riskant." >&2
  # Opt-out escape hatch.
  [ "${AGENT_LOCK_POSTCHECKOUT_REVERT:-1}" = "0" ] && return 0
  # Best-effort revert onto the lock's recorded branch — never a raw SHA.
  local br; br="$(_lock_field "$f" branch)"
  [ -n "$br" ] || return 0
  git show-ref --verify --quiet "refs/heads/$br" || return 0
  [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "$br" ] && return 0
  if git checkout "$br" >/dev/null 2>&1; then
    echo "AGENT-LOCK: main-Checkout auf '$br' zurückgesetzt (Lock-Halter aktiv)." >&2
  else
    echo "AGENT-LOCK: Revert auf '$br' fehlgeschlagen — bitte manuell prüfen." >&2
  fi
  return 0
}
```

- [ ] **Step 5: Extend `cmd_guard_precommit` with the self-claim.**

Replace the existing `cmd_guard_precommit` (lines 212–223) with:

```bash
cmd_guard_precommit() {
  [ -n "${AGENT_LOCK_FORCE:-}" ] && return 0
  local f; f="$(_lock_file main-checkout)"
  _with_lock
  if [ -f "$f" ] && ! _reapable "$f" \
     && [ "$(_lock_field "$f" owner_sid)" != "$(_my_sid)" ]; then
    echo "AGENT-LOCK: main-Checkout $(_holder_msg "$f")" >&2
    echo "  Eine andere Session arbeitet im main-Checkout. Nutze einen Worktree" >&2
    echo "  (scripts/worktree-create.sh) oder erzwinge: AGENT_LOCK_FORCE=1 git commit ..." >&2
    return 1
  fi
  # No live foreign lock blocks the commit → self-claim so the `branch` field stays
  # populated for guard-postcheckout. Best-effort; must never block the commit. [T001383]
  _self_claim_main_checkout || true
  return 0
}
```

- [ ] **Step 6: Run B/C/D/E to verify they pass.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/factory-branch-switch-guard.bats -f "^[BCDE]"`
Expected: PASS (4 ok).

- [ ] **Step 7: Run the shellcheck lint and the full new file.**

Run: `shellcheck scripts/agent-lock.sh scripts/factory/check-no-main-checkout.sh`
Then: `tests/unit/lib/bats-core/bin/bats tests/spec/factory-branch-switch-guard.bats`
Expected: no new shellcheck errors; all BATS tests (A–E) pass.

- [ ] **Step 8: Regression — existing agent-lock suite still green.**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats`
Expected: PASS — the identity/claim behaviour used by the self-claim is unchanged.

- [ ] **Step 9: Commit.**

```bash
git add scripts/agent-lock.sh tests/spec/factory-branch-switch-guard.bats
git commit -m "fix(session-coordination): post-checkout best-effort revert + precommit self-claim [T001383]"
```

---

## Task 3: Cross-reference the new behaviour in the older design doc

**Files:**
- Modify: `docs/superpowers/specs/2026-06-08-agent-session-coordination-design.md`

**Interfaces:** documentation only — no code consumers.

- [ ] **Step 1: Add the note to the `G-B` section.**

In the `### G-B — main-Checkout-Race` section, directly after the paragraph that begins
"Zusätzlich neuer **`post-checkout`**-Hook" (around line 183), insert:

```markdown
> **Update (T001383, 2026-07-01):** `post-checkout` warnt nicht mehr nur, sondern **reverted
> best-effort** auf den im `main-checkout`-Lock hinterlegten `branch` (nie auf eine SHA),
> außer während eines laufenden Rebase/Merge/Cherry-Pick. `guard-precommit` self-claimt den
> Lock bei jedem Commit, damit das `branch`-Feld gefüllt bleibt. Volle Analyse:
> `docs/superpowers/specs/2026-07-01-factory-branch-switch-guard-design.md`.
```

- [ ] **Step 2: Commit.**

```bash
git add docs/superpowers/specs/2026-06-08-agent-session-coordination-design.md
git commit -m "docs(session-coordination): note post-checkout revert upgrade [T001383]"
```

---

## Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Plan-lint self-gate.**

Run: `bash scripts/plan-lint.sh openspec/changes/factory-branch-switch-guard/tasks.md`
Expected: `PLAN-LINT: PASS (0 hard, …)`.

- [ ] **Step 2: OpenSpec validation stays green.**

Run: `bash scripts/openspec.sh validate factory-branch-switch-guard`
Expected: validation passes (do NOT commit archive — the orchestrator handles that).

- [ ] **Step 3: Mandatory CI gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Expected: `task test:changed` runs the new BATS + quality ratchet and passes;
`task freshness:regenerate` regenerates `website/src/data/test-inventory.json` (the new
`.bats` file is inventoried); `task freshness:check` passes (S1–S4 ratchet + baseline
key-count assertion — no baseline entries were added).

- [ ] **Step 4: Stage regenerated artifacts.**

```bash
git add website/src/data/test-inventory.json
git status --short
```

Expected: only the test-inventory (and any other freshness artifacts) are staged; commit them
if changed with `git commit -m "chore: regenerate freshness artifacts [T001383]"`.
