#!/usr/bin/env bats
# tests/spec/software-factory/retry-limit.bats
# SSOT: openspec/specs/software-factory.md (Batch T003810, P1 — Retry-Limit)
#
# Drei aufeinanderfolgende No-Commit-Laeufe (exit 6) muessen das Ticket nach
# `planning` zuruecksetzen und den Slot freigeben, statt es im naechsten Tick
# erneut zu dispatchen (T003625: 3x exit 6 ohne Implementierungs-Commit). Der
# Zaehler ist tickets.retry_count: Schreiber scripts/factory/opencode-exec.sh
# (incr bei exit 6, reset bei Commit), Leser factory-floor.ts ("retry erschöpft").
#
# Pruefmodus: Output-Verifikation (T002448-M4) — die Tests FUEHREN
# scripts/factory/opencode-exec.sh mit gestubbtem opencode-Binary AUS und
# pruefen DB-Zustand (retry_count, status, pipeline_slot) und Exit-Codes. Kein
# Grep auf die Quelldatei; Zusicherungen haengen an Semantik, nicht Wortlaut
# (T002716). Jede Negativ-Aussage traegt einen Positiv-Anker (T002356-M1).
#
# DB-gestuetzt: ohne erreichbaren shared-db-Pod wird uebersprungen
# (_skip_if_no_db). Die Stubs erzeugen keinen echten Orchestrator-Lauf.

load '_sf_common'

# Opt-in in echten lokalen Dev-Cluster: _ticket-core.sh repointet unter BATS
# sonst auf den Sentinel-Kontext "bats-no-cluster-t002224" (T002224). Diese
# Tests BRAUCHEN die DB — sie saen Fixtures und purgen sie in teardown_file.
setup_file() {
  export TICKET_TEST_BRAND="mentolder"
  export TICKET_TEST_DB_OK=1
}

setup() {
  _sf_setup
  source "${REPO_ROOT}/tests/lib/factory-test-fixtures.sh"

  # Wegwerf-Worktree als LAUNCH_DIR: eigenes git-Repo, ein Basis-Commit.
  LAUNCH="$BATS_TEST_TMPDIR/launch-retry"
  mkdir -p "$LAUNCH"
  git -C "$LAUNCH" init -q -b main
  git -C "$LAUNCH" config user.email t@example.invalid
  git -C "$LAUNCH" config user.name Test
  echo base > "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "base"

  # Stub-Verzeichnis vor den PATH — der echte Orchestrator darf nie laufen.
  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  export PATH="$STUB_BIN:$PATH"
  export TICKET_CTX="${FACTORY_CTX:-k3d-mentolder-dev}"

  EXEC="$REPO_ROOT/scripts/factory/opencode-exec.sh"
}

teardown_file() {
  purge_factory_test_data mentolder 2>/dev/null || true
}

# Saet ein Test-Feature und liefert seine external_id.
_seed() {
  seed_test_feature mentolder
}

# Stub, der laeuft und mit 0 endet, aber KEINEN Commit erzeugt (→ exit 6).
_stub_noop() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"step_start"}'
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
}

# Stub, der einen echten Commit im cwd erzeugt und mit 0 endet.
_stub_commits() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"step_start"}'
echo implemented >> file.txt
git add -A
git commit -qm "fix(scripts): implementiert [T003810]"
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
}

# Stub, der mit einem echten Fehler endet (kein Commit, exit 3).
_stub_crash() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"step_start"}'
exit 3
EOF
  chmod +x "$STUB_BIN/opencode"
}

@test "T003810: No-Commit-Lauf (exit 6) inkrementiert retry_count" {
  _skip_if_no_db
  ext="$(_seed)"
  [ -n "$ext" ]
  _stub_noop

  run bash "$EXEC" "$ext" "$LAUNCH" fix/stub-T003810 openspec/changes/stub/tasks.md
  [ "$status" -eq 6 ]

  run bash scripts/ticket.sh retry-count get --id "$ext"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | tr -dc '0-9')" -eq 1 ]
}

@test "T003810: Commit-Lauf setzt retry_count zurueck (Positiv-Anker)" {
  _skip_if_no_db
  ext="$(_seed)"
  [ -n "$ext" ]
  # Vorbelegung: zwei gescheiterte No-Commit-Runden.
  bash scripts/ticket.sh retry-count incr --id "$ext" >/dev/null
  bash scripts/ticket.sh retry-count incr --id "$ext" >/dev/null
  _stub_commits

  run bash "$EXEC" "$ext" "$LAUNCH" fix/stub-T003810 openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  # Der Commit ist wirklich entstanden — sonst prueft der Anker nichts.
  run git -C "$LAUNCH" log --oneline -1
  [[ "$output" == *"implementiert"* ]]

  run bash scripts/ticket.sh retry-count get --id "$ext"
  [ "$(printf '%s' "$output" | tr -dc '0-9')" -eq 0 ]
}

@test "T003810: dritter No-Commit-Lauf setzt Ticket auf planning und gibt Slot frei" {
  _skip_if_no_db
  ext="$(_seed)"
  [ -n "$ext" ]
  bash scripts/ticket.sh set-pipeline-slot --id "$ext" --slot 1
  _stub_noop

  run bash "$EXEC" "$ext" "$LAUNCH" fix/stub-T003810 openspec/changes/stub/tasks.md
  [ "$status" -eq 6 ]
  run bash "$EXEC" "$ext" "$LAUNCH" fix/stub-T003810 openspec/changes/stub/tasks.md
  [ "$status" -eq 6 ]
  run bash "$EXEC" "$ext" "$LAUNCH" fix/stub-T003810 openspec/changes/stub/tasks.md
  [ "$status" -eq 6 ]

  # Ticket zurueck auf planning, Slot freigegeben, Zaehler wieder bei 0.
  run bash scripts/ticket.sh get --id "$ext"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | jq -r '.status')" = "planning" ]
  [ "$(printf '%s' "$output" | jq -r '.pipeline_slot')" = "null" ]

  run bash scripts/ticket.sh retry-count get --id "$ext"
  [ "$(printf '%s' "$output" | tr -dc '0-9')" -eq 0 ]
}

@test "T003810: Crash-Lauf (exit != 6) inkrementiert den Zaehler NICHT" {
  _skip_if_no_db
  ext="$(_seed)"
  [ -n "$ext" ]
  _stub_crash

  run bash "$EXEC" "$ext" "$LAUNCH" fix/stub-T003810 openspec/changes/stub/tasks.md
  [ "$status" -ne 0 ]
  # Positiv-Anker: der No-Commit-Fall (exit 6) zaehlt nachweislich — siehe Test
  # oben. Ein reiner Crash darf den Zaehler nicht beruehren.
  run bash scripts/ticket.sh retry-count get --id "$ext"
  [ "$(printf '%s' "$output" | tr -dc '0-9')" -eq 0 ]
}
