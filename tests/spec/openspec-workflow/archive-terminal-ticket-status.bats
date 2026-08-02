#!/usr/bin/env bats
# tests/spec/openspec-workflow/archive-terminal-ticket-status.bats
# SSOT: openspec/specs/openspec-workflow.md
#
# Pruefmodus: Output-Verifikation (T002448-M4) — jeder Test ruft
# `scripts/openspec.sh archive` gegen eine Sandbox auf und prueft $status/$output.
# Kein Source-Grep.
#
# Isolations-Trick: scripts/openspec.sh verdrahtet TICKET_SH fest auf
# "$REPO/scripts/ticket.sh" (kein ${TICKET_SH:-...}-Override), und REPO wird per
# `git rev-parse --show-toplevel` aus dem cwd bestimmt. Um den Ticket-Lookup zu
# stubben, laeuft der Test daher in einem eigenen `git init`-Sandbox-Repo mit
# eigenem scripts/-Verzeichnis (Symlinks auf die echten Scripts, damit
# _merge_delta's harter node-Aufruf auf openspec-merge.mjs weiterhin funktioniert)
# — nur ticket.sh wird durch eine echte Stub-Datei ersetzt. Dorthin zeigt REPO
# waehrend des Testlaufs, das echte Repo bleibt unberuehrt. Der Aufruf von
# scripts/openspec-status-map.sh in cmd_archive ist best-effort (`|| true`); da
# er ebenfalls per Symlink verfuegbar ist, scannt er in der Sandbox unter
# OPENSPEC_ROOT und schreibt seine Ausgabe nach $SANDBOX/website/... — niemals
# in die reale website/src/data/openspec-status.json.
#
# Kontext T002569: cmd_archive akzeptierte bislang ausschliesslich Ticket-Status
# 'done'. 'archived' ist ein SPAETERER Lifecycle-Zustand als 'done' (siehe
# Kommentar ueber der Pruefung in scripts/openspec.sh) und wurde faelschlich
# abgewiesen — das blockierte Charge 1 des Vollzugsrueckstaus (10 Changes mit
# Ticket-Status 'archived').

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
  echo "T990001" > "${OPENSPEC_ROOT}/changes/demo/.ticket"

  mkdir -p "${SANDBOX}/scripts"
  for f in "${REPO_ROOT}"/scripts/*; do
    ln -s "$f" "${SANDBOX}/scripts/$(basename "$f")"
  done
  rm -f "${SANDBOX}/scripts/ticket.sh"
}

_stub_ticket_status() {
  local st="$1"
  cat > "${SANDBOX}/scripts/ticket.sh" <<STUB
#!/usr/bin/env bash
echo '{"status":"${st}"}'
STUB
  chmod +x "${SANDBOX}/scripts/ticket.sh"
}

@test "T002569: archive akzeptiert Ticket-Status 'archived'" {
  _stub_ticket_status archived
  run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo"
  [ "$status" -eq 0 ]
  [[ "$output" == *"archived: demo"* ]]
  [ ! -d "${OPENSPEC_ROOT}/changes/demo" ]
}

@test "T002569: archive weist Ticket-Status 'in_progress' weiterhin ab (Positiv-Anker)" {
  # Ohne diesen Anker waere der Test oben auch dann gruen, wenn der Guard
  # komplett entfernt wuerde (T002356-M1).
  _stub_ticket_status in_progress
  run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo"
  [ "$status" -ne 0 ]
  [[ "$output" == *"expected 'done' or 'archived'"* ]]
  [ -d "${OPENSPEC_ROOT}/changes/demo" ]
}

@test "T002569: archive akzeptiert weiterhin Ticket-Status 'done' (Regression)" {
  _stub_ticket_status done
  run bash -c "cd '$SANDBOX' && bash '$OPENSPEC_SH' archive demo"
  [ "$status" -eq 0 ]
  [[ "$output" == *"archived: demo"* ]]
}
