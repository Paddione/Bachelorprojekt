# Pruefmodus: Output-Verifikation (run + $status/$output) [T002448-M4]
# Tests fuer die Resourcing-Regeln R1 (min_tier) und R2 (ctx_tokens) von
# scripts/plan-lint.sh — jede `## Partials`-Manifest-Zeile ist die
# Dispatch-Vorgabe des Orchestrators ("cheapest that does the trick").

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LINT="$REPO_ROOT/scripts/plan-lint.sh"
  FIX="$BATS_TEST_TMPDIR/change"
  mkdir -p "$FIX/tasks.d"
  cat > "$FIX/tasks.md" <<'EOF'
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

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-impl.md | impl | scripts/fixture-a.sh | | 27b-local | 32000 |
| p2 | tasks.d/p2-tests.md | tests | scripts/fixture-b.sh | p1 | 4b-local | 32000 |

## Task 1: verify

Run the gates: `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
References `fixture-a.sh` and `fixture-b.sh` for the cross-check.
EOF
  cat > "$FIX/tasks.d/p1-impl.md" <<'EOF'
# p1 impl
Do the thing in `fixture-a.sh`.
EOF
  cat > "$FIX/tasks.d/p2-tests.md" <<'EOF'
# p2 tests
Run `bats tests/spec/fixture.bats`, expected: FAIL on first run.
EOF
  cat > "$FIX/intel.json" <<'EOF'
{"meta": {"slug": "resourcing-fixture"}, "impact_files": [{"path": "scripts/fixture-a.sh"}, {"path": "scripts/fixture-b.sh"}], "symbols": ["x"]}
EOF
}

@test "R1/R2: gueltiges 7-Spalten-Manifest passiert" {
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -eq 0 ] || { echo "lint failed on valid manifest: $output"; false; }
  [[ "$output" == *"PLAN-LINT: PASS"* ]]
}

@test "R1: ungueltiger min_tier faellt hart" {
  sed -i 's/27b-local/qwen/' "$FIX/tasks.md"
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -ne 0 ]
  [[ "$output" == *"R1:"* ]] || { echo "R1 nicht genannt: $output"; false; }
  [[ "$output" == *"tasks.d/p1-impl.md"* ]]
}

@test "R1/R2: fehlende Resourcing-Spalten fallen hart" {
  sed -i 's/ | 27b-local | 32000 |/ |/; s/ | 4b-local | 32000 |/ |/' "$FIX/tasks.md"
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -ne 0 ]
  [[ "$output" == *"R1:"* ]]
  [[ "$output" == *"R2:"* ]]
}

@test "R2: nicht-numerisches ctx_tokens faellt hart" {
  sed -i '0,/| 32000 |/s//| lots |/' "$FIX/tasks.md"
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -ne 0 ]
  [[ "$output" == *"R2:"* ]] || { echo "R2 nicht genannt: $output"; false; }
}

@test "R2: lokale Stufe ueber 131072 faellt hart mit Cloud-Hinweis" {
  sed -i '0,/| 32000 |/s//| 200000 |/' "$FIX/tasks.md"
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -ne 0 ]
  [[ "$output" == *"R2:"* ]]
  [[ "$output" == *"cloud"* ]] || { echo "Cloud-Hinweis fehlt: $output"; false; }
}

@test "R2: cloud mit grossem Kontext passiert" {
  sed -i '0,/27b-local | 32000/s//cloud | 500000/' "$FIX/tasks.md"
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -eq 0 ] || { echo "lint failed on cloud manifest: $output"; false; }
}

@test "R2: ctx_tokens ueber 1000000 faellt hart" {
  sed -i '0,/27b-local | 32000/s//cloud | 2000000/' "$FIX/tasks.md"
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -ne 0 ]
  [[ "$output" == *"R2:"* ]]
}

@test "D2-Regression: unbekannte depends_on-ID wird trotz 7 Spalten erkannt" {
  sed -i 's/scripts\/fixture-b.sh | p1 |/scripts\/fixture-b.sh | pZZ |/' "$FIX/tasks.md"
  run bash "$LINT" "$FIX/tasks.md"
  [ "$status" -ne 0 ]
  [[ "$output" == *"D2: unknown depends_on id: pZZ"* ]] || { echo "D2-Treffer fehlt: $output"; false; }
}
