#!/usr/bin/env bats
# tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats
# [T003278] bats liefert Exit 0 fuer eine nicht existierende .bats-Datei.
# Der zentrale Wrapper scripts/lib/run-bats.sh MUSS bei fehlendem Pfad mit
# Exit != 0 abbrechen (T002716: Semantik statt Darstellung — Exit-Codes pruefen).

load "$BATS_TEST_DIRNAME/../../unit/lib/bats-helpers.bash" 2>/dev/null || true

setup() {
  REPO_ROOT="$(cd "$(dirname "${BATS_TEST_FILENAME}")/../../.." && pwd)"
  WRAPPER="$REPO_ROOT/scripts/lib/run-bats.sh"
  BATS_BIN="$REPO_ROOT/tests/unit/lib/bats-core/bin/bats"
}

@test "T003278: fehlende .bats-Datei -> Wrapper endet mit Exit != 0" {
  # Reproduktion aus dem Ticket: bats meldet die fehlende Datei, endet aber mit 0.
  if [[ ! -x "$WRAPPER" ]]; then
    skip "scripts/lib/run-bats.sh existiert noch nicht (T003278 RED-Phase)"
  fi
  run bash "$WRAPPER" "$REPO_ROOT/tests/spec/nicht-da-T003278.bats"
  [[ "$status" -ne 0 ]]
}

@test "T003278: fehlendes Verzeichnis -> Wrapper endet mit Exit != 0" {
  if [[ ! -x "$WRAPPER" ]]; then
    skip "scripts/lib/run-bats.sh existiert noch nicht (T003278 RED-Phase)"
  fi
  run bash "$WRAPPER" -r "$REPO_ROOT/tests/spec/definitiv-nicht-vorhanden-T003278"
  [[ "$status" -ne 0 ]]
}

@test "T003278 Positiv-Anker: existierender Testpfad laeuft normal und propagiert Exit" {
  if [[ ! -x "$WRAPPER" ]]; then
    skip "scripts/lib/run-bats.sh existiert noch nicht (T003278 RED-Phase)"
  fi
  # Einen existierenden, gruenen Mini-Test im Temp-Ordner anlegen und ueber den
  # Wrapper ausfuehren — der Exit-Code des zugrunde liegenden bats muss durchkommen.
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "$tmpdir/pass.bats" <<'EOF'
@test "pass" {
  true
}
EOF
  run bash "$WRAPPER" "$tmpdir/pass.bats"
  rm -rf "$tmpdir"
  [[ "$status" -eq 0 ]]
}
