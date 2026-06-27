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

@test "G-CQ07: die übrigen drei Zyklen bleiben während dieses PRs unangetastet" {
  # Sanity-Check: wir dürfen mit diesem PR nur Zyklus #1 entfernen.
  # Die anderen drei Zyklen müssen weiterhin im Report auftauchen —
  # sonst wurden versehentlich Folge-PRs mit-erledigt.
  output=$(npx --yes madge --circular --extensions ts,tsx "$REPO_ROOT/website/src" 2>&1 || true)
  echo "$output" | grep -F "lib/website-db.ts > lib/tickets/transition.ts" >/dev/null
  echo "$output" | grep -F "lib/invoice-pdf.ts > lib/native-billing.ts" >/dev/null
}
