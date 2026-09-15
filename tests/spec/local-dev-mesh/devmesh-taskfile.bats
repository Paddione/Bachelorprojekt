#!/usr/bin/env bats
# tests/spec/local-dev-mesh/devmesh-taskfile.bats
# T900116: task devmesh:tailnet:check ist eingebunden und startet tailnet-check.sh.
# T900117: devmesh:install reicht HOST/DRY_RUN durch; k3s-Felder im Inventar (yq, die Datei ist das Resultat).
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

@test "T900117: task devmesh:install reicht HOST und DRY_RUN an k3s-install.sh durch" {
  run task --dir "$REPO_ROOT" devmesh:install HOST=gpu-cluster DRY_RUN=1
  [ "$status" -eq 0 ]
  line="$(printf '%s\n' "$output" | grep '^command: ')"
  printf '%s\n' "$line" | grep -qF -e '--node-ip 10.10.10.2'
  printf '%s\n' "$line" | grep -qF 'INSTALL_K3S_VERSION=v'
  init="$(printf '%s\n' "$line" | grep -cF -e '--cluster-init' || true)"
  [ "$init" -eq 0 ]
}

@test "T900117: Inventar mit gpu-metal server-init, zwei server-join, storage=true nur auf gpu-cluster2, Version gepinnt" {
  INV="${REPO_ROOT}/devmesh/inventory.yaml"
  [ "$(yq -r '[.peers[] | select(.k3s_role == "server-init")] | map(.name) | join(",")' "$INV")" = gpu-metal ]
  [ "$(yq -r '[.peers[] | select(.k3s_role == "server-join")] | map(.name) | sort | join(",")' "$INV")" = "gpu-cluster,gpu-cluster2" ]
  [ "$(yq -r '[.peers[] | select(((.labels // []) | map(select(. == "storage=true")) | length) > 0)] | map(.name) | join(",")' "$INV")" = gpu-cluster2 ]
  yq -r '.k3s_version' "$INV" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+\+k3s[0-9]+$'
}

@test "T900117: kein Client traegt eine k3s-Rolle (PK-Desktop ist kein Knoten)" {
  INV="${REPO_ROOT}/devmesh/inventory.yaml"
  # Positiv-Anker: genau drei Hosts haben eine k3s-Rolle
  [ "$(yq -r '[.peers[] | select((.k3s_role // "") != "")] | length' "$INV")" -eq 3 ]
  roles="$(yq -r '.peers[] | select(.role == "client") | .k3s_role // ""' "$INV" | grep -v '^$' || true)"
  [ -z "$roles" ]
}
