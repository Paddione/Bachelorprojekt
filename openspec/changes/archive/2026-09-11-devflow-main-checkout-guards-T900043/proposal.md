# Proposal: devflow-main-checkout-guards-T900043

## Why

Restscope aus T900040 (Befund 2 und 4, Ticket T900043): Zwei dev-flow-Skripte verhalten
sich im Haupt-Checkout unsicher. Erstens meldet `scripts/check-pr-automerge.sh` ohne
expliziten Branch-/PR-Kontext `OK: Kein PR gefunden` (rc=0), weil `gh` die PR-Nummer aus
dem ausgecheckten Branch (dort `main`) ableitet — genau die Regression T006282, die das
Gate abfangen soll, bleibt unsichtbar (beobachtet an PR #5409). Zweitens mutiert die
Finalize-Kette (`devflow-post-merge-finalize.sh`, ggf. `worktree-create.sh`-Auto-Sync
derselben Session) den lokalen `main` per `pull --rebase` ohne Ankündigung und ohne
Opt-out, obwohl der Lauf ausdrücklich ohne Anfassen des unsauberen `main` verfügt war
(Reflog: `main@{1} 'pull --rebase (finish)'`). T900040 ist via PR #5412 done (Befund 1+3
geshippt: `--branch`-Pflicht in der SKILL.md-Doku Schritt 3.8, flock-Guard Windows);
Befund 5 wurde per Kommentar aus dem Scope genommen.

## What

### Requirement: check-pr-automerge.sh is fail-closed without explicit context

The system SHALL require an explicit `--pr` or `--branch` argument in
`scripts/check-pr-automerge.sh`: a bare invocation (no `--pr`, no `--branch`) SHALL exit
2 with an error message instead of probing `gh pr view` against the ambient branch and
reporting `OK: Kein PR gefunden` (rc=0). The call site in
`dev-flow-execute-phases.md` Schritt 1.4.7 (currently bare
`bash scripts/check-pr-automerge.sh`) SHALL pass `--branch "$BRANCH"` like SKILL.md
Schritt 3.8 already does since T900040.

- **GIVEN** the script is called without `--pr`/`--branch` **WHEN** any branch is checked
  out (including `main`) **THEN** it exits 2 and names the missing context.
- **GIVEN** `--branch <b>` is passed **WHEN** an open PR on `<b>` has auto-merge active
  **THEN** it exits 1 and names the PR number (existing behavior, unchanged).
- **GIVEN** the execute phases doc Schritt 1.4.7 **WHEN** read **THEN** the automerge
  check passes `--branch "$BRANCH"`.

### Requirement: finalize chain never rebases main without opt-out

The finalize chain (`scripts/devflow-post-merge-finalize.sh`, `scripts/branch-reaper.sh`,
and the session-level `worktree-create.sh` auto-sync) SHALL NOT run
`git pull --rebase origin main` (or any main-mutating step) in the main checkout without
an explicit opt-in/opt-out contract: a dirty worktree SHALL abort fail-closed, a clean
tree SHALL be announced beforehand, and an env/flag opt-out (e.g.
`DEVFLOW_NO_MAIN_SYNC=1` / `--no-main-sync`) SHALL skip the mutation entirely.

- **GIVEN** the main worktree is dirty **WHEN** a main-mutating step would run
  **THEN** the script aborts with exit != 0 and names the dirty state.
- **GIVEN** `DEVFLOW_NO_MAIN_SYNC=1` (or `--no-main-sync`) is set **WHEN** finalize runs
  **THEN** no `pull --rebase`/`checkout -B` touches `main`; the run continues idempotently.

### Non-goals

- Befund 5 (`agent-lock.sh list` Windows-Pfade) bleibt aus dem Scope (per Kommentar in
  T900040 verfügt).
- Kein Worktree, kein Claim, kein Branch in Phase A (Claim-Timing-Regel T004602).

_Ticket: T900043_
