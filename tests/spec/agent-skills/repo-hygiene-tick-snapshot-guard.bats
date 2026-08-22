#!/usr/bin/env bats
# T013719-Mishap #1: Waehrend eines Factory-Ticks mutiert das Repo live — §0-Snapshots
# (git status/stash list) veralten lautlos. §0 muss den Tick-Vorcheck aus §1 verweisen,
# damit eine Aufraeumentscheidung nie auf einem Messstand aus einer Tick-Phase beruht.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  OPS_MD="$REPO_ROOT/.claude/skills/references/repo-hygiene-ops.md"
}

@test "repo-hygiene-ops.md §0 verweist auf den Factory-Tick-Vorcheck" {
  # Positiv-Anker: der §0-Abschnitt nennt den Tick-Vorcheck namentlich.
  run sed -n '/^## 0\. Arbeitsbaum/,/^## 1\./p' "$OPS_MD"
  [ "$status" -eq 0 ]
  grep -qF "Factory-Tick" <<<"$output"
  grep -qF "factory-tick.lock" <<<"$output"
}
