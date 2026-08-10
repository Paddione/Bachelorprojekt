#!/usr/bin/env bats
#
# Spec: openspec/specs/mishap-tracking.md — "Die Go-Tests des ticket-mcp laufen
# in CI" [T003120]
#
# Pruefmodus: GEMISCHT, bewusst und begruendet.
#
#   - Der erste Test ist OUTPUT-VERIFIKATION: er fuehrt das Testziel aus und
#     misst dessen Exit-Code.
#   - Der zweite Test ist eine Querschnitts-Konventionspruefung, deren Ergebnis
#     sich ausschliesslich in der CI-Konfiguration manifestiert — der in
#     CLAUDE.md ausdruecklich zugelassene grep-Fall. Er verwendet formatfreie
#     Proben (`grep -qF`, keine Zeilenanker), damit er nicht die Darstellung
#     einer Werkzeugversion festschreibt (T002716).
#
# Warum es diesen Test gibt: scripts/ticket-mcp/go/internal/tools/mishap_test.go
# existiert seit langem, wurde aber von keinem Runner aufgerufen — weder von
# ci.yml, noch von einem Taskfile-Ziel, noch von tests/runner.sh. Ein Test, den
# kein Runner kennt, ist kein Gate (dieselbe Lage wie T002657).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "T003120: die ticket-mcp-Go-Testsuite laeuft und ist gruen" {
  command -v go >/dev/null 2>&1 || skip "go toolchain not installed"
  run make -C "${REPO_ROOT}/scripts/ticket-mcp/go" test
  [ "$status" -eq 0 ]
}

@test "T003120: das Go-Testziel ist aus der CI-Konfiguration erreichbar" {
  local taskfile="${REPO_ROOT}/Taskfile.yml"
  local ci="${REPO_ROOT}/.github/workflows/ci.yml"
  [ -f "$taskfile" ]
  [ -f "$ci" ]

  # Positiv-Anker: das Taskfile kennt ueberhaupt ein ticket-mcp-Ziel. Faellt
  # dieser Anker, ist die nachfolgende Aussage nicht vakuos erfuellbar.
  grep -qF "ticket-mcp:build" "$taskfile"

  # Ein Taskfile-Ziel ruft die Go-Testsuite auf ...
  grep -qF "scripts/ticket-mcp/go test" "$taskfile"
  # ... und CI ruft dieses Ziel auf.
  grep -qF "ticket-mcp:test" "$ci"
}
