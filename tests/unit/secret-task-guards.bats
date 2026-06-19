#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# secret-task-guards.bats — Fail-closed guards for secret-mutating actions
# ═══════════════════════════════════════════════════════════════════
# Ticket T000951. These tests encode the DESIRED fail-closed behavior of the
# secret-mutating task actions. They are written TDD-first and are RED until
# fix/secret-task-mismatch-guards is implemented by dev-flow-execute.
#
# Covered findings (flagship anchors; the full set lives in the plan):
#   #8  scripts/ci-dummy-secrets.sh — must refuse outside CI/dev
#   #1  scripts/wait-for-sealed-secret.sh — must fail-closed on decrypt timeout
#
# No cluster required — kubectl is faked via the KUBECTL override.
# ═══════════════════════════════════════════════════════════════════

load test_helper

CI_DUMMY="${PROJECT_DIR}/scripts/ci-dummy-secrets.sh"
WAIT_SEALED="${PROJECT_DIR}/scripts/wait-for-sealed-secret.sh"

setup() {
  SANDBOX="${BATS_TEST_TMPDIR}/sandbox"
  mkdir -p "${SANDBOX}/k3d"
  STUBS="${BATS_TEST_TMPDIR}/stubs"
  mkdir -p "$STUBS"
}

# ── Finding #8: ci-dummy-secrets.sh must be fail-closed outside CI/dev ──────

@test "#8 ci-dummy-secrets REFUSES when ENV is a prod brand and CI unset" {
  cd "$SANDBOX"
  run env -u CI ENV=mentolder bash "$CI_DUMMY"
  assert_failure
  # A refusal must NOT have written placeholder secret files.
  [ ! -f "${SANDBOX}/k3d/secrets.yaml" ]
  [ ! -f "${SANDBOX}/k3d/backup-secrets.yaml" ]
}

@test "#8 ci-dummy-secrets REFUSES for ENV=korczewski without CI" {
  cd "$SANDBOX"
  run env -u CI ENV=korczewski bash "$CI_DUMMY"
  assert_failure
}

@test "#8 ci-dummy-secrets PROCEEDS when CI=true (CI happy path)" {
  cd "$SANDBOX"
  run env CI=true ENV=mentolder bash "$CI_DUMMY"
  assert_success
  [ -f "${SANDBOX}/k3d/secrets.yaml" ]
}

@test "#8 ci-dummy-secrets PROCEEDS for ENV=dev (dev ergonomics)" {
  cd "$SANDBOX"
  run env -u CI ENV=dev bash "$CI_DUMMY"
  assert_success
}

# ── Finding #1: wait-for-sealed-secret.sh must fail-closed on timeout ───────

@test "#1 wait-for-sealed-secret helper exists and is executable" {
  [ -f "$WAIT_SEALED" ]
  [ -x "$WAIT_SEALED" ]
}

@test "#1 wait-for-sealed-secret EXITS NON-ZERO when the secret never decrypts" {
  # Fake kubectl: `get secret …` always reports missing (non-zero).
  cat > "${STUBS}/kubectl" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "${STUBS}/kubectl"
  run env KUBECTL="${STUBS}/kubectl" bash "$WAIT_SEALED" \
    --context fake --namespace workspace --secret workspace-secrets --timeout 2
  assert_failure
}

@test "#1 wait-for-sealed-secret EXITS ZERO once the secret is present" {
  cat > "${STUBS}/kubectl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "${STUBS}/kubectl"
  run env KUBECTL="${STUBS}/kubectl" bash "$WAIT_SEALED" \
    --context fake --namespace workspace --secret workspace-secrets --timeout 2
  assert_success
}

# ── Finding #2: keycloak-sync.sh must fail-closed in non-dev ────────────────
KC_SYNC="${PROJECT_DIR}/scripts/keycloak-sync.sh"

