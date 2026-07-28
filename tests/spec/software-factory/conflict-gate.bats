#!/usr/bin/env bats
# tests/spec/software-factory/conflict-gate.bats — Factory-Conflict-Gate [T002418]
#
# Vier voneinander unabhaengige Loecher, die am 2026-07-28 dazu fuehrten, dass T002341,
# T002373 und T002374 gleichzeitig scripts/agent-lock.sh aenderten (PRs #3446/#3448/#3449
# kollidierten). Jedes Loch hat hier seinen eigenen Test.
#
# Neue Verzeichniskonvention (T002416): eine Datei pro Vorgang unter tests/spec/<spec-slug>/.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CHECK="${REPO_ROOT}/scripts/factory/conflict-check.sh"
  PIPELINE="${REPO_ROOT}/scripts/factory/pipeline.mjs"
  RUNNER="${REPO_ROOT}/scripts/factory/pipeline-runner.js"
  SCHEDULE="${REPO_ROOT}/scripts/factory/schedule.sh"
}

# Nicht-Kommentarzeilen einer Datei — sonst matchen die Erklaerungen, die gerade
# beschreiben, warum die alte Form falsch war.
_code() { grep -vE '^\s*(#|//|\*|/\*)' "$1"; }

@test "conflict-gate A1: Statusfilter bleibt auf in_progress/in_review" {
  # Geprueft und VERWORFEN: 'plan_staged' aufzunehmen. Es sah nach der offensichtlichen
  # Luecke aus, ist aber falsch — schedule.sh ruft conflict-check VOR slots.sh claim-gang
  # auf, und der Claim setzt status='in_progress'. Der naechste Schleifendurchlauf sieht
  # das vorherige Ticket also. 'plan_staged' wuerde falsch-positiv blockieren, weil ein
  # Ticket dort tagelang liegen kann. Doppelt festgehalten (auch in FA-SF-45), damit die
  # Versuchung nicht wiederkehrt.
  #
  # Positiv-Anker: der Statusfilter existiert ueberhaupt ...
  run bash -c "_code() { grep -vE '^\s*(#|--)' \"\$1\"; }; _code '$CHECK' | grep -c 't.status IN'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # ... und fuehrt weder plan_staged noch backlog.
  run bash -c "_code() { grep -vE '^\s*(#|--)' \"\$1\"; }; _code '$CHECK' | grep 't.status IN' | grep -cE 'plan_staged|backlog'"
  [ "$output" -eq 0 ]
}

@test "conflict-gate A1b: SQL-Typfilter erfasst bug und fix" {
  # Positiv-Anker: der Typfilter existiert und kennt feature ...
  run bash -c "_code() { grep -vE '^\s*(#|//)' \"\$1\"; }; _code '$CHECK' | grep 't.type IN' | grep -c 'feature'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # ... und auch bug/fix. Die drei realen Kollidenten waren Mishap-Tickets.
  run bash -c "_code() { grep -vE '^\s*(#|//)' \"\$1\"; }; _code '$CHECK' | grep 't.type IN' | grep -c \"'bug'\""
  [ "$output" -ge 1 ]
}

@test "conflict-gate A2: pipeline-runner.js kennt das Kommando conflict-check" {
  # Positiv-Anker: der Runner dispatcht ueberhaupt Kommandos, u.a. das bereits
  # vorhandene conflict-escalate ...
  run bash -c "grep -c \"command === 'conflict-escalate'\" '$RUNNER'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # ... und der CHECK selbst laeuft jetzt ebenfalls deterministisch statt ueber einen
  # Agenten. Genau diese Asymmetrie war der Defekt.
  run bash -c "grep -c \"command === 'conflict-check'\" '$RUNNER'"
  [ "$output" -ge 1 ]
}

@test "conflict-gate A3: pipeline.mjs entscheidet nicht per Regex auf LLM-Prosa" {
  # Positiv-Anker: die Plan-Phase ruft den Conflict-Check ueberhaupt auf ...
  run bash -c "grep -c 'conflict' '$PIPELINE'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # ... aber nicht mehr ueber einen Regex auf der Freitext-Antwort eines Agenten.
  # /\"T0/ traf nur, wenn das Modell die Ticket-ID zufaellig in Anfuehrungszeichen ausgab.
  run bash -c "_code() { grep -vE '^\s*(//|\*|/\*)' \"\$1\"; }; _code '$PIPELINE' | grep -c 'test(conflict)'"
  [ "$output" -eq 0 ]
  # Positiv-Gegenprobe: die Entscheidung laeuft ueber runRunner, also deterministisch.
  run bash -c "grep -c \"runRunner(.*'conflict-check'\" '$PIPELINE'"
  [ "$output" -ge 1 ]
}

@test "conflict-gate A4: pipeline.mjs persistiert scout.touched_files ins Ticket" {
  # Die Wurzel aller vier Loecher: der Scout KENNT die Dateien, gibt sie an den
  # unmittelbaren Check weiter und wirft sie dann weg. Weil touched_files in der DB null
  # bleibt (verifiziert an T002341), ist jedes Ticket fuer nachfolgende Pruefungen
  # unsichtbar — conflict-check.sh filtert mit "touched_files IS NOT NULL".
  #
  # Positiv-Anker: der Scout liefert die Liste ueberhaupt ...
  run bash -c "grep -c 'scout.touched_files' '$PIPELINE'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # ... und sie wird ins Ticket geschrieben.
  run bash -c "grep -c 'set-touched-files\|set_touched_files' '$PIPELINE'"
  [ "$output" -ge 1 ]
}

@test "conflict-gate A2b: schedule.sh uebergibt die Dateiliste nicht mehr implizit" {
  # Positiv-Anker: schedule.sh ruft das Gate auf ...
  run bash -c "_code() { grep -vE '^\s*#' \"\$1\"; }; _code '$SCHEDULE' | grep -c 'conflict-check.sh'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # ... und rc 2 geht nicht mehr stillschweigend durch. Geprueft wird der ausfuehrbare
  # Zweig, nicht der Kommentar: die alte Fassung erklaerte rc 2 bereits in einem Kommentar
  # ("rc 2 = error/null touched_files (treat as schedulable)"), ein grep ueber die ganze
  # Datei waere davon schon vakuos gruen gewesen.
  run bash -c "grep -vE '^\s*#' '$SCHEDULE' | grep -A2 'rc\" -eq 2' | grep -c 'WARN'"
  [ "$output" -ge 1 ]
}
