#!/usr/bin/env bats
# tests/spec/agent-skills/finalize-plan-ref-whitespace.bats
# SSOT: openspec/specs/agent-skills.md (Delta: finalize-plan-ref-whitespace, T012243)
#
# PRÜFMODUS: Output-Verifikation (T002448-M4). Die Feld-Extraktion aus
# scripts/devflow-post-merge-finalize.sh wird per awk-Bereichsmuster extrahiert
# und AUSGEFÜHRT; geprüft werden die resultierenden Werte von BRANCH und
# PLAN_FILE, nicht ob ein Muster im Quelltext steht. Bereichsmuster statt
# Zeilennummern (T003104).
#
# Defekt (T012243): json_field() entfernt per sed-Klasse [:space:] ALLE
# Leerzeichen aus dem Wert. plan_ref hat die Form
#   "FACTORY-PLAN-REF branch=<b> plan=<p>"
# und verliert dadurch die Trennung; die nachgelagerte Extraktion
# `grep -oE 'branch=[^ ]+'` matcht bis Zeilenende und liefert
#   BRANCH="<b>plan=<p>"
# Folge: die branch-exakte Worktree-Auflösung findet nichts, Schritt 10 meldet
# fälschlich "bereits entfernt" und der Worktree bleibt liegen. Betrifft jeden
# Aufruf ohne explizites --branch — genau so ruft dev-flow-execute das Skript auf.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FINALIZE="$REPO_ROOT/scripts/devflow-post-merge-finalize.sh"
  [ -f "$FINALIZE" ]

  EXPECTED_BRANCH="fix/finalizer-resolve-worktree-by-branch-T012240"
  EXPECTED_PLAN="openspec/changes/finalizer-resolve-worktree-by-branch/tasks.md"
  # Realistische ticket.sh-get-Ausgabe (Feldreihenfolge wie im echten JSON)
  TICKET_JSON="{\"external_id\" : \"T012240\", \"type\" : \"bug\", \"status\" : \"done\", \"plan_ref\" : \"FACTORY-PLAN-REF branch=${EXPECTED_BRANCH} plan=${EXPECTED_PLAN}\"}"
}

# Schneidet json_field() plus die plan_ref-Auswertung (Schritt 2) aus dem Skript
# und führt sie gegen $TICKET_JSON aus. Gibt "BRANCH=…" und "PLAN_FILE=…" aus.
extract_fields() {
  local prelude section
  # Praeambel: von der json_field-Definition bis einschliesslich der
  # PLAN_REF-Zuweisung — der Extraktor-AUFRUF kommt damit aus dem Skript und
  # wird nicht im Test nachgebaut (sonst pruefte der Test die eigene Annahme).
  prelude="$(awk '
    /^# json_field: fuer Werte OHNE/ { inside = 1 }
    /^json_field\(\) \{/          { inside = 1 }
    inside                           { print }
    inside && /^PLAN_REF=/           { exit }
  ' "$FINALIZE")"
  # Schritt 2: plan_ref in BRANCH und PLAN_FILE zerlegen.
  section="$(awk '
    /^PLAN_FILE=""$/ { inside = 1 }
    inside           { print }
    inside && /^fi$/ { exit }
  ' "$FINALIZE")"

  [ -n "$prelude" ] || { echo "FATAL: json_field/PLAN_REF-Praeambel nicht gefunden" >&2; return 2; }
  [ -n "$section" ] || { echo "FATAL: plan_ref-Auswertung nicht gefunden" >&2; return 2; }
  grep -q '^PLAN_REF=' <<<"$prelude" || { echo "FATAL: PLAN_REF-Zuweisung fehlt in der Praeambel" >&2; return 2; }

  REPO_DIR=/repo TICKET_JSON="$TICKET_JSON" BRANCH="" bash -c "
    set -uo pipefail
    $prelude
    $section
    printf 'BRANCH=%s\n' \"\$BRANCH\"
    printf 'PLAN_FILE=%s\n' \"\$PLAN_FILE\"
  "
}

# Positiv-Anker (T002356-M1): die Extraktion muss überhaupt etwas liefern.
# Ohne ihn wären die Gleichheits-Assertions unten vakuos, falls die Sektion
# gar nichts produziert.
@test "extract: json_field und plan_ref-Auswertung liefern nicht-leere Werte" {
  run extract_fields
  [ "$status" -eq 0 ]
  [[ "$output" == *"BRANCH="* ]]
  [[ "$output" == *"PLAN_FILE="* ]]
  [ -n "$(sed -n 's/^BRANCH=//p' <<<"$output")" ]
  [ -n "$(sed -n 's/^PLAN_FILE=//p' <<<"$output")" ]
}

@test "extract: BRANCH ist der Branchname allein, ohne angehaengtes plan=" {
  run extract_fields
  [ "$status" -eq 0 ]
  local got; got="$(sed -n 's/^BRANCH=//p' <<<"$output")"
  [ "$got" = "$EXPECTED_BRANCH" ]
}

@test "extract: PLAN_FILE ist der Plan-Pfad, zu REPO_DIR absolut gemacht" {
  run extract_fields
  [ "$status" -eq 0 ]
  local got; got="$(sed -n 's/^PLAN_FILE=//p' <<<"$output")"
  [ "$got" = "/repo/$EXPECTED_PLAN" ]
}

# Regression-Anker: json_field muss für Felder OHNE Leerzeichen weiter
# funktionieren — der Fix darf status/type nicht kaputtmachen.
@test "extract: json_field liefert weiterhin status und type korrekt" {
  local fn
  fn="$(awk '/^json_field\(\) \{/{i=1} i{print} i&&/^\}$/{exit}' "$FINALIZE")"
  run bash -c "
    set -uo pipefail
    $fn
    printf 'status=%s\n' \"\$(json_field status '$TICKET_JSON')\"
    printf 'type=%s\n' \"\$(json_field type '$TICKET_JSON')\"
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"status=done"* ]]
  [[ "$output" == *"type=bug"* ]]
}