@test "#2 kc_should_fail_closed is TRUE for a prod brand without soft-override" {
  run env -u KEYCLOAK_SYNC_SOFT bash -c \
    'source "'"$KC_SYNC"'" --_test-source 2>/dev/null; ENV=mentolder kc_should_fail_closed && echo CLOSED'
  assert_output --partial CLOSED
}

@test "#2 kc_should_fail_closed is FALSE for ENV=dev (dev ergonomics)" {
  run bash -c 'source "'"$KC_SYNC"'" --_test-source 2>/dev/null; ENV=dev kc_should_fail_closed && echo CLOSED || echo OPEN'
  assert_output --partial OPEN
}

@test "#2 kc_should_fail_closed is FALSE when KEYCLOAK_SYNC_SOFT=1 (override)" {
  run bash -c 'source "'"$KC_SYNC"'" --_test-source 2>/dev/null; ENV=mentolder KEYCLOAK_SYNC_SOFT=1 kc_should_fail_closed && echo CLOSED || echo OPEN'
  assert_output --partial OPEN
}

# ── Finding #3: env-seal cert-fingerprint compare seam ─────────────────────
ENV_SEAL="${PROJECT_DIR}/scripts/env-seal.sh"

@test "#3 env-seal --_test-cert-compare exits ZERO for identical certs" {
  printf 'CERT-A\n' > "${SANDBOX}/a.pem"
  printf 'CERT-A\n' > "${SANDBOX}/b.pem"
  run bash "$ENV_SEAL" --_test-cert-compare "${SANDBOX}/a.pem" "${SANDBOX}/b.pem"
  assert_success
}

@test "#3 env-seal --_test-cert-compare exits NON-ZERO for drifted certs" {
  printf 'CERT-A\n' > "${SANDBOX}/a.pem"
  printf 'CERT-B-DIFFERENT\n' > "${SANDBOX}/b.pem"
  run bash "$ENV_SEAL" --_test-cert-compare "${SANDBOX}/a.pem" "${SANDBOX}/b.pem"
  assert_failure
}

# ── Finding #4: restore guidance must point at sync-db-passwords ────────────
BACKUP_RESTORE="${PROJECT_DIR}/scripts/backup-restore.sh"

@test "#4 backup-restore restore-complete guidance mentions sync-db-passwords" {
  run grep -n 'sync-db-passwords' "$BACKUP_RESTORE"
  assert_success
}

@test "#4 db:restore task chains workspace:sync-db-passwords" {
  run bash -c 'sed -n "/workspace:db:restore:/,/db:diagram:/p" "'"${PROJECT_DIR}/Taskfile.yml"'" | grep -c "workspace:sync-db-passwords"'
  assert_output --partial 1
}

# ── Finding #5: app-install must reseal (or warn) after secret processing ───
APP_INSTALL="${PROJECT_DIR}/scripts/app-install.sh"

@test "#5 app-install references env-seal after secret processing" {
  run grep -nE 'env-seal\.sh|sealed mirror stale' "$APP_INSTALL"
  assert_success
}

# ── Finding #6: secrets:sync must warn about un-reconciled workloads ────────
@test "#6 secrets:sync emits a workload-reconcile reminder" {
  run bash -c 'sed -n "/^  secrets:sync:/,/^  secrets:install-hooks:/p" "'"${PROJECT_DIR}/Taskfile.yml"'" | grep -ciE "sync-db-passwords|rollout restart|landmine|latent"'
  refute_output --partial 0
}

@test "#6 secrets:sync:full companion task exists" {
  run grep -c 'secrets:sync:full:' "${PROJECT_DIR}/Taskfile.yml"
  assert_output --partial 1
}

# ── Finding #7: rotate-tokens must annotate the deployment with a token version
@test "#7 rotate-tokens stamps a token-version annotation" {
  run bash -c 'sed -n "/claude-code:rotate-tokens:/,/Website (Astro/p" "'"${PROJECT_DIR}/Taskfile.yml"'" | grep -ciE "token-version|annotate"'
  refute_output --partial 0
}
