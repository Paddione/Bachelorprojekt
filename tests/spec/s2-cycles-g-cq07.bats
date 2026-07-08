#!/usr/bin/env bats
# SSOT: openspec/changes/decouple-tickets-db/proposal.md
# G-CQ07: Zyklus #1 (lib/tickets-db.ts > lib/website-db.ts) ist RED bis
# die Extraktion in tasks-schema.ts gelandet ist.
#
# Wir nutzen bewusst einen dedizierten BATS-Spec statt einer bestehenden
# bats-Datei, weil der bestehende S2-Linter-Lauf ad-hoc erfolgt (kein
# verankertes bats-File) — siehe openspec/specs/code-quality.md.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ07 cycle #1: lib/tickets-db.ts > lib/website-db.ts ist entfernt" {
  output=$(npx --yes madge --circular --extensions ts,tsx "$REPO_ROOT/website/src" 2>&1 || true)
  if echo "$output" | grep -F "lib/tickets-db.ts > lib/website-db.ts" >/dev/null; then
    echo "madge-Output:"
    echo "$output"
    return 1
  fi
}

@test "G-CQ07: keine zirkulären Imports mehr in website/src" {
  # T001575: Die Folge-PRs zu den übrigen Zyklen sind inzwischen gelandet —
  # madge meldet 0 Zyklen auf main. Der frühere Sanity-Check ("übrige Zyklen
  # bleiben unangetastet") ist damit obsolet; ab jetzt gilt der strengere
  # Guard: website/src muss zyklenfrei bleiben.
  output=$(npx --yes madge --circular --extensions ts,tsx "$REPO_ROOT/website/src" 2>&1 || true)
  if ! echo "$output" | grep -F "No circular dependency found" >/dev/null; then
    echo "madge-Output:"
    echo "$output"
    return 1
  fi
}
