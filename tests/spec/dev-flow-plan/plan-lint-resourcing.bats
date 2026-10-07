# Pruefmodus: Output-Verifikation (run + $status/$output) [T002448-M4]
# Resourcing-Spalten min_tier/ctx_tokens sind entfernt (T900948: Deko, nichts
# parst sie, der Orchestrator routet smart). plan-lint kennt keine R1/R2-Regeln
# mehr — das 5-Spalten-Manifest passiert, 7-Spalten-Legacy wird toleriert.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LINT="$REPO_ROOT/scripts/plan-lint.sh"
  FIX="$BATS_TEST_TMPDIR/change"
  mkdir -p "$FIX/tasks.d"
  cat > "$FIX/tasks.md" <<'MANIFEST'
---
title: resourcing-fixture
ticket_id: T999999
domains: [test]
status: draft
---
# resourcing-fixture — Implementation Plan

## File Structure

- `scripts/fixture-a.sh`
- `scripts/fixture-b.sh`

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | scripts/fixture-a.sh | |
| p2 | tasks.d/p2-tests.md | tests | scripts/fixture-b.sh | p1 |

## Task 1: verify

Run the gates: `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
References `fixture-a.sh` and `fixture-b.sh` for the cross-check.
MANIFEST
  cat > "$FIX/tasks.d/p1-impl.md" <<'IMPL'
# p1 impl
Do the thing in `fixture-a.sh`.
IMPL
  cat > "$FIX/tasks.d/p2-tests.md" <<'TESTS'
# p2 tests
Run `bats tests/spec/fixture.bats`, expected: FAIL on first run.
TESTS
  cat > "$FIX/intel.json" <<'INTEL'
{"meta": {"slug": "resourcing-fixture"}, "impact_files": [{"path": "scripts/fixture-a.sh"}, {"path": "scripts/fixture-b.sh"}], "symbols": ["x"]}
INTEL
}

@test "5-Spalten-Manifest ohne Resourcing-Spalten passiert" {
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -eq 0 ] || { echo "lint failed on 5-col manifest: $output"; false; }
  [[ "$output" == *"PLAN-LINT: PASS"* ]]
}

@test "Legacy 7-Spalten-Manifest wird toleriert (kein R1/R2-Fail)" {
  python3 - "$FIX/tasks.md" <<'PYEOF'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = s.replace("| id | file | role | target_files | depends_on |",
              "| id | file | role | target_files | depends_on | min_tier | ctx_tokens |")
s = s.replace("|----|------|------|--------------|------------|",
              "|----|------|------|--------------|------------|----------|------------|")
s = s.replace("| p1 | tasks.d/p1-impl.md | impl | scripts/fixture-a.sh | |",
              "| p1 | tasks.d/p1-impl.md | impl | scripts/fixture-a.sh | | qwen | lots |")
s = s.replace("| p2 | tasks.d/p2-tests.md | tests | scripts/fixture-b.sh | p1 |",
              "| p2 | tasks.d/p2-tests.md | tests | scripts/fixture-b.sh | p1 | cloud | 2000000 |")
open(p, 'w').write(s)
PYEOF
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -eq 0 ] || { echo "lint failed on legacy manifest: $output"; false; }
  [[ "$output" != *"R1:"* ]]
  [[ "$output" != *"R2:"* ]]
}

@test "D2-Regression: unbekannte depends_on-ID wird mit 5 Spalten erkannt" {
  sed -i 's/scripts\/fixture-b.sh | p1 |/scripts\/fixture-b.sh | pZZ |/' "$FIX/tasks.md"
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -ne 0 ]
  [[ "$output" == *"D2: unknown depends_on id: pZZ"* ]] || { echo "D2-Treffer fehlt: $output"; false; }
}
