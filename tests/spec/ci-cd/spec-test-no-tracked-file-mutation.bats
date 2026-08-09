#!/usr/bin/env bats
# tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats — [T002834/T002925]
#
# PRUEFMODUS: command output verification (CLAUDE.md Test-Resultats-Konvention T002448-M4).
# Der Guard fuehrt den realen Spec-Test P4.5 aus `tests/spec/agent-roster.bats` AUS und
# misst dessen Nebenwirkung auf die getrackten Karten-Dateien direkt am Dateisystem (mtime),
# statt den Quelltext des Emitters zu inspizieren.
#
# HINTERGRUND: `tests/spec/agent-roster.bats`, Test "P4.5: agents-map.md ist aktuell" ruft
# `task agent-guide:maps` auf. Das schreibt alle vier Karten unter docs/agent-guide/maps/
# in-place neu — unabhaengig davon, ob der Inhalt sich aendert. Der spec-tracked-file-guard
# (T002779) meldet die veraenderte mtime im CI (Shard 2) als Arbeitsbaum-Mutation, und ein
# paralleler `bats -j`-Lauf, der dieselben Karten liest, saehe den manipulierten Zwischenstand.
#
# Der Fix (T002834) soll den Emitter in ein Tempdir schreiben lassen und dort vergleichen,
# statt die getrackten Dateien zu ueberschreiben — dieser Test bleibt danach GRUEN, weil die
# mtimes der vier Karten sich durch den P4.5-Lauf nicht mehr aendern.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MAPS_DIR="${REPO_ROOT}/docs/agent-guide/maps"
  BATS_BIN="${REPO_ROOT}/tests/unit/lib/bats-core/bin/bats"
}

@test "P4.5-Lauf hinterlaesst keine mtime-Aenderung auf getrackten agent-guide-Karten" {
  cd "$REPO_ROOT"

  # Positiv-Anker [T002356-M1]: die vier Karten muessen ueberhaupt existieren, sonst waere
  # die Aussage unten (keine mtime-Aenderung) bei einer leeren Dateimenge trivial erfuellt.
  local maps=(agents-map.md danger-map.md goals-map.md tools-map.md)
  for m in "${maps[@]}"; do
    [ -f "${MAPS_DIR}/${m}" ] || { echo "ANKER ROT: ${MAPS_DIR}/${m} fehlt"; return 1; }
  done

  # mtimes VOR dem P4.5-Lauf einsammeln.
  local before=() m
  for m in "${maps[@]}"; do
    before+=("$(stat -c '%Y' "${MAPS_DIR}/${m}")")
  done

  # Den realen P4.5-Test ausfuehren (kein Mock) — sein Nebeneffekt wird gemessen, nicht
  # sein Ergebnis.
  run "$BATS_BIN" tests/spec/agent-roster.bats -f "P4.5"
  [ "$status" -eq 0 ] || { echo "P4.5 selbst schlug fehl (unerwartet, Vorbedingung nicht erfuellt):"; echo "$output"; return 1; }

  local after=() i=0 mutated=""
  for m in "${maps[@]}"; do
    after+=("$(stat -c '%Y' "${MAPS_DIR}/${m}")")
    [ "${before[$i]}" = "${after[$i]}" ] || mutated="${mutated} ${m}"
    i=$((i + 1))
  done

  [ -z "$mutated" ] || {
    echo "P4.5 hat getrackte Karten in-place neu geschrieben (mtime geaendert):${mutated}"
    echo "Fix: Emitter in ein Tempdir schreiben lassen und dort vergleichen (T002834)."
    return 1
  }
}
