#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# env-resolve.bats — Tests for scripts/env-resolve.sh
# ═══════════════════════════════════════════════════════════════════
# Verifies that sourcing env-resolve.sh exports the expected variables
# with the correct values, including values defined via YAML line
# continuation (regression guard against the old grep-based parser
# that silently truncated STRIPE_PUBLISHABLE_KEY to 55 chars).
#
# Prerequisites: bash, python3, PyYAML
# ═══════════════════════════════════════════════════════════════════

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/env-resolve.sh"

setup_file() {
  export ENV_DIR="${BATS_FILE_TMPDIR}/environments"
  mkdir -p "$ENV_DIR"

  cat > "${ENV_DIR}/schema.yaml" <<'YAML'
version: 1
env_vars:
  - name: PROD_DOMAIN
    required: true
    default_dev: "localhost"
  - name: STRIPE_PUBLISHABLE_KEY
    required: false
    default_dev: ""
  - name: MISSING_IN_ENV
    required: false
    default_dev: "dev-fallback"
setup_vars:
  - name: KC_USER1_USERNAME
    required: true
YAML

  cat > "${ENV_DIR}/prod.yaml" <<'YAML'
environment: prod
context: test-ctx
domain: example.test
overlay: prod-test
env_vars:
  PROD_DOMAIN: example.test
  STRIPE_PUBLISHABLE_KEY: "pk_live_51RhKrcDGTY4NP8aeqnf69F1OVgNleqjLqR5ZHi8jkzlyx\
    LiaTEnsY5xwhgPAVV7FdNb4eRnelIzt7DUj9TTAopXg00yyxjx03t"
setup_vars:
  KC_USER1_USERNAME: alice
YAML

  cat > "${ENV_DIR}/dev.yaml" <<'YAML'
environment: dev
context: k3d-dev
domain: localhost
env_vars:
  PROD_DOMAIN: localhost
setup_vars:
  KC_USER1_USERNAME: devuser
YAML
}

@test "multi-line STRIPE_PUBLISHABLE_KEY resolves to the full 107-char value" {
  run bash -c "source '$SCRIPT' prod '$ENV_DIR' >/dev/null && echo \"\${#STRIPE_PUBLISHABLE_KEY}:\$STRIPE_PUBLISHABLE_KEY\""
  [ "$status" -eq 0 ]
  [[ "$output" == "107:pk_live_51RhKrcDGTY4NP8aeqnf69F1OVgNleqjLqR5ZHi8jkzlyxLiaTEnsY5xwhgPAVV7FdNb4eRnelIzt7DUj9TTAopXg00yyxjx03t" ]]
}

@test "single-line env_vars and setup_vars export correctly" {
  run bash -c "source '$SCRIPT' prod '$ENV_DIR' >/dev/null && echo \"\$PROD_DOMAIN|\$KC_USER1_USERNAME\""
  [ "$status" -eq 0 ]
  [ "$output" = "example.test|alice" ]
}

@test "convenience vars ENV_CONTEXT / ENV_DOMAIN / ENV_OVERLAY export from top-level keys" {
  run bash -c "source '$SCRIPT' prod '$ENV_DIR' >/dev/null && echo \"\$ENV_CONTEXT|\$ENV_DOMAIN|\$ENV_OVERLAY\""
  [ "$status" -eq 0 ]
  [ "$output" = "test-ctx|example.test|prod-test" ]
}

@test "dev env falls back to default_dev when a schema var is missing from env file" {
  run bash -c "source '$SCRIPT' dev '$ENV_DIR' >/dev/null && echo \"\$MISSING_IN_ENV\""
  [ "$status" -eq 0 ]
  [ "$output" = "dev-fallback" ]
}

@test "prod env does NOT fall back to default_dev for missing vars" {
  run bash -c "source '$SCRIPT' prod '$ENV_DIR' >/dev/null && echo \"MISSING_IN_ENV=[\${MISSING_IN_ENV:-<unset>}]\""
  [ "$status" -eq 0 ]
  [ "$output" = "MISSING_IN_ENV=[<unset>]" ]
}

@test "exits non-zero when env name is missing" {
  run bash -c "source '$SCRIPT' '' '$ENV_DIR'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "exits non-zero when env file does not exist" {
  run bash -c "source '$SCRIPT' does-not-exist '$ENV_DIR'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Environment file not found"* ]]
}
