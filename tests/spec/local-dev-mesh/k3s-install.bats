#!/usr/bin/env bats
# tests/spec/local-dev-mesh/k3s-install.bats — scripts/devmesh/k3s-install.sh [T900117]
#
# Pruefmodus: Output-Verifikation. DRY_RUN=1 gibt den Installationsbefehl als Zeile
# "command:" aus. Die Assertions zerlegen diese Zeile per eval in Argumente, damit sie an
# der Semantik der Flags haengen und nicht an der %q-Darstellung. Idempotenz und Token-Pfad
# laufen gegen einen ssh-Stub, der argv und stdin getrennt protokolliert.
#
# $0-Falle (tests/CLAUDE.md): keine Assertion liest den Gesamtoutput, alle lesen die Zeilen
# "command:" bzw. "unveraendert:" oder die Stub-Protokolle.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/k3s-install.sh"
  export DEVMESH_INVENTORY="${BATS_TEST_DIRNAME}/fixtures/inventory.yaml"
  STUB="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB"
  export SSH_ARGV_LOG="${BATS_TEST_TMPDIR}/ssh-argv.log"
  export SSH_STDIN_LOG="${BATS_TEST_TMPDIR}/ssh-stdin.log"
  : > "$SSH_ARGV_LOG"
  : > "$SSH_STDIN_LOG"
  cat > "$STUB/ssh" << 'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SSH_ARGV_LOG"
cmd="${!#}"
case "$cmd" in
  "sudo -n true") exit 0 ;;
  *"k3s --version"*) if [ -n "${STUB_STATE_FILE:-}" ]; then cat "$STUB_STATE_FILE"; fi ;;
  *"/var/lib/rancher/k3s/server/token"*) printf '%s\n' "${STUB_TOKEN:-}" ;;
  "sudo -n bash -s") cat >> "$SSH_STDIN_LOG" ;;
  *) echo "ssh-Stub: unerwarteter Aufruf: $cmd" >&2; exit 99 ;;
esac
EOF
  chmod +x "$STUB/ssh"
}

# Argumente hinter "sh -s - " aus der command:-Zeile, eines pro Zeile.
_args() {
  local line rest
  line="$(printf '%s\n' "$1" | grep '^command: ' | head -n1)"
  rest="${line#* sh -s - }"
  eval "set -- $rest"
  printf '%s\n' "$@"
}

# Erfolgreich, wenn in der Argumentliste $1 direkt von $2 gefolgt wird.
_pair() {
  printf '%s\n' "$1" | awk -v f="$2" -v v="$3" 'prev == f && $0 == v {found = 1} {prev = $0} END {exit !found}'
}

@test "server-join: node-ip aus dem Inventar, wireguard-native, Join gegen server-init, kein --cluster-init" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  line="$(printf '%s\n' "$output" | grep '^command: ')"
  # Spec-Szenario "Install flags for a joining server", woertlich
  printf '%s\n' "$line" | grep -qF -e '--node-ip 10.10.10.2'
  args="$(_args "$output")"
  [ "$(printf '%s\n' "$args" | head -n1)" = server ]
  printf '%s\n' "$args" | grep -qxF -e '--flannel-backend=wireguard-native'
  _pair "$args" --server https://10.1.0.101:6443
  # Alle Server tragen dieselben Cluster-Netze, sonst verweigert k3s den Join
  printf '%s\n' "$args" | grep -qxF -e '--cluster-cidr=10.52.0.0/16'
  printf '%s\n' "$args" | grep -qxF -e '--service-cidr=10.53.0.0/16'
  printf '%s\n' "$args" | grep -qxF -e '--cluster-dns=10.53.0.10'
  init="$(printf '%s\n' "$args" | grep -cxF -e '--cluster-init' || true)"
  [ "$init" -eq 0 ]
}

