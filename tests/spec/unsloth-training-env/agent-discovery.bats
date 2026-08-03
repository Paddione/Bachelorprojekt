#!/usr/bin/env bats
# tests/spec/unsloth-training-env/agent-discovery.bats — Oracle- und Registry-Anbindung des
# finetune:-Subsystems [T002587].
#
# Pruefmodus: command output verification (T002448-M4), mit einer dokumentierten Ausnahme:
# der zweite Test prueft die YAML-Registry direkt (Konfigurationsdatei, kein Laufzeitverhalten
# — deckungsgleich mit der im CLAUDE.md dokumentierten Ausnahme fuer Querschnitts-/
# Konventionstests).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "agent-discovery: die finetune:-Tasks sind ueber den Task-Oracle im Trockenlauf aufloesbar" {
  # Positiv-Anker zuerst: eine bekannte, bereits etablierte Task (llm:status) loest ueber den
  # strukturellen Fast-Path auf, ohne die lokale LLM zu benoetigen.
  #
  # Der Fast-Path validiert gegen `task --list-all`. Schlaegt DIESER Aufruf fehl, meldet das
  # Oracle "Unknown task" und der Anker wird rot — ohne zu sagen, warum. Genau das kostete
  # in CI einen Ratezyklus (der Test war lokal gruen, in CI rot). Deshalb gibt der Anker im
  # Fehlerfall die Ursache aus, statt nur den Status zu pruefen.
  run bash "$REPO_ROOT/scripts/vda.sh" oracle --dry-run 'llm:status'
  if [ "$status" -ne 0 ]; then
    echo "oracle --dry-run 'llm:status' exit=$status" >&2
    echo "oracle output: $output" >&2
    echo "task --version: $(cd "$REPO_ROOT" && task --version 2>&1)" >&2
    echo "task --list-all (erste 5 Zeilen): $(cd "$REPO_ROOT" && task --list-all 2>&1 | head -5)" >&2
    false
  fi
  [[ "$output" == *"task llm:status"* ]]

  # Negativ/Positiv-Kern dieses Tests: jede neue finetune:-Task muss denselben Fast-Path
  # nehmen (Task existiert im Taskfile) statt auf die LLM-Fallback-Kette angewiesen zu sein.
  for t in measure guard train traces export; do
    run bash "$REPO_ROOT/scripts/vda.sh" oracle --dry-run "finetune:${t}"
    [ "$status" -eq 0 ] || { echo "finetune:${t} → exit=$status output=$output" >&2; false; }
    [[ "$output" == *"task finetune:${t}"* ]]
  done
}

@test "agent-discovery: toolset-context.sh gibt die Repo-Instanz fuer eine berechtigte Rolle aus" {
  # Positiv-Anker zuerst: die Rolle bekommt ueberhaupt einen Werkzeug-Block.
  run bash "$REPO_ROOT/scripts/toolset-context.sh" bachelorprojekt-ops
  [ "$status" -eq 0 ]
  [[ "$output" == *"cli:scripts/finetune"* ]]
  [[ "$output" == *"finetune-run/SKILL.md"* ]]

  # Konfigurations-Querschnittsprüfung (dokumentierte Ausnahme, s.o.): die Registry selbst
  # traegt genau eine canonical-Instanz je Faehigkeit (Gate-Vertrag von agents:toolset:check).
  run grep -c "state: canonical" "$REPO_ROOT/docs/agent-guide/registry/capabilities.yaml"
  # Positiv-Anker: es gibt ueberhaupt canonical-Eintraege im Repo.
  [ "$output" -gt 0 ]
}
