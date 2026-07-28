#!/usr/bin/env bats
# tests/spec/ci-cd/test-inventory-coverage.bats — Vollstaendigkeit des Test-Inventars [T002445]
#
# build-test-inventory.sh erzeugt einen Eintrag nur ueber zwei Wege: ID-Muster im Dateinamen
# (FA-SF-04.bats) oder strukturierte Grossbuchstaben-ID im @test-Titel. Schlagen beide fehl,
# folgt ein stiller `continue`. Seit T002416 tragen neue Testdateien ihren Anforderungsbezug
# aber ueber den VERZEICHNISNAMEN (tests/spec/<ssot-spec-slug>/), nicht mehr im Dateinamen —
# diese Bezugsart kennt das Skript nicht.
#
# GEMESSEN 2026-07-28 auf main: 144 von 149 tests/spec-Dateien erzeugen keinen Eintrag.
# Der CI-Gate bleibt gruen, weil `freshness:check` regeneriert-vs-committed vergleicht und
# ein Skript, das deterministisch nichts findet, diesen Vergleich perfekt besteht.
#
# Diese Datei prueft das ERGEBNIS (Eintrag im Inventar), nicht die Implementierung
# (maxdepth-Flag im Skripttext). Genau diese Verwechslung machte den bestehenden Test
# "spec-dir: Test-Inventar erfasst Unterverzeichnisse" faelschlich gruen, obwohl seine
# Titelaussage falsch war.
#
# KEIN Test fuer den Fail-closed-Guard: sobald der Slug-Fallback total ist, kann per
# Konstruktion keine Datei mehr unerfasst bleiben — ein Guard-Test waere vakuos. Der Guard
# ist reiner Regressionsschutz fuer kuenftige Aenderungen an der Erfassungslogik.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  BUILDER="${REPO_ROOT}/scripts/build-test-inventory.sh"
  COMMITTED="${REPO_ROOT}/website/src/data/test-inventory.json"
  SANDBOX="${BATS_TEST_TMPDIR}/inventory.json"
}

# Erzeugt das Inventar in die Sandbox, damit kein Test das committete JSON mutiert.
# Schlaegt fehl (statt still ins echte JSON zu schreiben), wenn das Skript die Variable
# noch nicht kennt — die Sandbox-Faehigkeit ist Vorbedingung aller Ergebnis-Assertions.
build_sandbox_inventory() {
  TEST_INVENTORY_OUT="$SANDBOX" bash "$BUILDER" >/dev/null 2>&1
  [ -s "$SANDBOX" ]
}

@test "inventory: Ausgabepfad ist ueber TEST_INVENTORY_OUT umlenkbar" {
  # Positiv-Anker: der Builder existiert und laeuft ueberhaupt durch.
  run bash -c "TEST_INVENTORY_OUT='$SANDBOX' bash '$BUILDER'"
  [ "$status" -eq 0 ]
  # Die Umlenkung muss wirken — sonst mutiert jeder folgende Test das echte Inventar.
  [ -s "$SANDBOX" ]
  run jq 'length' "$SANDBOX"
  [ "$output" -gt 0 ]
}

@test "inventory: Datei unter der T002416-Verzeichniskonvention erzeugt einen Eintrag" {
  build_sandbox_inventory
  # Positiv-Anker: die Beispieldatei existiert wirklich — sonst waere die Suche trivial leer.
  [ -f "${REPO_ROOT}/tests/spec/ci-cd/spec-dir-convention.bats" ]
  run jq --arg p 'tests/spec/ci-cd/spec-dir-convention.bats' \
    '[.[] | select(.file == $p)] | length' "$SANDBOX"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "inventory: category einer Unterverzeichnis-Datei ist der SSOT-Spec-Slug" {
  build_sandbox_inventory
  [ -f "${REPO_ROOT}/tests/spec/openspec-workflow/half-archive-guard.bats" ]
  # Der Anforderungsbezug steckt im Verzeichnis, nicht im Dateinamen: das Verzeichnis
  # openspec-workflow entspricht openspec/specs/openspec-workflow.md.
  run jq -r --arg p 'tests/spec/openspec-workflow/half-archive-guard.bats' \
    '[.[] | select(.file == $p)] | first | .category' "$SANDBOX"
  [ "$status" -eq 0 ]
  [ "$output" = "openspec-workflow" ]
}

@test "inventory: Bestandsdatei auf oberster Ebene ohne ID erzeugt einen Eintrag" {
  build_sandbox_inventory
  [ -f "${REPO_ROOT}/tests/spec/ci-cd.bats" ]
  run jq --arg p 'tests/spec/ci-cd.bats' \
    '[.[] | select(.file == $p)] | length' "$SANDBOX"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "inventory: jede tests/spec-Datei ist erfasst" {
  build_sandbox_inventory
  # Positiv-Anker: es gibt ueberhaupt Dateien zu pruefen — ohne ihn waere eine leere
  # Kandidatenliste ein stiller Durchlaeufer.
  run bash -c "find '${REPO_ROOT}/tests/spec' -name '*.bats' | wc -l"
  [ "$output" -ge 100 ]

  local uncovered=0 f rel
  while IFS= read -r f; do
    rel="${f#${REPO_ROOT}/}"
    if [ "$(jq --arg p "$rel" '[.[] | select(.file == $p)] | length' "$SANDBOX")" -eq 0 ]; then
      echo "nicht erfasst: $rel" >&2
      uncovered=$((uncovered + 1))
    fi
  done < <(find "${REPO_ROOT}/tests/spec" -name '*.bats' | sort)
  [ "$uncovered" -eq 0 ]
}

@test "inventory: Dateien mit strukturierten IDs behalten ihre Eintraege" {
  build_sandbox_inventory
  # Waechter gegen ein Ueberschiessen des Fixes: der Slug-Fallback darf NUR greifen, wo
  # keine ID gefunden wurde. software-factory.bats liefert 54 FA-SF-Eintraege — die duerfen
  # weder verschwinden noch durch einen einzelnen Slug-Eintrag ersetzt werden.
  run jq '[.[] | select(.file == "tests/spec/software-factory.bats")] | length' "$SANDBOX"
  [ "$status" -eq 0 ]
  [ "$output" -eq 54 ]
  run jq -r '[.[] | select(.file == "tests/spec/software-factory.bats") | .id] | sort | first' "$SANDBOX"
  [ "$output" = "FA-SF-01" ]
}

@test "inventory: Schema bleibt unveraendert (id, file, category, kind; kein tier)" {
  build_sandbox_inventory
  # Der Konsument website/src/pages/api/admin/tests/traceability.ts liest genau diese Felder.
  # tier ist ein Zwischenfeld des Builders und wird vor dem Schreiben entfernt.
  run jq '[.[] | select((.id|type) != "string" or (.file|type) != "string"
                        or (.category|type) != "string" or (.kind|type) != "string")] | length' "$SANDBOX"
  [ "$status" -eq 0 ]
  [ "$output" -eq 0 ]
  run jq '[.[] | select(has("tier"))] | length' "$SANDBOX"
  [ "$output" -eq 0 ]
}

@test "inventory: committetes JSON ist mit dem Builder-Ergebnis deckungsgleich" {
  build_sandbox_inventory
  # Schliesst die Luecke, die den Bug selbstverdeckend machte: der Fix muss das committete
  # Inventar mitregenerieren, nicht nur den Builder aendern.
  run bash -c "diff <(jq -S . '$COMMITTED') <(jq -S . '$SANDBOX')"
  [ "$status" -eq 0 ]
}
