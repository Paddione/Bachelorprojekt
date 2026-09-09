#!/usr/bin/env bats
# pr-auto-title-scope-extraction.bats — Guard fuer T900095.
#
# PRUEFMODUS: gemischt. Die Semantik-Aussagen (Test 2-4) fuehren sed wirklich aus
# und pruefen Exit-Code und Ausgabe — nicht die Schreibweise im Workflow. Nur der
# letzte Teil von Test 4 greift auf den Quelltext zu, und zwar als Ausnahmefall
# der Test-Resultats-Konvention (T002448-M4): der Workflow laeuft ausschliesslich
# in GitHub Actions, ein Laufzeit-Test der YAML-Datei ist lokal nicht moeglich,
# und ein Nachbau der Schritte wuerde nur den Nachbau pruefen.
#
# HINTERGRUND: .github/workflows/pr-auto-title.yml leitete den Scope so ab:
#
#     SCOPE=$(printf '%s' "$SLUG" | sed -nP 's/^(?:g-)?([a-z]{1,4}\d{2,3})-.*/\1/p')
#
# GNU sed kennt kein -P — Perl-Regex ist grep -P. sed gibt daraufhin seine
# Hilfeseite aus und endet mit exit 1, der Job faellt rot aus.
#
# Der Zweig laeuft nur, wenn der grep-Guard eine Zeile darueber trifft, also der
# Slug mit einem OpenSpec-Kategoriecode beginnt (2-4 Buchstaben + 2-3 Ziffern).
# Deshalb blieb der Defekt lange unsichtbar: 'parallel-…' und 'skill-path-…'
# treffen ihn nicht, 'qwen38-primary-…' schon (PR #5507).

setup() {
  PROJECT_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WORKFLOW="${PROJECT_DIR}/.github/workflows/pr-auto-title.yml"
}

@test "T900095: Positiv-Anker - der Workflow existiert und leitet einen Scope ab" {
  # Ohne diesen Anker bestuenden die Aussagen unten trivial, sobald die Datei
  # fehlt oder umbenannt wird.
  [ -f "$WORKFLOW" ]
  grep -q 'SCOPE=' "$WORKFLOW"
}

@test "T900095: sed -nE liefert den Kategoriecode und endet mit 0" {
  run bash -c "printf '%s' 'qwen38-primary-T900094' | sed -nE 's/^(g-)?([a-z]{1,4}[0-9]{2,3})-.*/\\2/p'"
  [ "$status" -eq 0 ]
  [ "$output" = "qwen38" ]
}

@test "T900095: das g-Praefix wird verschluckt, nicht mitgeliefert" {
  run bash -c "printf '%s' 'g-fe03-structured-logger' | sed -nE 's/^(g-)?([a-z]{1,4}[0-9]{2,3})-.*/\\2/p'"
  [ "$status" -eq 0 ]
  [ "$output" = "fe03" ]
}

@test "T900095: kein Workflow ruft sed mit dem nicht existierenden -P auf" {
  # Semantik-Anker zuerst: sed -P ist real kaputt, nicht bloss unueblich.
  run bash -c "printf 'x' | sed -nP 's/x/y/p'"
  [ "$status" -ne 0 ]

  run grep -rnE 'sed[[:space:]]+-[a-zA-Z]*P' "${PROJECT_DIR}/.github/workflows/"
  [ "$status" -ne 0 ] || {
    echo "sed wird mit -P aufgerufen; GNU sed kennt das Flag nicht (T900095):" >&2
    echo "$output" >&2
    return 1
  }
}
