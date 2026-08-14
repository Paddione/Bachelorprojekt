#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# Prüfmodus: command output verification (T002448-M4) — führt
# `bash scripts/vda.sh cfr` aus und prüft die Semantik der Ausgabe
# (Exit-Code, Vorhandensein beider Messungen), nicht den Wortlaut (T002716).

setup() {
  bats_require_minimum_version 1.5.0
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "cfr liefert breite Messung und 4-Wochen-Trend" {
  cd "$REPO_ROOT"
  run bash scripts/vda.sh cfr
  [ "$status" -eq 0 ]
  # Positiv-Anker: bestehende breite Messung bleibt vorhanden
  [[ "$output" == *"CFR breit"* ]]
  # Neue Messung: 4-Wochen-Trend
  [[ "$output" == *"CFR 4w"* ]]
  # Semantik: beide Messzeilen tragen einen Prozentwert (kein Format-Anker)
  local pct
  pct="$(grep -c '%' <<<"$output")"
  [ "$pct" -ge 2 ]
}
