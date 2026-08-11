#!/usr/bin/env bats
# tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats
#
# Ticket: T003825 — Laufzeit-Drift ungeprueft: gemergte Fixes laufen nicht,
# ohne dass es auffaellt.
#
# PRUEFMODUS: Command-Output-Verifikation [T002448-M4]. Jeder Test RUFT
# scripts/runtime-drift-check.sh AUF und prueft $status/$output. Kein Test
# greppt die Implementierungsquelle — der Defekt, gegen den hier geprueft wird,
# war im Quelltext gerade NICHT sichtbar (createFactoryFixTicket hatte keinen
# Aufrufer, waehrend der laufende Prozess ihn weiter ausfuehrte). Ein
# Source-Grep haette ihn per Konstruktion verfehlt.
#
# SEMANTIK STATT DARSTELLUNG [T002716]: Geprueft werden Exit-Status und das
# Vorkommen der PID bzw. des Funktionsnamens — nicht das Ausgabelayout, nicht
# der Wortlaut der Meldungen.
#
# Der (deleted)-Zustand wird ECHT hergestellt (Wegwerf-Binary starten, Datei
# loeschen), nicht simuliert. Der DB-Pruefer wird gegen die reale Funktion
# geprueft und skippt sauber, wenn kein Cluster erreichbar ist.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/runtime-drift-check.sh"
  TMP="$BATS_TEST_TMPDIR"
}

teardown() {
  [[ -n "${FAKE_PID:-}" ]] && kill "$FAKE_PID" 2>/dev/null
  return 0
}

# --- Positiv-Anker [T002356-M1] -------------------------------------------
# Ohne diesen Test bestuenden die Negativ-Aussagen unten vakuos: fehlt das
# Skript, ist jede "meldet keinen Drift"-Aussage trivial erfuellt.

@test "T003825: runtime-drift-check.sh existiert und ist ausfuehrbar" {
  [ -x "$GUARD" ]
}

@test "T003825: Guard laeuft ohne Argumente durch und liefert einen Exit-Status" {
  run "$GUARD"
  # 0 = kein Drift, 1 = Drift. Alles andere (2, 127, …) ist ein Guard-Defekt.
  [[ "$status" -eq 0 || "$status" -eq 1 ]]
  [ -n "$output" ]
}

# --- Pruefer 1: MCP-Prozesse ----------------------------------------------

@test "T003825: Prozess mit ersetzter Binary wird mit seiner PID gemeldet, Exit 1" {
  # Wegwerf-Binary, das lange genug laeuft
  cp "$(command -v sleep)" "$TMP/drift-probe"
  "$TMP/drift-probe" 60 &
  FAKE_PID=$!
  sleep 0.3

  # Datei ersetzen -> der laufende Prozess haelt die geloeschte Inode
  rm -f "$TMP/drift-probe"
  [[ "$(readlink "/proc/$FAKE_PID/exe")" == *" (deleted)" ]] \
    || skip "(deleted)-Zustand auf diesem Kernel nicht herstellbar"

  # Test-Registry statt der echten, damit der Test keine laufende Session trifft
  cat > "$TMP/registry.yaml" <<EOF
clients:
  drift-probe:
    transport: stdio
    command: $TMP/drift-probe
EOF

  RUNTIME_DRIFT_REGISTRY="$TMP/registry.yaml" run "$GUARD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"$FAKE_PID"* ]]
}

@test "T003825: Guard beendet den driftenden Prozess NICHT" {
  cp "$(command -v sleep)" "$TMP/drift-probe"
  "$TMP/drift-probe" 60 &
  FAKE_PID=$!
  sleep 0.3
  rm -f "$TMP/drift-probe"
  [[ "$(readlink "/proc/$FAKE_PID/exe")" == *" (deleted)" ]] \
    || skip "(deleted)-Zustand auf diesem Kernel nicht herstellbar"

  cat > "$TMP/registry.yaml" <<EOF
clients:
  drift-probe:
    transport: stdio
    command: $TMP/drift-probe
EOF

  RUNTIME_DRIFT_REGISTRY="$TMP/registry.yaml" run "$GUARD"

  # Positiv-Anker ZUERST [T002356-M1]: ohne ihn ist die Aussage vakuos — ein
  # nicht existierender Guard killt naturgemaess nichts, und der Test waere im
  # RED-Lauf gruen (beobachtet, T003548-Klasse). Erst belegen, dass der Guard
  # den Drift ueberhaupt gefunden hat, dann pruefen, dass er nicht eingegriffen hat.
  [ "$status" -eq 1 ]
  [[ "$output" == *"$FAKE_PID"* ]]

  # Der Prozess muss den Guard ueberleben — er meldet, er greift nicht ein.
  kill -0 "$FAKE_PID"
}

@test "T003825: unveraenderte Binary erzeugt keinen Drift-Befund" {
  cp "$(command -v sleep)" "$TMP/clean-probe"
  "$TMP/clean-probe" 60 &
  FAKE_PID=$!
  sleep 0.3

  cat > "$TMP/registry.yaml" <<EOF
clients:
  clean-probe:
    transport: stdio
    command: $TMP/clean-probe
EOF

  RUNTIME_DRIFT_REGISTRY="$TMP/registry.yaml" run "$GUARD"
  [ "$status" -eq 0 ]
  [[ "$output" != *"$FAKE_PID"* ]]
}

# --- Pruefer 2: DB-Funktionen ---------------------------------------------

@test "T003825: nicht angewendete Migration wird mit Funktionsnamen gemeldet" {
  kubectl version --client >/dev/null 2>&1 || skip "kubectl nicht installiert"

  cat > "$TMP/migration.sql" <<'EOF'
-- RUNTIME-CHECK: function=tickets.fn_purge_test_data marker=zzz_marker_das_nie_existiert
SELECT 1;
EOF

  RUNTIME_DRIFT_MIGRATIONS="$TMP" run "$GUARD"
  # Ohne DB-Zugriff: uebersprungen (Status 0). Mit DB-Zugriff: Drift (Status 1).
  # Beides ist zulaessig — unzulaessig waere, den fehlenden Marker zu verschweigen.
  if [[ "$status" -eq 1 ]]; then
    [[ "$output" == *"fn_purge_test_data"* ]]
  else
    [ "$status" -eq 0 ]
    [[ "$output" == *"bersprungen"* || "$output" == *"skip"* ]]
  fi
}

@test "T003825: unerreichbare DB meldet uebersprungen statt Drift, Exit 0" {
  cat > "$TMP/migration.sql" <<'EOF'
-- RUNTIME-CHECK: function=tickets.fn_purge_test_data marker=to_regclass
SELECT 1;
EOF

  # Kontext, den es garantiert nicht gibt -> DB unerreichbar
  RUNTIME_DRIFT_MIGRATIONS="$TMP" \
  RUNTIME_DRIFT_CTX="kein-solcher-kontext-T003825" run "$GUARD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"bersprungen"* || "$output" == *"skip"* ]]
}

# --- Einbindung ------------------------------------------------------------

@test "T003825: repo-hygiene ruft den Guard auf" {
  run grep -c "runtime-drift-check" "$REPO_ROOT/.claude/skills/repo-hygiene/SKILL.md"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
