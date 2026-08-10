---
title: "archive-deliverable-guard — Implementation Plan"
ticket_id: T002813
domains: [test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# archive-deliverable-guard — Implementation Plan

_Ticket: T002813_

## File Structure

```
tests/spec/openspec-workflow/archive-deliverable-guard.bats   (new)
scripts/openspec.sh                                            (changed, 354 -> ~395 lines, not baselined, .sh budget 800 -> plenty of headroom)
CLAUDE.md                                                       (changed, redactional — extend M10 paragraph, no code budget)
openspec/specs/openspec-workflow.md                             (merged delta, no code budget)
```

## Root cause (verified against real merge history, not assumed)

Confirmed via `git log --oneline main | grep -n "8a58ab009\|2d584d2b8"`: commit `2d584d2b8`
(`chore(plans): archive fa-59-e2e-spec-positive-assertion → postgres + openspec/archive
[T002730] (#3919)`) sits at a LOWER line number in `git log --oneline main` (i.e. is OLDER /
merged EARLIER) than commit `8a58ab009` (`fix(e2e-testing): FA-59 purge endpoint spec positive
403 assertion [T002730] (#3914)`). The archive PR landed on `main` before the fix PR that
carried its actual deliverable — reproducible directly from repo history, not a hypothesis.

`scripts/openspec.sh cmd_archive` (line 224) already has one fail-closed guard: it refuses to
archive unless the linked ticket's status is `done` or `archived`. That guard alone did not
catch this, because a ticket's status label does not encode whether the deliverable files it
claims actually exist anywhere. The gap is specifically the absence of a **content** check
alongside the existing **status** check — not a broken status check (that part already works,
confirmed by the existing tests in `tests/spec/openspec-workflow/archive-terminal-ticket-status.bats`).

## Tasks

- [ ] **1. Failing test (RED).** Add
      `tests/spec/openspec-workflow/archive-deliverable-guard.bats`, mirroring the sandboxing
      pattern of `tests/spec/openspec-workflow/archive-terminal-ticket-status.bats` (own `git
      init` sandbox under `$BATS_TEST_TMPDIR`, symlinked `scripts/`, only `scripts/ticket.sh`
      replaced by a stub that echoes a JSON blob). Extend the stub to also carry
      `touched_files` so `cmd_archive`'s existing `bash "$TICKET_SH" get --id …` call can be
      re-parsed for it without a second network round-trip. Four cases, each proving one tier
      of the graded check — positive anchor first (T002356-M1).

  ```bash
  #!/usr/bin/env bats
  # tests/spec/openspec-workflow/archive-deliverable-guard.bats
  # T002813 — cmd_archive's existing ticket-status guard checks a status LABEL, not
  # whether the declared deliverable actually exists. This guard reads the ticket's
  # touched_files (already populated at stage-plan time, T002446) and cross-checks
  # it against the working tree being archived from. Graded: advisory when no data,
  # warning on partial drift, hard refusal only when the deliverable is wholly absent.
  # Pruefmodus: Output-Verifikation (T002448-M4) — real `scripts/openspec.sh archive`
  # invocation against a sandbox, $status/$output only, no source grep.

  setup() {
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
    OPENSPEC_SH="${REPO_ROOT}/scripts/openspec.sh"

    SANDBOX="${BATS_TEST_TMPDIR}/sandbox"
    mkdir -p "$SANDBOX"
    git init -q "$SANDBOX"

    export OPENSPEC_ROOT="${SANDBOX}/openspec"
    mkdir -p "${OPENSPEC_ROOT}/specs" "${OPENSPEC_ROOT}/changes/demo/specs"
    printf '# Spec: demo\n\n## Purpose\n\nDemo.\n\n## Requirements\n' > "${OPENSPEC_ROOT}/specs/demo.md"
    cat > "${OPENSPEC_ROOT}/changes/demo/specs/demo.md" <<'DELTA'
  ## ADDED Requirements

  ### Requirement: Demo requirement

  The system SHALL do a demo thing.

  #### Scenario: Demo scenario

  - **GIVEN** a demo
  - **WHEN** it runs
  - **THEN** it works
  DELTA
    echo "T990002" > "${OPENSPEC_ROOT}/changes/demo/.ticket"

    mkdir -p "${SANDBOX}/scripts"
    for f in "${REPO_ROOT}"/scripts/*; do
      ln -s "$f" "${SANDBOX}/scripts/$(basename "$f")"
    done
    rm -f "${SANDBOX}/scripts/ticket.sh"
  }

  # $1 = status, $2 = touched_files JSON array literal (e.g. '["a.txt","b.txt"]' or 'null')
  _stub_ticket() {
    cat > "${SANDBOX}/scripts/ticket.sh" <<STUB
  #!/usr/bin/env bash
  echo '{"status":"$1","touched_files":$2}'
  STUB
    chmod +x "${SANDBOX}/scripts/ticket.sh"
  }

  @test "T002813: archive proceeds when all declared touched_files are present (positive anchor)" {
    _stub_ticket done '["deliverable-a.txt","deliverable-b.txt"]'
    : > "${SANDBOX}/deliverable-a.txt"
    : > "${SANDBOX}/deliverable-b.txt"
    run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo"
    [ "$status" -eq 0 ]
    [[ "$output" == *"archived: demo"* ]]
    [ ! -d "${OPENSPEC_ROOT}/changes/demo" ]
  }

  @test "T002813: archive is refused when none of the declared touched_files exist" {
    _stub_ticket done '["deliverable-a.txt","deliverable-b.txt"]'
    # Neither file is created — reproduces the #3919/#3914 shape: ticket says done,
    # nothing it claims to have delivered is actually in the tree.
    run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo"
    [ "$status" -ne 0 ]
    [[ "$output" == *"deliverable-a.txt"* ]]
    [ -d "${OPENSPEC_ROOT}/changes/demo" ]
  }

  @test "T002813: archive proceeds with a warning when some declared touched_files are missing" {
    _stub_ticket done '["deliverable-a.txt","deliverable-b.txt"]'
    : > "${SANDBOX}/deliverable-a.txt"
    # deliverable-b.txt intentionally absent — plausible drift (rename/dropped task).
    run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo"
    [ "$status" -eq 0 ]
    [[ "$output" == *"deliverable-b.txt"* ]]
    [ ! -d "${OPENSPEC_ROOT}/changes/demo" ]
  }

  @test "T002813: archive proceeds with an advisory when touched_files carries no data" {
    _stub_ticket done 'null'
    run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo"
    [ "$status" -eq 0 ]
    [[ "$output" == *"could not be machine-checked"* || "$output" == *"nicht maschinell pruefbar"* ]]
    [ ! -d "${OPENSPEC_ROOT}/changes/demo" ]
  }
  ```

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-deliverable-guard.bats
  # expected: FAIL (red — cmd_archive does not read or check touched_files yet; the
  # "none present" case archives successfully instead of refusing, and the other
  # three cases produce no warning/advisory text to match against)
  ```

- [ ] **2. Fix-step (GREEN) — read touched_files alongside the existing status lookup.** In
      `scripts/openspec.sh` `cmd_archive`, inside the existing
      `if [[ "${TICKET_OFFLINE:-0}" != "1" && -f "$dir/.ticket" ]]; then` block: capture the
      full `bash "$TICKET_SH" get --id …` JSON output into a variable once (instead of piping
      straight into the status `grep`), extract `status` from it as before, then extract
      `touched_files` with a second tolerant regex against the same variable:
      `grep -o '"touched_files" *: *\[[^]]*\]'`. No second call to `ticket.sh`.

- [ ] **3. Fix-step (GREEN) — implement the graded check.** Add a helper
      `_check_deliverable_presence` in `scripts/openspec.sh`, called right after the existing
      status guard passes, with the ticket JSON and `$slug` as arguments:
      - If the `touched_files` regex found nothing (empty/`null`), print
        `WARN: archive $slug: ticket hat kein touched_files — Deliverable-Praesenz nicht
        maschinell pruefbar (siehe CLAUDE.md M10).` to stderr and `return 0`.
      - Otherwise extract each quoted path with `grep -o '"[^"]*"' | tr -d '"'`, drop the
        literal `touched_files` key token itself, and for each remaining path check
        `[[ -e "$REPO/$path" ]]`, counting `total` and `present`.
      - `total -gt 0 && present -eq 0` → `die "archive refused: keines der deklarierten
        touched_files des Tickets liegt im Arbeitsbaum — Deliverable fehlt (T002813).
        touched_files: …"` (must name the missing paths so the BATS assertion on
        `deliverable-a.txt` matches).
      - `total -gt 0 && present -lt total` → `echo "WARN: archive $slug: nur
        ${present}/${total} deklarierte touched_files liegen im Arbeitsbaum vor — pruefen, ob
        Umbenennungen/Loeschungen beabsichtigt sind. Fehlend: …" >&2` (must name the missing
        paths), then `return 0`.
      - `total -gt 0 && present -eq total` → no output, `return 0`.

- [ ] **4. Re-run the failing test — must now pass (GREEN).**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-deliverable-guard.bats
  ```

- [ ] **5. Regression check — existing archive-guard tests still pass.**

  ```bash
  tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow
  ```

- [ ] **6. CLAUDE.md M10 update.** Extend the existing M10 paragraph ("Deliverable-Check vor
      manuellem `done`/`shipped`") with one sentence noting that the OpenSpec archive path
      (`scripts/openspec.sh archive`) now runs an automated version of this check for the
      total-absence case, while the manual-closure paragraph itself remains the redactional
      check for partial mismatches and closures that never go through `cmd_archive`.

- [ ] **7. Final Verification.**

  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
