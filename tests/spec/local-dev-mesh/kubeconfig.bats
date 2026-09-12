#!/usr/bin/env bats
# tests/spec/local-dev-mesh/kubeconfig.bats — scripts/devmesh/kubeconfig.sh [T900117]
#
# Pruefmodus: Output-Verifikation am Ergebnis, der gemergten Kubeconfig-Datei (per yq
# gelesen). ssh ist gestubbt und liefert eine k3s.yaml-Fixture. kubectl wird nicht gebraucht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/kubeconfig.sh"
  export DEVMESH_INVENTORY="${BATS_TEST_DIRNAME}/fixtures/inventory.yaml"
  BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$BIN"
  export SSH_ARGV_LOG="${BATS_TEST_TMPDIR}/ssh-argv.log"
  : > "$SSH_ARGV_LOG"
  export K3S_YAML="${BATS_TEST_TMPDIR}/k3s.yaml"
  cat > "$K3S_YAML" <<'EOF'
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: Q0E=
    server: https://127.0.0.1:6443
  name: default
contexts:
- context:
    cluster: default
    user: default
  name: default
current-context: default
users:
- name: default
  user:
    client-certificate-data: Q0VSVA==
    client-key-data: S0VZ
EOF
  cat > "$BIN/ssh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SSH_ARGV_LOG"
if [ -n "${STUB_SSH_RC:-}" ]; then exit "$STUB_SSH_RC"; fi
cat "$K3S_YAML"
EOF
  chmod +x "$BIN/ssh"
  export KUBECONFIG_TARGET="${BATS_TEST_TMPDIR}/kube/config"
  mkdir -p "$(dirname "$KUBECONFIG_TARGET")"
  cat > "$KUBECONFIG_TARGET" <<'EOF'
apiVersion: v1
kind: Config
clusters:
  - name: fleet
    cluster: {server: "https://fleet.invalid:6443"}
  - name: devmesh
    cluster: {server: "https://stale.invalid:6443"}
users:
  - name: fleet
    user: {token: fleet-token}
  - name: devmesh
    user: {token: stale-token}
contexts:
  - name: fleet
    context: {cluster: fleet, user: fleet}
  - name: devmesh
    context: {cluster: devmesh, user: devmesh}
current-context: fleet
EOF
}

_run() { run env PATH="$BIN:$PATH" bash "$SCRIPT" "$@"; }
_count_ctx() { yq -r "[.contexts[] | select(.name == \"$1\")] | length" "$KUBECONFIG_TARGET"; }

@test "Default-Server: Context devmesh zeigt auf den Tailnet-Namen von gpu-metal, fleet bleibt" {
  _run
  [ "$status" -eq 0 ]
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  [ "$(_count_ctx devmesh)" -eq 1 ]
  [ "$(_count_ctx fleet)" -eq 1 ]
  [ "$(yq -r '.clusters[] | select(.name == "devmesh") | .cluster.server' "$KUBECONFIG_TARGET")" = "https://gpu-metal.example-tailnet.ts.net:6443" ]
  [ "$(yq -r '.users[] | select(.name == "devmesh") | .user."client-certificate-data"' "$KUBECONFIG_TARGET")" = "Q0VSVA==" ]
  [ "$(yq -r '.["current-context"]' "$KUBECONFIG_TARGET")" = fleet ]
}

@test "SERVER=gpu-cluster schaltet den Context auf gpu-cluster um" {
  _run gpu-cluster
  [ "$status" -eq 0 ]
  grep -qF 'patrick@10.10.10.2' "$SSH_ARGV_LOG"
  [ "$(yq -r '.clusters[] | select(.name == "devmesh") | .cluster.server' "$KUBECONFIG_TARGET")" = "https://gpu-cluster.example-tailnet.ts.net:6443" ]
}

@test "fehlende Ziel-Datei wird angelegt, current-context ist dann devmesh" {
  rm "$KUBECONFIG_TARGET"
  _run
  [ "$status" -eq 0 ]
  [ "$(_count_ctx devmesh)" -eq 1 ]
  [ "$(yq -r '.["current-context"]' "$KUBECONFIG_TARGET")" = devmesh ]
}

@test "Client statt Server: Exit 1, kein SSH, Ziel-Datei unveraendert" {
  before="$(cksum < "$KUBECONFIG_TARGET")"
  [ "$(_count_ctx fleet)" -eq 1 ]
  _run pk-desktop
  [ "$status" -eq 1 ]
  [ ! -s "$SSH_ARGV_LOG" ]
  [ "$(cksum < "$KUBECONFIG_TARGET")" = "$before" ]
}

@test "SSH nicht erreichbar: Exit 2, Ziel-Datei unveraendert" {
  before="$(cksum < "$KUBECONFIG_TARGET")"
  export STUB_SSH_RC=255
  _run
  [ "$status" -eq 2 ]
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  [ "$(cksum < "$KUBECONFIG_TARGET")" = "$before" ]
}
