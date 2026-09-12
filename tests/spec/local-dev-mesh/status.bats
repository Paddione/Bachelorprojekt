#!/usr/bin/env bats
# tests/spec/local-dev-mesh/status.bats — scripts/devmesh/status.sh [T900117]
#
# Pruefmodus: Output-Verifikation gegen einen kubectl-Stub. Snapshot-Zeitstempel werden
# relativ zur Testlaufzeit erzeugt (GNU date), damit das Alter deterministisch ist.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/status.sh"
  BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$BIN"
  for t in bash env date grep sort tail cat; do ln -s "$(command -v "$t")" "$BIN/$t"; done
  export KUBECTL_ARGV_LOG="${BATS_TEST_TMPDIR}/kubectl-argv.log"
  : > "$KUBECTL_ARGV_LOG"
  export STUB_NODES="${BATS_TEST_TMPDIR}/nodes"
  export STUB_SNAPS="${BATS_TEST_TMPDIR}/snaps"
  printf 'gpu-metal True true\ngpu-cluster True true\ngpu-cluster2 True true\n' > "$STUB_NODES"
  _snaps 1
  cat > "$BIN/kubectl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$KUBECTL_ARGV_LOG"
case "$*" in
  *"get nodes"*) if [ -n "${STUB_NODES_RC:-}" ]; then exit "$STUB_NODES_RC"; fi; cat "$STUB_NODES" ;;
  *etcdsnapshotfiles*) cat "$STUB_SNAPS" ;;
  *) echo "kubectl-Stub: unerwartet: $*" >&2; exit 99 ;;
esac
EOF
  chmod +x "$BIN/kubectl"
}

# Schreibt je Argument einen Snapshot, der so viele Stunden alt ist.
_snaps() {
  : > "$STUB_SNAPS"
  local h
  for h in "$@"; do
    date -u -d "@$(( $(date +%s) - h * 3600 ))" +%Y-%m-%dT%H:%M:%SZ >> "$STUB_SNAPS"
  done
}

_run() { run env PATH="$BIN" "$BASH" "$SCRIPT"; }

@test "gesunder Cluster: Exit 0, drei Knoten und drei etcd-Mitglieder Ready, Context devmesh" {
  _snaps 30 1
  _run
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'Knoten: 3/3 Ready'
  printf '%s\n' "$output" | grep -qF 'etcd-Mitglieder: 3/3 Ready'
  printf '%s\n' "$output" | grep '^OK' | grep -qF '1h'
  grep -qF -e '--context devmesh' "$KUBECTL_ARGV_LOG"
}

@test "Snapshot 13 Stunden alt: Exit ungleich 0, Alter wird genannt" {
  _snaps 13
  _run
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep '^FAIL' | grep -qF '13h'
}

@test "kein Snapshot: Exit 1" {
  : > "$STUB_SNAPS"
  _run
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -q '^FAIL'
}

@test "Knoten nicht Ready: Exit 1, Knoten wird genannt" {
  printf 'gpu-metal True true\ngpu-cluster Unknown true\ngpu-cluster2 True true\n' > "$STUB_NODES"
  _run
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep '^FAIL' | grep -qF 'gpu-cluster'
  printf '%s\n' "$output" | grep -qF 'etcd-Mitglieder: 2/3 Ready'
}

@test "kubectl fehlt: Exit 2" {
  _run
  [ "$status" -eq 0 ]
  rm "$BIN/kubectl"
  _run
  [ "$status" -eq 2 ]
}

@test "Context nicht erreichbar: Exit 2" {
  export STUB_NODES_RC=1
  _run
  [ "$status" -eq 2 ]
}
