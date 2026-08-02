#!/usr/bin/env bats
# tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats
# T002515 — plan-intel.sh dedupliziert risks[] nicht: jeder Lauf haengt denselben
# generierten Eintrag erneut an, der Arbeitsbaum erscheint danach "dirty".
#
# Pruefmodus: OUTPUT-VERIFIKATION (Konvention T002448-M4). Jeder Test FUEHRT
# scripts/plan-intel.sh AUS und prueft das erzeugte intel.json — kein grep auf den
# Quelltext des Generators.
#
# Die Suite arbeitet gegen einen EIGENEN Sandbox-Slug, nicht gegen einen produktiven
# Change: der Generator liest seinen Merge-Bestand aus $CHANGE_DIR/intel.json und muss
# deshalb dort schreiben duerfen. teardown() entfernt das Verzeichnis wieder — genau das
# Aufraeumen, dessen Fehlen dieses Ticket ueberhaupt ausgeloest hat.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SLUG="_t002515-risks-dedupe-fixture"
  CHANGE_DIR="$REPO/openspec/changes/$SLUG"
  rm -rf "$CHANGE_DIR"
  mkdir -p "$CHANGE_DIR"
  INTEL="$CHANGE_DIR/intel.json"
}

teardown() {
  [ -n "${CHANGE_DIR:-}" ] && rm -rf "$CHANGE_DIR"
}

# Ein Generatorlauf gegen den Sandbox-Slug. Ohne --out, damit Lese- und Schreibpfad
# identisch sind (der --out-Lesepfad ist ein eigener Defekt, T002540).
_gen() {
  bash "$REPO/scripts/plan-intel.sh" "$SLUG" --target-files scripts/plan-intel.sh
}

@test "PIRD: wiederholte Laeufe haeufen keine identischen risks[]-Eintraege an" {
  run _gen
  [ "$status" -eq 0 ] || { echo "Generator failed: $output"; false; }

  # Positiv-Anker (Pflicht bei Negativaussagen, T002356-M1): der Generator MUSS
  # ueberhaupt einen Risiko-Eintrag erzeugen. Ohne diesen Anker waere die
  # Gleichheitsaussage unten bei leerem risks[] trivial erfuellt.
  local first_count
  first_count="$(jq '.risks | length' "$INTEL")"
  [ "$first_count" -ge 1 ] || { echo "Generator erzeugte kein risks[]: $first_count"; false; }

  run _gen
  [ "$status" -eq 0 ]
  run _gen
  [ "$status" -eq 0 ]

  local total unique_total
  total="$(jq '.risks | length' "$INTEL")"
  unique_total="$(jq '[.risks[] | {note, severity}] | unique | length' "$INTEL")"
  [ "$total" -eq "$unique_total" ] || {
    echo "risks[] nach drei Laeufen: $total Eintraege, aber nur $unique_total verschiedene"
    jq -c '.risks' "$INTEL"
    false
  }
}

@test "PIRD: intel.json ist ab dem zweiten Lauf byte-identisch" {
  run _gen
  [ "$status" -eq 0 ] || { echo "Generator failed: $output"; false; }
  run _gen
  [ "$status" -eq 0 ]
  cp "$INTEL" "$BATS_TEST_TMPDIR/second.json"
  run _gen
  [ "$status" -eq 0 ]

  # Positiv-Anker: die Datei existiert und traegt Inhalt — sonst waere "identisch"
  # zwischen zwei leeren Dateien trivial wahr.
  [ -s "$INTEL" ] || { echo "intel.json ist leer"; false; }
  jq -e '.meta.slug' "$INTEL" >/dev/null || { echo "intel.json ohne meta.slug"; false; }

  diff "$BATS_TEST_TMPDIR/second.json" "$INTEL" || {
    echo "Lauf 2 und Lauf 3 unterscheiden sich — der Generator ist nicht idempotent"
    false
  }
}

@test "PIRD: manuell ergaenztes Risiko ueberlebt den erneuten Lauf" {
  run _gen
  [ "$status" -eq 0 ] || { echo "Generator failed: $output"; false; }

  jq '.risks += [{"note":"manuell ergaenzt: externe Abhaengigkeit ungeprueft","severity":"info"}]' \
    "$INTEL" > "$BATS_TEST_TMPDIR/patched.json"
  mv "$BATS_TEST_TMPDIR/patched.json" "$INTEL"

  run _gen
  [ "$status" -eq 0 ]

  local kept
  kept="$(jq '[.risks[] | select(.note | startswith("manuell ergaenzt"))] | length' "$INTEL")"
  [ "$kept" -eq 1 ] || {
    echo "manuell ergaenztes Risiko nach dem Lauf $kept mal vorhanden (erwartet: 1)"
    jq -c '.risks' "$INTEL"
    false
  }
}

@test "PIRD: api_contracts bleiben von der Dedupe-Aenderung unberuehrt" {
  run _gen
  [ "$status" -eq 0 ] || { echo "Generator failed: $output"; false; }

  jq '.api_contracts = [{"path":"/api/dummy","method":"GET"}]' "$INTEL" > "$BATS_TEST_TMPDIR/patched.json"
  mv "$BATS_TEST_TMPDIR/patched.json" "$INTEL"

  run _gen
  [ "$status" -eq 0 ]

  local kept
  kept="$(jq '[.api_contracts[] | select(.path == "/api/dummy")] | length' "$INTEL")"
  [ "$kept" -eq 1 ] || {
    echo "api_contracts-Eintrag nach dem Lauf $kept mal vorhanden (erwartet: 1)"
    jq -c '.api_contracts' "$INTEL"
    false
  }
}
