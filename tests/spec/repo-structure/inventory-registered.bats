#!/usr/bin/env bats
# tests/spec/repo-structure/inventory-registered.bats
# SSOT: openspec/changes/repo-structure-reorg (T006999, Partial p5-tests)
# Pruefmodus: Output-Verifikation (T002448-M4) — der Test liest das generierte
# JSON-Artefakt (components/website/src/data/test-inventory.json), keine Source-Greps.
# Positiv-Anker zuerst (T002356-M1): die vier Guard-Dateien aus p1–p4 existieren im
# Dateisystem; erst dann die Registrierungs-Aussage gegen das Inventar.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  INVENTORY="$REPO_ROOT/components/website/src/data/test-inventory.json"
}

@test "repo-structure: vier Drift-Guards aus p1–p4 existieren" {
  # Positiv-Anker (T002356-M1): ohne die Guards waere die Registrierungs-Aussage vakuos.
  for g in root-agent-md packages-assets components-group website-moved; do
    [ -f "$REPO_ROOT/tests/spec/repo-structure/$g.bats" ]       || { echo "FEHLT: tests/spec/repo-structure/$g.bats"; return 1; }
  done
}

@test "repo-structure: Guards sind im Test-Inventar registriert" {
  # Lauter Fehler bei fehlender Inventar-Datei — kein skip, kein vakuum-gruen.
  [ -f "$INVENTORY" ] || { echo "FEHLT: $INVENTORY — Inventory nicht regeneriert"; return 1; }
  for g in root-agent-md packages-assets components-group website-moved; do
    grep -qF "tests/spec/repo-structure/$g.bats" "$INVENTORY"       || { echo "FEHLT im Inventar: tests/spec/repo-structure/$g.bats"; return 1; }
  done
}

@test "repo-structure: Inventar ohne Stale-Pfade auf alte Top-Level-Ordner" {
  [ -f "$INVENTORY" ] || { echo "FEHLT: $INVENTORY"; return 1; }
  # 'file'-Werte duerfen nicht auf die alten Top-Level-Ordner zeigen (website/,
  # brett/, studio-server/, mentolder-web/, mediaviewer-widget/, VideoVault/,
  # design-system/, art-library/). Das fuehrende Anfuehrungszeichen stellt sicher,
  # dass components/website/ NICHT matcht (dort folgt auf das Anfuehrungszeichen
  # 'components').
  for old in 'website/' 'brett/' 'studio-server/' 'mentolder-web/' 'mediaviewer-widget/' 'VideoVault/' 'design-system/' 'art-library/'; do
    if grep -qF "\"${old}" "$INVENTORY"; then
      echo "STALE: Inventar-Eintrag zeigt auf ${old}"; return 1
    fi
  done
}
