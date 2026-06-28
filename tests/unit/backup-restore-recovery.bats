#!/usr/bin/env bats
# backup-restore-recovery.bats — unit tests for the recovery-staging subcommands.
# Stubs kubectl; captures the applied Job/exec YAML; no live cluster required.

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/backup-restore.sh"

setup() {
  FAKE_BIN=$(mktemp -d)
  export CAPTURE="${BATS_TEST_TMPDIR}/applied.yaml"
  # Create a stub recovery-browser.yaml so browse/unbrowse can find it without Plan 2.
  mkdir -p "${BATS_TEST_TMPDIR}/k3d"
  echo "# stub recovery-browser.yaml (Plan 2)" > "${BATS_TEST_TMPDIR}/k3d/recovery-browser.yaml"
  cat > "${FAKE_BIN}/kubectl" <<EOF
#!/usr/bin/env bash
args="\$*"
case "\$args" in
  *"apply"*)  cat > "${CAPTURE}" ; exit 0 ;;
  *"delete"*) exit 0 ;;
  *"wait"*)   exit 0 ;;
  *"logs"*)   exit 0 ;;
  *"get configmap domain-config"*)
    if [[ "\$args" == *"-o json"* && "\$args" != *"-o jsonpath"* ]]; then
      echo '{"data": {"RECOVER_DOMAIN": "recover.localhost"}}'
    else
      echo "recover.localhost"
    fi
    exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${FAKE_BIN}/kubectl"
  export PATH="${FAKE_BIN}:${PATH}"
  # Override REPO_ROOT so the script finds our stub manifest.
  export REPO_ROOT="${BATS_TEST_TMPDIR}"
}

teardown() { rm -rf "$FAKE_BIN"; }

@test "stage without args fails with usage" {
  run bash "$SCRIPT" stage
  assert_failure
  assert_output --partial "Usage"
}

@test "stage of a DB renders a pg_restore Job into <db>_recovery (live DB untouched)" {
  run bash "$SCRIPT" stage 20260530-020001 website -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "kind: Job"
  assert_output --partial "website.dump.enc"
  assert_output --partial "createdb -h shared-db -U postgres -O website website_recovery"
  assert_output --partial "pg_restore -h shared-db -U postgres -d website_recovery"
  # never drops the live db during staging
  refute_output --partial "dropdb -h shared-db -U postgres --if-exists website "
}

@test "stage of a service extracts into recovery-pvc under /recovery/<ts>/<service>" {
  run bash "$SCRIPT" stage pvc-20260530-030001 nextcloud-files -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "nextcloud-files.tar.gz.enc"
  assert_output --partial "claimName: recovery-pvc"
  assert_output --partial "/recovery/pvc-20260530-030001/nextcloud-files"
  # backup source mounted read-only
  assert_output --partial "claimName: backup-pvc"
}

@test "verify renders a Job that restores into a temp DB, counts, and drops it" {
  run bash "$SCRIPT" verify 20260530-020001 website
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "website.dump.enc"
  assert_output --partial "createdb -h shared-db -U postgres"
  assert_output --partial "information_schema.tables"
  assert_output --partial "dropdb -h shared-db -U postgres --if-exists"
}

@test "restore-file copies one path from staging into the live PVC (with -y)" {
  run bash "$SCRIPT" restore-file pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "claimName: recovery-pvc"
  assert_output --partial "claimName: nextcloud-data-pvc"
  assert_output --partial "/recovery/pvc-20260530-030001/nextcloud-files/admin/files/Doc.pdf"
}

@test "restore-file requires confirmation without -y" {
  run bash -c "echo no | bash '$SCRIPT' restore-file pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf"
  assert_failure
  assert_output --partial "Aborted"
}

@test "restore-table renders pg_restore -t <table> into the live DB (with -y)" {
  run bash "$SCRIPT" restore-table 20260530-020001 website site_settings -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "website.dump.enc"
  assert_output --partial "pg_restore -h shared-db -U postgres -d website"
  assert_output --partial "-t site_settings"
}

@test "browse applies the recovery-browser manifest and prints the URL" {
  run bash "$SCRIPT" browse
  assert_success
  assert_output --partial "recover."
}

@test "unstage drops *_recovery DBs and clears the staging dir for a timestamp" {
  run bash "$SCRIPT" unstage pvc-20260530-030001 -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "/recovery/pvc-20260530-030001"
}

@test "usage lists the recovery commands" {
  run bash "$SCRIPT" --help
  assert_success
  assert_output --partial "stage"
  assert_output --partial "verify"
  assert_output --partial "restore-file"
  assert_output --partial "restore-table"
  assert_output --partial "browse"
}
