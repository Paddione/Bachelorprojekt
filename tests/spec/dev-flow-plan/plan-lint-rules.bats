# Pruefmodus: Output-Verifikation (run + $status/$output) [T002448-M4]
# Tests fuer den --rules-Modus von scripts/plan-lint.sh —
# prüft Syntax, Exit-Code und dass jede Hard-Rule-ID genannt wird (T002716: formatfrei).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LINT="$REPO_ROOT/scripts/plan-lint.sh"
}

@test "--rules exitet 0 und liefert nicht-leeren Output" {
  run bash "$LINT" --rules
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "--rules nennt jede Hard-Rule-ID" {
  run bash "$LINT" --rules
  # Jede ID als grep -qF (keine Zeilenanker, kein Format-Regex — T002716)
  for id in F1 F2 STRUCT1 STRUCT2 STRUCT3 STRUCT-PARTIAL D1 D2 I1 P1 P2 B1a B1b T002453-C; do
    grep -qF "$id" <<<"$output"
  done
}

@test "--rules verlangt keine Plan-Datei und keine baseline.json" {
  run bash -c "cd '$BATS_TEST_TMPDIR' && '$LINT' --rules"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}
