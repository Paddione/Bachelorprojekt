#!/usr/bin/env bats
# [T002692/T002693] check-and-claim: Scope-Argument gegen Flags absichern.
#
# Pruefmodus: command output verification [T002448-M4] — die Tests RUFEN
# agent-lock.sh auf und pruefen den entstandenen Lock bzw. die Ausgabe. Kein
# Grep auf die Implementierung: dass eine Validierung im Quelltext steht,
# belegt nicht, dass der Lock danach den richtigen Scope traegt.
#
# Beobachtet am 2026-08-08: `check-and-claim --ticket T002657 --label x` legte
# einen Lock mit SCOPE='--ticket' an und meldete Exit 0. Ursache ist
#   local scope="$1" id="${2:-}"
# — das Flag wird als Scope gelesen, die ID als Bezeichner. Die Form sieht aus
# wie ein Erfolg, erzeugt aber einen Lock, den scope-basierte Abfragen und der
# Reap nicht als ticket-Lock erkennen. Er sperrt faktisch nichts.
#
# Verschaerfend empfahl _reject_arg genau diese Form ("Erwartet werden benannte
# Flags: … --ticket <id>"), waehrend die Referenz-Doku
# (.claude/skills/references/dev-flow-execute-phases.md) die korrekte
# positionale Form zeigt.
#
# `--ticket` bleibt ein gueltiges Flag — aber als Ticket-REFERENZ an einem
# Branch-Lock (`check-and-claim branch feature/x --ticket T123`), nicht als
# Scope.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/agent-lock.sh"
  TEST_ID="TSCOPEPROBE"
}

teardown() {
  bash "$SCRIPT" release ticket "$TEST_ID" >/dev/null 2>&1 || true
  bash "$SCRIPT" release --ticket "$TEST_ID" >/dev/null 2>&1 || true
}

@test "T002692: positionale Form legt einen Lock mit Scope 'ticket' an" {
  # Positiv-Anker: ohne ihn koennte das Skript vollstaendig kaputt sein und die
  # Negativaussagen unten blieben trotzdem wahr.
  run bash "$SCRIPT" check-and-claim ticket "$TEST_ID" --label "scope probe"
  [ "$status" -eq 0 ]

  run bash "$SCRIPT" list
  [[ "$output" == *"$TEST_ID"* ]]
  # Die Scope-Spalte steht am Zeilenanfang.
  local line
  line="$(printf '%s\n' "$output" | grep -- "$TEST_ID" | head -1)"
  [[ "$line" == ticket* ]]
}

@test "T002692: ein Flag als Scope wird abgelehnt statt als Scope-Name uebernommen" {
  run bash "$SCRIPT" check-and-claim --ticket "$TEST_ID" --label "scope probe"

  # Der Aufruf darf NICHT als Erfolg gelten.
  [ "$status" -ne 0 ]

  # Und er darf keinen Lock hinterlassen haben — schon gar keinen mit dem
  # Flag-Namen als Scope. Geprueft wird gezielt die Zeile zu TEST_ID, nicht die
  # gesamte Liste: dort koennen Locks fremder Sessions stehen, und ein Test, der
  # daran scheitert, misst die Umgebung statt das Verhalten (beobachtet
  # 2026-08-08 an einem parallel laufenden Vorgang).
  run bash "$SCRIPT" list
  local line
  line="$(printf '%s\n' "$output" | grep -- "$TEST_ID" || true)"
  [ -z "$line" ]
}

@test "T002693: check-and-claim ohne Argumente meldet die erwartete Form, nicht 'unbound variable'" {
  run bash "$SCRIPT" check-and-claim

  [ "$status" -ne 0 ]
  # Der rohe Bash-Fehler darf nicht mehr durchschlagen.
  [[ "$output" != *"unbound variable"* ]]
  # Positiv: die Meldung nennt die erwartete Form.
  [[ "$output" == *"check-and-claim"* ]]
  [[ "$output" == *"scope"* || "$output" == *"ticket"* ]]
}
