#!/usr/bin/env bats
# tests/spec/repo-structure/spec-suite-website-leak.bats
# SSOT: openspec/specs/repo-structure.md
#
# [T011792] Leak-Haertung (Nachfolge T008635): Die Spec-Suite hinterlaesst in
# bestimmten Lauf-Ordnungen ein leeres Top-Level-Website/ im Repo-Root
# (reproduziert 2026-08-18 im instrumentierten Full-Suite-Lauf; Verursacher
# nutzt keinen Shell-mkdir, Diagnose im Ticket). Der Guard website-moved.bats
# soll ein STRAY LEERES website/ selbst wegraeumen (rmdir im setup — entfernt
# nur leere Verzeichnisse), damit sein Ergebnis von der Test-Reihenfolge
# unabhaengig wird; ein NICHT-LEERES website/ (echte Reorg-Regression) bleibt rot.
#
# Pruefmodus: command output verification (T002448-M4) — der Test FUEHRT den
# Guard selbst aus (bats-in-bats) und prueft Exit-Status + Verzeichniszustand.
#
# Reihenfolge T002356-M1: erst der Positiv-Anker (nicht-leeres website/ bleibt
# rot — belegt, dass der Gruen-Fall nicht durch Total-Cleanup erkauft ist),
# dann die Hauptaussage (leeres website/ -> Gruen + weggeraeumt).
#
# [T011792/Review C1+I1] Cross-File-Race-Haertung: Der innere bats-Lauf laeuft
# gegen eine Fake-REPO_ROOT in einem mktemp -d-Baum, NICHT gegen das echte
# Repo. Der Test erzeugt website/ also nie im echten Checkout — parallel
# laufende Dateien (Guard website-moved.bats unter `bats -j N
# --no-parallelize-within-files`, CI-Konfiguration) koennen weder rot gefaerbt
# werden noch das Test-Setup zerstoeren. teardown fasst ausschliesslich den
# Temp-Baum an — ein fremdes nicht-leeres website/ im Checkout kann nie
# geloescht werden.

BATS_BIN="$BATS_TEST_DIRNAME/../../unit/lib/bats-core/bin/bats"
REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
GUARD_SRC="$BATS_TEST_DIRNAME/website-moved.bats"

# Baut den Fake-Baum und gibt dessen Root zurueck:
#   <fake>/tests/spec/repo-structure/website-moved.bats  (aktuelle Guard-Kopie)
#   <fake>/components/website/package.json               (Guard-Positiv-Anker)
# Der Guard berechnet REPO_ROOT als dirname(BATS_TEST_FILENAME)/../../.. —
# dank identischer Verzeichnis-Tiefe zeigt das auf den Fake-Root.
_setup_fake_root() {
  local fake
  fake="$(mktemp -d)"
  mkdir -p "$fake/tests/spec/repo-structure" "$fake/components/website"
  cp "$GUARD_SRC" "$fake/tests/spec/repo-structure/website-moved.bats"
  echo '{"name":"fake-package"}' > "$fake/components/website/package.json"
  printf '%s' "$fake"
}

FAKE_ROOT=""

setup() {
  FAKE_ROOT="$(_setup_fake_root)"
}

teardown() {
  [ -n "$FAKE_ROOT" ] && rm -rf "$FAKE_ROOT"
}

@test "T011792: nicht-leeres website/ bleibt rot (Positiv-Anker)" {
  mkdir -p "$FAKE_ROOT/website"
  echo x > "$FAKE_ROOT/website/keep.txt"

  run "$BATS_BIN" "$FAKE_ROOT/tests/spec/repo-structure/website-moved.bats"
  [ "$status" -eq 1 ] \
    || { echo "Anker: Guard war gruen trotz nicht-leerem website/ — Cleanup zu aggressiv"; return 1; }

  # Der Guard darf ein echtes website/ NICHT wegraeumen.
  [ -d "$FAKE_ROOT/website" ] \
    || { echo "Anker: nicht-leeres website/ wurde entfernt — Datenverlust-Gefahr"; return 1; }
}

@test "T011792: leeres website/ wird weggeraeumt, Guard bleibt gruen" {
  mkdir -p "$FAKE_ROOT/website"

  run "$BATS_BIN" "$FAKE_ROOT/tests/spec/repo-structure/website-moved.bats"
  [ "$status" -eq 0 ] \
    || { echo "Guard rot trotz leerem website/ (Suite-Leak):"; echo "$output" | tail -20; return 1; }
  [ ! -d "$FAKE_ROOT/website" ] \
    || { echo "website/ wurde nicht weggeraeumt"; return 1; }
}
