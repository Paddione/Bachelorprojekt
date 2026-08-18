#!/usr/bin/env bats
# tests/spec/repo-structure/spec-suite-website-leak.bats
# SSOT: openspec/specs/repo-structure.md
#
# Fix T011792 (Nachfolge von T008635): `bats -r tests/spec/` hinterlaesst ein
# leeres Top-Level-Verzeichnis website/ (reproduziert 2026-08-18 im
# Full-Suite-Lauf, Watcher-Messung: feuert bei Minute ~13, aktive Slots
# 463-471; die sechs Kandidaten einzeln und parallel je sauber — der
# Verursacher haengt am Gesamtkontext). Dadurch wird website-moved.bats
# ordnungsabhaengig rot. Der Guard soll ein STRAY LEERES website/ selbst
# wegraeumen (rmdir im setup — entfernt nur leere Verzeichnisse), damit das
# Ergebnis von der Test-Reihenfolge unabhaengig wird; ein NICHT-LEERES
# website/ (echte Reorg-Regression) bleibt rot.
#
# Pruefmodus: command output verification (T002448-M4) — der Test FUEHRT den
# Guard selbst aus (bats-in-bats) und prueft Exit-Status + Verzeichniszustand.
#
# Reihenfolge T002356-M1: erst der Positiv-Anker (nicht-leeres website/ bleibt
# rot — belegt, dass der Gruen-Fall nicht durch Total-Cleanup erkauft ist),
# dann die Hauptaussage (leeres website/ -> Gruen + weggeraeumt).

GUARD="$BATS_TEST_DIRNAME/website-moved.bats"
BATS_BIN="$BATS_TEST_DIRNAME/../../unit/lib/bats-core/bin/bats"
REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"

teardown() {
  rm -rf "$REPO_ROOT/website"
}

@test "T011792: nicht-leeres website/ bleibt rot (Positiv-Anker)" {
  mkdir -p "$REPO_ROOT/website"
  echo x > "$REPO_ROOT/website/keep.txt"

  run "$BATS_BIN" "$GUARD"
  [ "$status" -eq 1 ] \
    || { echo "Anker: Guard war gruen trotz nicht-leerem website/ — Cleanup zu aggressiv"; return 1; }

  # Der Guard darf ein echtes website/ NICHT wegraeumen.
  [ -d "$REPO_ROOT/website" ] \
    || { echo "Anker: nicht-leeres website/ wurde entfernt — Datenverlust-Gefahr"; return 1; }
}

@test "T011792: leeres website/ wird weggeraeumt, Guard bleibt gruen" {
  mkdir -p "$REPO_ROOT/website"

  run "$BATS_BIN" "$GUARD"
  [ "$status" -eq 0 ] \
    || { echo "Guard rot trotz leerem website/ (Suite-Leak):"; echo "$output" | tail -20; return 1; }
  [ ! -d "$REPO_ROOT/website" ] \
    || { echo "website/ wurde nicht weggeraeumt"; return 1; }
}
