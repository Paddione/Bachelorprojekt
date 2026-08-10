#!/usr/bin/env bats
# tests/spec/software-factory/auto-triage-type-vocab.bats — T003492
#
# PRUEFMODUS: Output-Verifikation (Test-Resultats-Konvention T002448-M4).
# Die Tests rufen `validate_triage` als echte Funktion auf und pruefen Exit-Code
# und stderr — kein grep auf den Quelltext. Moeglich wird das durch
# AUTO_TRIAGE_LIB_ONLY=1: damit definiert auto-triage.sh nur seine Funktionen und
# kehrt vor dem DB-Hauptteil zurueck, laeuft also offline und ohne Cluster.
#
# HINTERGRUND: auto-triage.sh trug das Typ-Vokabular an drei Stellen mit drei
# verschiedenen Wertemengen — JSON-Schema (Conventional Commits), validate_triage
# (bug|feature|task|project) und die Schema-Zeile des System-Prompts. Die
# Schnittmenge war genau `project`, weshalb die Triage jedes Nicht-Epic verwarf.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/factory/auto-triage.sh"
  ENUMS="${REPO_ROOT}/scripts/factory/triage-enums.json"
}

# Baut eine vollstaendige, ansonsten gueltige Triage-Antwort mit frei waehlbarem type.
_triage_json() {
  local t="$1"
  jq -nc --arg t "$t" \
     --arg area "$(jq -r '.areas[0]' "$ENUMS")" \
     --arg who  "$(jq -r '.assignees[0]' "$ENUMS")" \
     '{type:$t, priority:"mittel", severity:"minor", areas:[$area],
       component:null, assignee_suggested:$who, rationale:"Testfall."}'
}

# Ruft validate_triage in einer Subshell auf und liefert dessen Exit-Code.
#
# `set --` vor dem source ist Pflicht: ein gesourctes Skript erbt die
# Positionsparameter des Aufrufers, sonst laeuft der Skriptpfad in den
# Argument-Parser von auto-triage.sh und wird als "Unknown option" abgelehnt.
_validate() {
  run bash -c '
    set -euo pipefail
    SCRIPT="$1"; PAYLOAD="$2"; set --
    export BRAND=mentolder AUTO_TRIAGE_LIB_ONLY=1
    source "$SCRIPT"
    validate_triage "$PAYLOAD"
  ' _ "$SCRIPT" "$1"
}

@test "auto-triage: Skript laesst sich ohne Cluster als Funktionsbibliothek laden" {
  # Positiv-Anker fuer die gesamte Datei: schlaegt das fehl, sind alle weiteren
  # Aussagen wertlos, weil validate_triage gar nicht erst erreichbar waere.
  run bash -c '
    set -euo pipefail
    SCRIPT="$1"; set --
    export BRAND=mentolder AUTO_TRIAGE_LIB_ONLY=1
    source "$SCRIPT"
    declare -F validate_triage >/dev/null && echo GELADEN
  ' _ "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *GELADEN* ]]
}

@test "auto-triage: triage-enums.json fuehrt das Typ-Vokabular als .types" {
  run jq -e '.types | type == "array" and length > 0' "$ENUMS"
  [ "$status" -eq 0 ]
}

@test "auto-triage: validate_triage akzeptiert Conventional-Commit-Typen" {
  # Der eigentliche Regressionsfall: das JSON-Schema erzwingt genau diese Werte,
  # der Validator lehnte sie ab.
  for t in fix feat chore docs refactor perf test ci build project; do
    _validate "$(_triage_json "$t")"
    [ "$status" -eq 0 ] || {
      echo "type '$t' wurde abgelehnt: $output" >&2
      return 1
    }
  done
}

@test "auto-triage: validate_triage akzeptiert die deprecated Aliase" {
  # Ein Provider ohne json_schema-Unterstuetzung kann weiterhin bug/feature/task
  # liefern. Die werden angenommen statt das Ticket zu verwerfen.
  for t in bug feature task; do
    _validate "$(_triage_json "$t")"
    [ "$status" -eq 0 ] || {
      echo "deprecated type '$t' wurde abgelehnt: $output" >&2
      return 1
    }
  done
}

@test "auto-triage: validate_triage weist einen unbekannten Typ zurueck" {
  # Positiv-Anker zuerst (T002356-M1): ohne ihn bestuende der Negativtest auch
  # dann, wenn validate_triage gar nichts pruefte oder gar nicht existierte.
  _validate "$(_triage_json "fix")"
  [ "$status" -eq 0 ]

  _validate "$(_triage_json "bananentyp")"
  [ "$status" -ne 0 ]
  [[ "$output" == *"invalid type"* ]]
}

@test "auto-triage: normalize_triage_type bildet Aliase auf Conventional Commits ab" {
  run bash -c '
    set -euo pipefail
    SCRIPT="$1"; set --
    export BRAND=mentolder AUTO_TRIAGE_LIB_ONLY=1
    source "$SCRIPT"
    printf "%s %s %s %s\n" \
      "$(normalize_triage_type bug)" \
      "$(normalize_triage_type feature)" \
      "$(normalize_triage_type task)" \
      "$(normalize_triage_type fix)"
  ' _ "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == "fix feat chore fix" ]]
}

@test "auto-triage: DRY_RUN aus der Umgebung wird respektiert" {
  # Zeile 22 wies DRY_RUN unbedingt auf false zu und ueberschrieb damit die
  # Umgebung — der Lauf meldete "DRY_RUN=false", obwohl true gesetzt war.
  run bash -c '
    set -euo pipefail
    SCRIPT="$1"; set --
    export BRAND=mentolder DRY_RUN=true AUTO_TRIAGE_LIB_ONLY=1
    source "$SCRIPT"
    echo "DRY_RUN=${DRY_RUN}"
  ' _ "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY_RUN=true"* ]]
}

@test "auto-triage: ohne gesetztes DRY_RUN bleibt es false" {
  # Gegenprobe — der Factory-Pfad (wakeup.sh) exportiert DRY_RUN nicht und darf
  # sich durch die Aenderung nicht verhalten wie ein Trockenlauf.
  run bash -c '
    set -euo pipefail
    unset DRY_RUN
    SCRIPT="$1"; set --
    export BRAND=mentolder AUTO_TRIAGE_LIB_ONLY=1
    source "$SCRIPT"
    echo "DRY_RUN=${DRY_RUN}"
  ' _ "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY_RUN=false"* ]]
}
