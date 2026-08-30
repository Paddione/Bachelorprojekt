#!/usr/bin/env bats
# tests/spec/repo-hygiene/precheck-foreign-session.bats
# SSOT: .claude/skills/references/repo-hygiene-ops.md (§0/§1 Vorcheck)
#
# Pruefmodus: command output verification [T002448-M4]. Das Skript wird
# AUSGEFUEHRT und an Exit-Code und Ausgabe gemessen.
#
# Hintergrund T900016: Der Vorcheck prueste nur /tmp/factory-tick.lock. Eine
# interaktive Fremdsession mutiert das Repo aber ohne diesen Lock — am
# 2026-08-30 zweimal in einem Lauf (ein `git reset` auf origin/main, ein
# Branch-Wechsel, der einen Commit auf einem fremden Branch landen liess).
# Der Stabilitaets-Fingerabdruck erkennt die Mutation am ERGEBNIS statt am
# Verursacher und traegt deshalb auch fuer Quellen, die niemand aufgezaehlt hat.

PROBE_BRANCH="t900016-precheck-probe"

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/repo-hygiene-precheck.sh"
  [ -f "$SCRIPT" ] || skip "repo-hygiene-precheck.sh fehlt"
}

teardown() {
  # Die Sonde legt einen Branch an. Auch bei rotem Test wieder abraeumen —
  # sonst hinterlaesst der Guard genau die Unordnung, die er messen soll.
  git -C "$REPO" branch -D "$PROBE_BRANCH" >/dev/null 2>&1 || true
}

@test "T900016: --snapshot liefert einen stabilen Fingerabdruck" {
  run bash "$SCRIPT" --snapshot
  [ "$status" -eq 0 ]
  first="$output"
  # Positiv-Anker: ueberhaupt ein Hash, nicht bloss leere Ausgabe.
  [[ "$first" =~ ^[0-9a-f]{64}$ ]]

  run bash "$SCRIPT" --snapshot
  [ "$status" -eq 0 ]
  # Ohne Mutation dazwischen muss derselbe Wert herauskommen — sonst waere der
  # Fingerabdruck als Driftmass wertlos (jede Messung meldete Drift).
  [ "$output" = "$first" ]
}

@test "T900016: --verify meldet einen unveraenderten Zustand als stabil" {
  fp="$(bash "$SCRIPT" --snapshot)"
  run bash "$SCRIPT" --verify "$fp"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"stabil"* ]]
}

@test "T900016: --verify erkennt eine Fremdmutation am Branch-Bestand" {
  fp="$(bash "$SCRIPT" --snapshot)"

  # Positiv-Anker ZUERST: vor der Mutation ist der Zustand stabil. Ohne ihn
  # bestuende die Negativ-Aussage auch bei einem Skript, das immer rc=1 liefert.
  run bash "$SCRIPT" --verify "$fp"
  [ "$status" -eq 0 ]

  # Das tut eine Fremdsession: sie veraendert Refs, ohne /tmp/factory-tick.lock
  # zu halten.
  git -C "$REPO" branch "$PROBE_BRANCH" HEAD

  run bash "$SCRIPT" --verify "$fp"
  echo "output: $output"
  [ "$status" -eq 1 ]
  [[ "$output" == *"DRIFT"* ]]

  # Und nach dem Zuruecknehmen wieder stabil — der Guard reagiert auf den
  # Zustand, nicht auf ein einmal gesetztes Flag.
  git -C "$REPO" branch -D "$PROBE_BRANCH"
  run bash "$SCRIPT" --verify "$fp"
  [ "$status" -eq 0 ]
}

@test "T900016: --verify ohne Fingerabdruck ist Vorbedingung (2), nicht Befund (1)" {
  # Die Unterscheidung traegt: rc=1 wuerde einen Aufrufer glauben lassen, es
  # habe Drift gegeben, obwohl nur das Argument fehlt.
  run bash "$SCRIPT" --verify
  echo "output: $output"
  [ "$status" -eq 2 ]
}

@test "T900016: unbekannte Option ist Vorbedingung (2), nicht Befund (1)" {
  run bash "$SCRIPT" --gibtsnicht
  echo "output: $output"
  [ "$status" -eq 2 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "T900016: der Vorcheck prueft den main-checkout-Claim, nicht nur den Factory-Tick" {
  run bash "$SCRIPT" --check
  echo "output: $output"
  # rc 0 oder 1 sind beide gueltige Messergebnisse; 2 waere ein kaputter Aufruf.
  [ "$status" -ne 2 ]
  # Beide Quellen werden benannt — das war der Kern des Befunds: der alte
  # Vorcheck kannte nur die erste.
  [[ "$output" == *"Factory-Tick"* ]]
  [[ "$output" == *"main-checkout"* ]]
}

@test "T900016: das Runbook ruft den Vorcheck auf, statt ihn nur zu beschreiben" {
  # Pruefmodus-Ausnahme (tests/CLAUDE.md): eine Dokumentationskonvention
  # manifestiert sich ausschliesslich im Dateiinhalt. Ohne diesen Guard koennte
  # das Skript existieren und trotzdem nie aufgerufen werden — genau der
  # Zustand, in dem der main-checkout-Claim vor T900016 war: vorhanden,
  # aber vom Runbook nicht benutzt.
  runbook="$REPO/.claude/skills/references/repo-hygiene-ops.md"
  [ -f "$runbook" ]

  # Positiv-Anker zuerst: das Runbook nennt den Vorcheck-Aufruf.
  run grep -qF -e 'scripts/repo-hygiene-precheck.sh' "$runbook"
  [ "$status" -eq 0 ]

  # Und den Claim, ohne den eine Fremdsession jederzeit zulaessig bleibt.
  run grep -qF -e 'agent-lock.sh claim main-checkout' "$runbook"
  [ "$status" -eq 0 ]
}
