---
title: "mishap-bundle-2026-06-30 — Implementation Plan"
ticket_id: T001331
domains: [infra, devflow, tickets]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-bundle-2026-06-30 — Implementation Plan

_Ticket: T001331_

## File Structure

| File | Status |
|------|--------|
| `scripts/worktree-create.sh` | modified |
| `scripts/ticket-status-validate.sh` | created |
| `.claude/skills/dev-flow-execute/SKILL.md` | modified |
| `tests/spec/mishap-bundle-2026-06-30.bats` | created |
| `openspec/changes/mishap-bundle-2026-06-30/specs/mishap-bundle.md` | created |

## Purpose (DE)

Dieser Plan adressiert drei Prozess-Mishaps: (1) git-crypt hinterlässt stale smudge-Marker in Worktrees, die 20+ spurious Diffs in `environments/.secrets/*` verursachen. (2) Das Archive-Subagent-Skript in Schritt 7 von dev-flow-execute erstellt einen Branch mit Commits, aber erstellt keinen PR (fehlende Schritt-7-Compliance). (3) Ticket T000099 hatte einen Status-Drift: `in_progress` mit gesetztem `done_at`, verursacht durch eine versehentliche Status-Revertierung. Es fehlt eine Validierungs-Routine, die inkonsistente Status/Timestamp-Kombinationen erkennt.

## Task 1: git-crypt smudge cleanup pre-flight in worktree-create.sh

### Requirement: Stale smudge filters erkennen und korrigieren

Wenn `worktree-create.sh` einen existierenden Worktree aufsetzt (existing branch mode), der noch
stale `smudge=cat`-Filter aus einer vorherigen Locked-Session hat, während das Haupt-Repo jetzt
unlocked ist, müssen die git-crypt-Filter aktualisiert werden.

**Scenarios:**

GIVEN a worktree created while the repo was git-crypt-locked (smudge=cat)
WHEN the main repo is later unlocked and worktree-create.sh runs for the existing branch
THEN the script detects the staleness, copies the key, and resets smudge to the real filter.

GIVEN a worktree with stale smudge=cat filter
WHEN `git status` is run inside the worktree
THEN `environments/.secrets/*` files show their decrypted content, not the encrypted blob.

**Implementation:**
- In the `BRANCH_EXISTS=1` path, after checkout, check if `environments/.secrets/*` files start
  with the git-crypt magic header (`\0GITCRYPT\0` hex: `474954435259505400`). If so, and if the
  main checkout has a key at `$COMMON_DIR/git-crypt/keys/default`, re-initialize by copying the
  key and re-running checkout.
- Use `scripts/git-crypt-guard.sh is-encrypted <file>` for the detection — it already implements
  the magic-header check.

**Files:**
- `scripts/worktree-create.sh` (modified)

## Task 2: PR creation guard in dev-flow-execute Schritt 7

### Requirement: Nach dem archive commit zwingend einen PR erstellen

Schritt 7 des dev-flow-execute-Skills erstellt einen Archive-Branch, committed die Archivierung
und pusht. Der `gh pr create`-Befehl wird danach aufgerufen, aber das Subagent-Protokoll kann
vorher aussteigen (push_verified ist erfüllt, aber pr_created fehlt).

**Scenarios:**

GIVEN the archive subagent has committed and pushed the archive branch
WHEN it returns without creating a PR
THEN the Steps continue without the PR being created, leaving an orphan branch.

GIVEN the archive subagent completes Schritt 7
WHEN the `gh pr create` command is executed
THEN it must not fail silently — a post-create `gh pr view` check verifies the PR exists.

**Implementation:**
- Add a post-`gh pr create` verification step that uses `gh pr view --json number` to confirm
  the PR was created successfully. If it fails, emit a FATAL error.
- Add `pr_created:<pr-number>` to the subagent return contract alongside `push_verified:<sha>`.
- The orchestrator must not proceed without both fields.

**Files:**
- `.claude/skills/dev-flow-execute/SKILL.md` (modified)

## Task 3: Ticket status/timestamp validation script

### Requirement: Inkonsistente Status-Timestamp-Kombinationen erkennen

Führe ein Validierungs-Skript ein, das Tickets mit inkonsistentem Status und done_at-Timestamp
erkennt — z.B. `in_progress` mit gesetztem `done_at` oder `done` ohne `done_at`.

**Scenarios:**

GIVEN a ticket DBTicket with status `in_progress` and `done_at IS NOT NULL`
WHEN the validation script runs
THEN it reports the inconsistency and the ticket ID.

GIVEN a ticket DBTicket with status `done` and `done_at IS NULL`
WHEN the validation script runs
THEN it reports the inconsistency and the ticket ID.

**Implementation:**
- Create `scripts/ticket-status-validate.sh` that queries the database via `psql` with a
  hardcoded connection string from the environment, or via `kubectl exec` as fallback.
- The SQL query checks: `SELECT id, external_id, status, done_at FROM tickets.tickets WHERE (status = 'in_progress' AND done_at IS NOT NULL) OR (status = 'done' AND done_at IS NULL) OR (status = 'awaiting_deploy' AND done_at IS NOT NULL)`.
- Wrap as a BATS-testable script (exit 0 = all consistent, exit 1 = inconsistencies found, output JSON).
- Integrate into the pre-commit hook or a `task ticket:validate` Taskfile command.

**Files:**
- `scripts/ticket-status-validate.sh` (created)

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the BATS test suite to confirm it fails on the current codebase.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-2026-06-30.bats
# expected: FAIL (red — the fixes are not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Apply all three fixes. The BATS test from the previous step must now pass.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-2026-06-30.bats
# expected: PASS
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
