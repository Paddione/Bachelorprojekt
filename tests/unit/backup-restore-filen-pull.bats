#!/usr/bin/env bats
# backup-restore-filen-pull.bats — unit tests for `backup-restore.sh filen-pull`
# Stubs kubectl so no live cluster/Filen is required; captures the applied Job YAML.

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/backup-restore.sh"

setup() {
  FAKE_BIN=$(mktemp -d)
  export CAPTURE="${BATS_TEST_TMPDIR}/applied.yaml"
  cat > "${FAKE_BIN}/kubectl" <<EOF
#!/usr/bin/env bash
# Capture 'apply -f -' stdin; answer configmap lookups; succeed on wait/logs.
args="\$*"
case "\$args" in
  *"apply"*) cat > "${CAPTURE}" ; exit 0 ;;
  *"get configmap backup-config"*) echo "/Backup" ; exit 0 ;;
  *"wait"*) exit 0 ;;
  *"logs"*) exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${FAKE_BIN}/kubectl"
  export PATH="${FAKE_BIN}:${PATH}"
}

teardown() {
  rm -rf "$FAKE_BIN"
}

@test "filen-pull without timestamp fails with usage" {
  run bash "$SCRIPT" filen-pull
  assert_failure
  assert_output --partial "Usage"
}

@test "filen-pull renders a Job mounting backup-pvc writable" {
  run bash "$SCRIPT" filen-pull 20260530-020001
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "kind: Job"
  assert_output --partial "claimName: backup-pvc"
  assert_output --partial "node:22-alpine"
  assert_output --partial "/backups/20260530-020001/"
  # The backups volume must be writable — no readOnly mount anywhere in the Job.
  refute_output --partial "readOnly: true"
}

@test "filen-pull resolves remote base path from backup-config configmap" {
  run bash "$SCRIPT" filen-pull pvc-20260530-030001
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "/Backup/pvc-20260530-030001/"
}

@test "filen-pull honours --remote-path override" {
  run bash "$SCRIPT" filen-pull 20260530-020001 --remote-path /custom/path
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "/custom/path/20260530-020001/"
}

@test "usage lists filen-pull" {
  run bash "$SCRIPT" --help
  assert_success
  assert_output --partial "filen-pull"
}
