#!/usr/bin/env bats
# tests/spec/local-dev-mesh/k3d-acceptance-gate.bats — T900145
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  ACCEPT="$REPO_ROOT/scripts/devmesh/acceptance.sh"
  TEARDOWN="$REPO_ROOT/scripts/devmesh/k3d-teardown.sh"
  STUB="$BATS_TEST_TMPDIR/bin"; mkdir -p "$STUB"
  export SSH_LOG="$BATS_TEST_TMPDIR/ssh.log"; : > "$SSH_LOG"
  printf '%s\n' '#!/usr/bin/env bash' 'case "$*" in *pg_dump*) printf "%s" "${DUMP_CONTENT:-}" ;; esac' 'exit 0' > "$STUB/kubectl"
  printf '%s\n' '#!/usr/bin/env bash' 'echo "$*" >> "$SSH_LOG"' 'exit 0' > "$STUB/ssh"
  chmod +x "$STUB/kubectl" "$STUB/ssh"
  export PATH="$STUB:$PATH" DEVMESH_BACKUP_ROOT="$BATS_TEST_TMPDIR/backups"
  export DEVMESH_HEALTH_CMD=true DEVMESH_COMPARE_CMD=true
}

@test "acceptance passes with health, comparison and a non-empty dump (positive anchor)" {
  run env DUMP_CONTENT=PGDMP bash "$ACCEPT"
  [ "$status" -eq 0 ]
  [ -n "$(find "$DEVMESH_BACKUP_ROOT" -name ACCEPTANCE_OK)" ]
}
@test "acceptance fails on an empty dump and writes no marker" {
  run env DUMP_CONTENT= bash "$ACCEPT"
  [ "$status" -ne 0 ]
  [ -z "$(find "$DEVMESH_BACKUP_ROOT" -name ACCEPTANCE_OK 2>/dev/null)" ]
}
@test "acceptance fails when the migration comparison fails" {
  run env DUMP_CONTENT=PGDMP DEVMESH_COMPARE_CMD=false bash "$ACCEPT"
  [ "$status" -ne 0 ]
}
@test "teardown after a passed gate deletes the cluster (positive anchor)" {
  run env DUMP_CONTENT=PGDMP bash "$TEARDOWN"
  [ "$status" -eq 0 ]
  grep -qF 'k3d cluster delete mentolder-dev' "$SSH_LOG"
}
@test "teardown without a fresh dump is refused and deletes nothing" {
  run env DUMP_CONTENT= bash "$TEARDOWN"
  [ "$status" -ne 0 ]
  [ -z "$(grep -F 'cluster delete' "$SSH_LOG" || true)" ]
}
