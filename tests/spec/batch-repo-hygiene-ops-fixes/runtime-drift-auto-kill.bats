#!/usr/bin/env bats
# tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats
#
# Ticket: T004897 — Auto-Kill-Modus fuer scripts/runtime-drift-check.sh.
# Der Guard beendet mit --auto-kill driftende Prozesse der eigenen
# MCP-Registry (SIGTERM); ohne das Flag bleibt er meldend (Bestandstest
# runtime-drift-check.bats deckt den Default ab und muss gruen bleiben).
#
# PRUEFMODUS: Command-Output-Verifikation [T002448-M4]. Jeder Test RUFT den
# Guard AUF und prueft $status/$output/Prozesszustand. Der (deleted)-Zustand
# wird ECHT hergestellt (Wegwerf-Binary starten, Datei loeschen) wie im
# Bestandstest. Der DB-Pruefer wird per RUNTIME_DRIFT_CTX auf einen
# garantiert unerreichbaren Kontext gestellt, damit der Test nicht am
# Cluster-/DB-Zustand haengt (deterministisch, CI-tauglich).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/runtime-drift-check.sh"
  TMP="$BATS_TEST_TMPDIR"
}

teardown() {
  [[ -n "${OWN_PID:-}" ]] && kill "$OWN_PID" 2>/dev/null
  [[ -n "${FOREIGN_PID:-}" ]] && kill "$FOREIGN_PID" 2>/dev/null
  return 0
}

# --- Auto-Kill: Heilung + Sicherheitsgrenze --------------------------------

@test "T004897: --auto-kill beendet registrierte Drift-Prozesse, Fremdprozesse ueberleben, Exit 0" {
  # Zwei Wegwerf-Binaries: eine registrierte (OWN) und eine fremde (FOREIGN)
  cp "$(command -v sleep)" "$TMP/auto-probe"
  cp "$(command -v sleep)" "$TMP/foreign-probe"
  "$TMP/auto-probe" 60 &
  OWN_PID=$!
  "$TMP/foreign-probe" 60 &
  FOREIGN_PID=$!
  sleep 0.3

  # Beide auf echten (deleted)-Zustand bringen
  rm -f "$TMP/auto-probe" "$TMP/foreign-probe"
  [[ "$(readlink "/proc/$OWN_PID/exe")" == *" (deleted)" ]] \
    || skip "(deleted)-Zustand auf diesem Kernel nicht herstellbar"
  [[ "$(readlink "/proc/$FOREIGN_PID/exe")" == *" (deleted)" ]] \
    || skip "(deleted)-Zustand auf diesem Kernel nicht herstellbar"

  # Registry enthaelt NUR die eigene Binary — die fremde ist kein Kandidat
  cat > "$TMP/registry.yaml" <<EOF
clients:
  auto-probe:
    transport: stdio
    command: $TMP/auto-probe
EOF

  RUNTIME_DRIFT_REGISTRY="$TMP/registry.yaml" \
  RUNTIME_DRIFT_CTX="kein-solcher-kontext-T004897" \
    run "$GUARD" --auto-kill

  # Positiv-Anker ZUERST [T002356-M1]: der Guard MUSS den eigenen Drift
  # gefunden und beendet haben — erst dann ist die Negativ-Aussage belastbar.
  # Ein Guard, der das Flag still ignoriert (heutiger Zustand), faellt hier rot.
  [[ "$output" == *"$OWN_PID"* ]]
  ! kill -0 "$OWN_PID"

  # Negativ: Fremdprozess (nicht registriert) ueberlebt — Sicherheitsgrenze.
  kill -0 "$FOREIGN_PID"

  # Exit 0: Drift geheilt, kein residualer Befund (DB unerreichbar -> skip).
  [ "$status" -eq 0 ]
}

# --- Argumente ---------------------------------------------------------------

@test "T004897: unbekanntes Argument fuehrt zu Usage und Exit 2" {
  run "$GUARD" --does-not-exist
  [ "$status" -eq 2 ]
  [[ "$output" == *"Usage"* || "$output" == *"usage"* ]]
}
