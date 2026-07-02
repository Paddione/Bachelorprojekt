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
  # T001514: alle drei übrigen Zyklen sind bereits auf main verschwunden
  # (madge meldet dort "No circular dependency found!"), unabhängig von
  # diesem PR — der Sanity-Check war schon vor T001490 stale/RED.
  skip "T001514: residual cycles already gone on main, guard is stale"
}