@test "server-init: --cluster-init, SANs aller Server, etcd-Snapshots alle 6h mit Retention 20" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  args="$(_args "$output")"
  printf '%s\n' "$args" | grep -qxF -e '--cluster-init'
  _pair "$args" --node-ip 10.1.0.101
  for san in 10.1.0.101 10.10.10.2 10.10.10.3 \
    gpu-metal.example-tailnet.ts.net gpu-cluster.example-tailnet.ts.net gpu-cluster2.example-tailnet.ts.net; do
    _pair "$args" --tls-san "$san"
  done
  [ "$(printf '%s\n' "$args" | grep -cxF -e '--tls-san')" -eq 6 ]
  printf '%s\n' "$args" | grep -qxF -e '--etcd-snapshot-schedule-cron=0 */6 * * *'
  printf '%s\n' "$args" | grep -qxF -e '--etcd-snapshot-retention=20'
  printf '%s\n' "$args" | grep -qxF -e '--cluster-cidr=10.52.0.0/16'
  printf '%s\n' "$args" | grep -qxF -e '--service-cidr=10.53.0.0/16'
  printf '%s\n' "$args" | grep -qxF -e '--cluster-dns=10.53.0.10'
  # Keine fleet-Netze (Positiv-Anker: die drei devmesh-Netze oben)
  fleet="$(printf '%s\n' "$args" | grep -F -e '10.42.' -e '10.43.' || true)"
  [ -z "$fleet" ]
  # Der Client pk-desktop steht nicht im Zertifikat (Positiv-Anker: 6 SANs oben)
  client="$(printf '%s\n' "$args" | grep -F -e 'pk-desktop' -e '10.10.0.3' || true)"
  [ -z "$client" ]
}

@test "Versionspin aus dem Inventar steht im Befehl" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep '^command: ' | grep -qF 'INSTALL_K3S_VERSION=v1.36.1+k3s1'
}

@test "storage=true nur auf gpu-cluster2" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster2
  [ "$status" -eq 0 ]
  _pair "$(_args "$output")" --node-label storage=true

  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  args="$(_args "$output")"
  _pair "$args" --node-ip 10.10.10.2
  labels="$(printf '%s\n' "$args" | grep -cxF -e '--node-label' || true)"
  [ "$labels" -eq 0 ]
}

@test "unbekannter Host endet mit Exit 1 und nennt den Host" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-nirgendwo
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -qF 'gpu-nirgendwo'
}

@test "fehlender tailnet_name eines Servers endet mit Exit 1" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  broken="${BATS_TEST_TMPDIR}/inventory.yaml"
  cp "$DEVMESH_INVENTORY" "$broken"
  yq -i 'del(.peers[2].tailnet_name)' "$broken"
  run env DRY_RUN=1 DEVMESH_INVENTORY="$broken" bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -qF 'gpu-cluster2'
}

@test "zweiter Lauf auf fertigem Knoten aendert nichts und endet mit 0" {
  run env DRY_RUN=1 bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  args_str="$(printf '%s\n' "$output" | sed -n 's/^command: .* sh -s - //p')"
  [ -n "$args_str" ]
  export STUB_STATE_FILE="${BATS_TEST_TMPDIR}/state"
  printf 'k3s version v1.36.1+k3s1 (0123abcd)\n---\n%s' "$args_str" > "$STUB_STATE_FILE"

  run env PATH="$STUB:$PATH" bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q '^unveraendert: '
  # Positiv-Anker: der Zustand wurde tatsaechlich abgefragt
  grep -q 'k3s --version' "$SSH_ARGV_LOG"
  [ ! -s "$SSH_STDIN_LOG" ]
  token_calls="$(grep -c 'server/token' "$SSH_ARGV_LOG" || true)"
  [ "$token_calls" -eq 0 ]
}

@test "Join-Installation: Token nur ueber stdin, nie in argv oder Ausgabe" {
  export STUB_STATE_FILE="${BATS_TEST_TMPDIR}/state"
  printf -- '---\n' > "$STUB_STATE_FILE"
  export STUB_TOKEN="test-token-nicht-geheim"

  run env PATH="$STUB:$PATH" bash "$SCRIPT" gpu-cluster
  [ "$status" -eq 0 ]
  # Positiv-Anker: das Installationsskript ging mit Token und Join-Flags raus
  grep -qF -e '--node-ip 10.10.10.2' "$SSH_STDIN_LOG"
  grep -qF "$STUB_TOKEN" "$SSH_STDIN_LOG"
  grep -qF '/etc/rancher/k3s/devmesh-install.args' "$SSH_STDIN_LOG"
  grep -qF 'ufw allow from 10.52.0.0/16' "$SSH_STDIN_LOG"
  grep -qF 'ufw allow from 10.53.0.0/16' "$SSH_STDIN_LOG"
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  leak="$(grep -F "$STUB_TOKEN" "$SSH_ARGV_LOG" || true)"
  [ -z "$leak" ]
  leak="$(printf '%s\n' "$output" | grep -F "$STUB_TOKEN" || true)"
  [ -z "$leak" ]
}
