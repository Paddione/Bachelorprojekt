#!/usr/bin/env bats
# tests/spec/openspec-workflow/archive-deliverable-guard.bats
# T002813 — cmd_archive's existing ticket-status guard checks a status LABEL, not
# whether the declared deliverable actually exists. This guard reads the ticket's
# touched_files (already populated at stage-plan time, T002446) and cross-checks
# it against the working tree. Graded: advisory when no data, warning on partial
# drift, hard refusal only when the deliverable is wholly absent.
# Pruefmodus: Output-Verifikation — real `scripts/openspec.sh archive` invocation
# against a sandbox, $status/$output only, no source grep.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OPENSPEC_SH="${REPO_ROOT}/scripts/openspec.sh"

  SANDBOX="${BATS_TEST_TMPDIR}/sandbox"
  rm -rf "$SANDBOX"
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
    [ -e "$f" ] || continue
    ln -sf "$f" "${SANDBOX}/scripts/$(basename "$f")" 2>/dev/null || true
  done
  rm -f "${SANDBOX}/scripts/ticket.sh"
  export TICKET_SH="${SANDBOX}/scripts/ticket.sh"
}

# $1 = status, $2 = touched_files JSON array literal (e.g. '["a.txt","b.txt"]' or 'null')
_stub_ticket() {
  cat > "${SANDBOX}/scripts/ticket.sh" <<STUB
#!/usr/bin/env bash
echo '{"external_id":"T990002","status":"$1","touched_files":$2}'
STUB
  chmod +x "${SANDBOX}/scripts/ticket.sh"
}

@test "T002813: archive proceeds when all declared touched_files are present (positive anchor)" {
  _stub_ticket done '["deliverable-a.txt","deliverable-b.txt"]'
  : > "${SANDBOX}/deliverable-a.txt"
  : > "${SANDBOX}/deliverable-b.txt"
  run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo --no-merge"
  [ "$status" -eq 0 ]
  [[ "$output" == *"archived: demo"* ]]
  [ ! -d "${OPENSPEC_ROOT}/changes/demo" ]
}

@test "T002813: archive is refused when none of the declared touched_files exist" {
  _stub_ticket done '["deliverable-a.txt","deliverable-b.txt"]'
  # Neither file is created — reproduces the #3919/#3914 shape: ticket says done,
  # nothing it claims to have delivered is actually in the tree.
  run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo --no-merge"
  [ "$status" -ne 0 ]
  [[ "$output" == *"deliverable-a.txt"* ]]
  [ -d "${OPENSPEC_ROOT}/changes/demo" ]
}

@test "T002813: archive proceeds with a warning when some declared touched_files are missing" {
  _stub_ticket done '["deliverable-a.txt","deliverable-b.txt"]'
  : > "${SANDBOX}/deliverable-a.txt"
  # deliverable-b.txt intentionally absent — plausible drift (rename/dropped task).
  run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo --no-merge"
  [ "$status" -eq 0 ]
  [[ "$output" == *"deliverable-b.txt"* ]]
  [ ! -d "${OPENSPEC_ROOT}/changes/demo" ]
}

@test "T002813: archive proceeds with an advisory when touched_files carries no data" {
  _stub_ticket done 'null'
  run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo --no-merge"
  [ "$status" -eq 0 ]
  [[ "$output" == *"nicht maschinell pruefbar"* ]]
  [ ! -d "${OPENSPEC_ROOT}/changes/demo" ]
}
