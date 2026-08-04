#!/usr/bin/env bats
#
# T002639 — jeder Pfad in der freshness:check-Liste muss im Repo existieren.
#
# Pruefmodus: CI-Konfiguration (Ausnahme der Test-Resultats-Konvention
# [T002448-M4], analog zu den uebrigen Guards in tests/spec/ci-cd/). Die Liste ist
# eine hartkodierte Pfadaufzaehlung in einem Taskfile-cmd-Block; ihr Bruch
# manifestiert sich ausschliesslich dort.
#
# Warum ueberhaupt: die Liste vergleicht generierte Artefakte gegen den Commit.
# Zeigt ein Eintrag ins Leere — weil die Datei umgezogen ist —, meldet der Guard
# nicht "Pfad unbekannt", sondern "regenerated but not staged": eine Meldung ueber
# eine Datei, die es nicht mehr gibt, in der CI von PRs, die sie nie angefasst
# haben. Genau so lief es beim SDLC-Split (goals-data.generated.json nach
# website/src/lib/sdlc/). Dieser Test faengt die Klasse, nicht den Einzelfall.
#
# Bewusst NUR Existenz, kein Inhalt: was die Datei enthaelt, prueft freshness:check
# selbst — hier geht es um den davorliegenden Fehler, dass der Vergleich am
# falschen Ort stattfindet.
#
# Bewusst NUR die Taskfile-Liste, obwohl .githooks/pre-commit eine parallele
# _FRESHNESS_FILES-Liste fuehrt (per T001388-Superset-Guard an diese gekoppelt):
# dort steht seit #2701 docs/code-quality/loc-budget.json, dessen Gate samt Datei
# entfernt wurde. Ein Test in tests/spec/pre-commit-freshness.bats verlangt den
# Eintrag ausdruecklich weiter. Diesen Test aufzuloesen ist eine eigene
# Entscheidung mit eigener Pruefung — nicht ein Nebeneffekt des SDLC-Splits.
# Wer sie trifft: Eintrag im Hook streichen, den T001388-Einzeltest entfernen,
# dann hier auf beide Listen ausweiten.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
}

# Zieht die FILES="..."-Aufzaehlung aus dem freshness:check-cmd-Block. yq liefert
# den cmd-Text (statt die Zeile per Einrueckung aus dem rohen YAML zu raten, was
# bei jeder Umformatierung des Taskfiles still leer laufen wuerde).
freshness_files() {
  yq -r '.tasks."freshness:check".cmds[] | select(type == "!!str")' Taskfile.yml \
    | awk '/FILES="/{f=1; next} f && /^[[:space:]]*"[[:space:]]*$/{f=0} f {gsub(/[[:space:]]/,""); if ($0 != "") print}'
}

@test "freshness:check: jeder gelistete Pfad existiert im Repo (T002639)" {
  run freshness_files
  [ "$status" -eq 0 ] || { echo "FAIL: FILES-Liste nicht extrahierbar — $output"; return 1; }

  local count
  count="$(echo "$output" | grep -c .)"

  # Positiv-Anker [T002356-M1]: ohne ihn bestuende der Test vakuos, sobald sich
  # das Taskfile-Format aendert und die Extraktion nichts mehr findet — "0 tote
  # Pfade in 0 Eintraegen" waere trivial gruen.
  [ "$count" -ge 10 ] || {
    echo "FAIL: nur ${count} Eintraege extrahiert (erwartet >= 10)."
    echo "      Die FILES-Liste in freshness:check ist umformatiert worden und"
    echo "      freshness_files() greift daneben — der Guard waere ab hier blind."
    echo "$output"
    return 1
  }

  local dead=""
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    [ -e "$p" ] || dead="${dead}  - ${p}"$'\n'
  done <<< "$output"

  [ -z "$dead" ] || {
    echo "FAIL: freshness:check listet Pfade, die es nicht gibt:"
    echo "$dead"
    echo "      Umgezogen? Dann die Liste in Taskfile.yml nachziehen. Sonst meldet"
    echo "      der Guard 'regenerated but not staged' fuer eine verschwundene"
    echo "      Datei — in der CI fremder PRs."
    return 1
  }
}
