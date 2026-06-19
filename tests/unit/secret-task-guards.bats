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
