#!/usr/bin/env bats
# tests/spec/local-dev-mesh/devmesh-taskfile.bats
# T900116: task devmesh:tailnet:check ist eingebunden und startet tailnet-check.sh.
#
# Pruefmodus: Ausfuehrung von `task --list` und `task --dry`. Geprueft wird formatfrei
# (grep -F ohne Anker), nicht die Darstellung der Task-Liste (tests/CLAUDE.md, T002716).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  command -v task >/dev/null 2>&1 || skip "task not installed"
}

@test "T900116: task --list fuehrt devmesh:tailnet:check" {
  run bash -c "cd '$REPO_ROOT' && task --list 2>&1"
  [ "$status" -eq 0 ] || { echo "task --list exit=$status: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'devmesh:tailnet:check' \
    || { echo "devmesh:tailnet:check fehlt in task --list"; return 1; }
}

@test "T900116: devmesh:tailnet:check ruft scripts/devmesh/tailnet-check.sh ueber bash auf" {
  run bash -c "cd '$REPO_ROOT' && task --dry devmesh:tailnet:check 2>&1"
  [ "$status" -eq 0 ] || { echo "task --dry exit=$status: $output"; return 1; }
  printf '%s\n' "$output" | grep -qF 'bash scripts/devmesh/tailnet-check.sh' \
    || { echo "Task startet das Skript nicht: $output"; return 1; }
}
