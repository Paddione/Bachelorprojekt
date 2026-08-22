#!/usr/bin/env bats
# tests/spec/e2e-test-infrastructure/no-group-modifiers.bats — Gruppen-Modifier-Guard [T013329]
#
# Prüfmodus: Querschnitts-Source-Konvention (grep ist hier das angemessene Mittel,
# siehe tests/CLAUDE.md "Test-Resultats-Konvention").
#
# Hintergrund [T013329 F2]: Ein Playwright-Modifier direkt im describe-Body
# (`^  test.skip(true, …)` / `^  test.fixme(true, …)` — genau zwei Leerzeichen)
# ist ein GRUPPEN-Modifier und schaltet die gesamte Datei still (time=0, leere
# Skip-Message). Gemeint war jeweils die Markierung einzelner Teiltests; die
# gehören an deren eigenes test().

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SPECS_DIR="${REPO_ROOT}/tests/e2e/specs"
}

@test "e2e-infra: keine Spec traegt einen Gruppen-Modifier im describe-Body" {
  # Positiv-Anker 1 [T002356-M1]: der Spec-Bestand existiert ueberhaupt — sonst
  # waere die Negativ-Aussage gegen eine leere Menge trivial wahr.
  run bash -c "find '${SPECS_DIR}' -maxdepth 1 -name '*.spec.ts' -type f | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Positiv-Anker 2: der Detektor erkennt das Muster nachweislich — eine
  # synthetische Gruppen-Modifier-Zeile muss genau 1 Treffer liefern.
  run bash -c "printf '  test.skip(true, %s\\n' \"'x'\" | grep -cE '^  test\\.(skip|fixme)\\(true'"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]

  # Die eigentliche Zusicherung: kein Bestandstreffer.
  run bash -c "grep -rnE '^  test\\.(skip|fixme)\\(true' '${SPECS_DIR}'/*.spec.ts"
  if [ "$status" -eq 0 ]; then
    echo "Gruppen-Modifier im describe-Body gefunden (schaltet die ganze Datei still):" >&2
    printf '%s\n' "$output" >&2
    false
  fi
}
