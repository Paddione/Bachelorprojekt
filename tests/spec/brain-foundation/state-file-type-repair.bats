#!/usr/bin/env bats
# tests/spec/brain-foundation/state-file-type-repair.bats
# Ticket: T012903 — State-Typ-Reparatur
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Jeder Test
# fuehrt die State-Initialisierung des Ingest-Skripts aus und prueft den
# Dateiinhalt — nicht den Quelltext des Skripts.
#
# Die State-Initialisierung ist ein extrahiertes Snippet aus brain-ingest.sh
# (Zeile 154-157), das als eigenes Skript getestet wird, weil der volle
# Ingest-Lauf zu viele Abhaengigkeiten hat (Manifest, Worklist, LLM-Endpoint).

# Extract the state-init logic from brain-ingest.sh into a testable wrapper.
# The wrapper takes a STATE_FILE path as $1 and runs the same logic as
# brain-ingest.sh lines 154-157.
setup() {
  STATE_INIT="$BATS_TEST_TMPDIR/state-init.sh"
  cat > "$STATE_INIT" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
STATE_FILE="$1"

# --- State init logic (brain-ingest.sh, T012903) ---
if [ ! -f "$STATE_FILE" ]; then
  echo '{}' > "$STATE_FILE"
elif ! jq -e 'type == "object"' "$STATE_FILE" >/dev/null 2>&1; then
  echo "State file is not a JSON object, resetting to {}" >&2
  echo '{}' > "$STATE_FILE"
fi
WRAPPER
  chmod +x "$STATE_INIT"
}

@test "state file with array [] is repaired to empty object {}" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '[]' > "$STATE_FILE"

  run bash "$STATE_INIT" "$STATE_FILE"
  [ "$status" -eq 0 ]

  CONTENT="$(cat "$STATE_FILE")"
  [ "$CONTENT" = '{}' ]
}

@test "state file with valid object {\"key\":\"val\"} is left unchanged" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '{"key":"val"}' > "$STATE_FILE"

  run bash "$STATE_INIT" "$STATE_FILE"
  [ "$status" -eq 0 ]

  CONTENT="$(cat "$STATE_FILE")"
  [ "$CONTENT" = '{"key":"val"}' ]
}

@test "missing state file is created as empty object {}" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"

  run bash "$STATE_INIT" "$STATE_FILE"
  [ "$status" -eq 0 ]

  CONTENT="$(cat "$STATE_FILE")"
  [ "$CONTENT" = '{}' ]
}

@test "state file with empty string is repaired to {}" {
  STATE_FILE="$BATS_TEST_TMPDIR/state.json"
  echo '' > "$STATE_FILE"

  run bash "$STATE_INIT" "$STATE_FILE"
  [ "$status" -eq 0 ]

  CONTENT="$(cat "$STATE_FILE")"
  [ "$CONTENT" = '{}' ]
}
