#!/usr/bin/env bats
# tests/spec/gen-goals-data.bats
# Covers: Exit-cell parsing in scripts/gen-goals-data.mjs (T900803).
# "Exit N ✓" Prio-C cells must emit current=N (not null), otherwise
# health:goals:drift reports perpetual drift for Exit-measured goals.

SCRIPT="scripts/gen-goals-data.mjs"

setup() {
  REPO_ROOT="$(git rev-parse --show-toplevel)"
  cd "$REPO_ROOT"
  TMP="$(mktemp -d)"
  GOALS="$TMP/goals.md"
  OUT="$TMP/goals-data.json"
}

teardown() {
  rm -rf "$TMP"
}

_write_exit_fixture() {
  cat > "$GOALS" <<'MD'
# Health Goals

**Zuletzt gemessen:** `2026-09-28`

# Priorität C

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-SEC02** | git-crypt Guard | Exit 0 ✓ | Exit 0 | `true` |
| **G-RH01** | Gate-Violations | 26 ✓ | ≤ 30 | `echo 26` |

# Mess-Werkzeug
MD
}

@test "Exit cells emit numeric current with Exit unit" {
  _write_exit_fixture
  run env GOALS_MD_PATH="$GOALS" GOALS_JSON_OUT="$OUT" node "$SCRIPT"
  [ "$status" -eq 0 ]
  [ -f "$OUT" ]
  current="$(node -e 'const d=require(process.argv[1]); const g=d.find(x=>x.id==="G-SEC02"); console.log(g.current)' "$OUT")"
  [ "$current" = "0" ]
  unit="$(node -e 'const d=require(process.argv[1]); const g=d.find(x=>x.id==="G-SEC02"); console.log(g.unit)' "$OUT")"
  [ "$unit" = "Exit" ]
  target="$(node -e 'const d=require(process.argv[1]); const g=d.find(x=>x.id==="G-SEC02"); console.log(g.target)' "$OUT")"
  [ "$target" = "0" ]
}

@test "plain numeric cells still parse" {
  _write_exit_fixture
  run env GOALS_MD_PATH="$GOALS" GOALS_JSON_OUT="$OUT" node "$SCRIPT"
  [ "$status" -eq 0 ]
  current="$(node -e 'const d=require(process.argv[1]); const g=d.find(x=>x.id==="G-RH01"); console.log(g.current)' "$OUT")"
  [ "$current" = "26" ]
}
