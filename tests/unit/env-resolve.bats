#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# env-resolve.bats — Tests for scripts/env-resolve.sh
# last-touched: 2026-06-21 (automated maintenance — CI trigger)
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

@test "ENV=staging resolves overlay/namespace/context correctly" {
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
  - name: WORKSPACE_NAMESPACE
    required: false
  - name: WEBSITE_NAMESPACE
    required: false
  - name: BRAND_ID
    required: true
    default_dev: "korczewski"
  - name: BRAND_NAME
    required: true
    default_dev: "KORE"
  - name: CONTACT_EMAIL
    required: true
    default_dev: "dev@localhost"
  - name: SMTP_FROM
    required: true
    default_dev: "noreply@localhost"
  - name: SMTP_USER
    required: true
    default_dev: "noreply@localhost"
  - name: SMTP_HOST
    required: true
    default_dev: "mailpit.workspace.svc.cluster.local"
  - name: SMTP_PORT
    required: true
    default_dev: "1025"
  - name: INFRA_NAMESPACE
    required: true
    default_dev: "workspace-infra"
  - name: TLS_SECRET_NAME
    required: true
    default_dev: "workspace-wildcard-tls"
  - name: TURN_PUBLIC_IP
    required: true
    default_dev: "127.0.0.1"
  - name: TURN_NODE
    required: true
    default_dev: "k3d-dev-server-0"
  - name: BRETT_DOMAIN
    required: true
    default_dev: "brett.localhost"
  - name: STREAM_DOMAIN
    required: true
    default_dev: "stream.localhost"
  - name: RECOVER_DOMAIN
    required: true
    default_dev: "recover.localhost"
  - name: OTEL_DOMAIN
    required: true
    default_dev: "otel.localhost"
  - name: WEBSITE_HOST
    required: true
    default_dev: "web.localhost"
  - name: WEBSITE_SITE_URL
    required: true
    default_dev: "http://web.localhost"
  - name: KEYCLOAK_FRONTEND_URL
    required: true
    default_dev: "http://auth.localhost"
  - name: LLM_ENABLED
    required: true
    default_dev: "false"
  - name: LLM_RERANK_ENABLED
    required: true
    default_dev: "false"
  - name: LLM_ROUTER_URL
    required: true
    default_dev: "http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234"
  - name: LLM_EMBED_URL
    required: true
    default_dev: "http://llm-gateway-embed.workspace.svc.cluster.local:8081"
  - name: SYSTEMTEST_LOOP_ENABLED
    required: false
    default_dev: "false"
  - name: MEDIAVIEWER_HOST
    required: true
    default_dev: "mediaviewer.localhost"
  - name: VIDEOVAULT_DOMAIN
    required: true
    default_dev: "videovault.localhost"
setup_vars:
  - name: KC_USER1_USERNAME
    required: true
  - name: KC_USER1_EMAIL
    required: true
    validate: "^.+@.+$"
YAML

  cat > "${ENV_DIR}/staging.yaml" <<'YAML'
environment: staging
context: fleet
domain: staging.example.test
overlay: prod-fleet/staging
workspace_namespace: workspace-staging
website_namespace: website-staging
env_vars:
  PROD_DOMAIN: staging.example.test
  WORKSPACE_NAMESPACE: workspace-staging
  WEBSITE_NAMESPACE: website-staging
  BRAND_NAME: "Staging"
  BRAND_ID: staging
  CONTACT_EMAIL: staging@example.test
  SMTP_FROM: staging@example.test
  SMTP_USER: staging
  SMTP_HOST: mailpit.workspace-staging.svc.cluster.local
  SMTP_PORT: "1025"
  INFRA_NAMESPACE: staging-infra
  TLS_SECRET_NAME: staging-wildcard-tls
  TURN_PUBLIC_IP: "127.0.0.1"
  TURN_NODE: pk-hetzner-4
  BRETT_DOMAIN: brett.staging.example.test
  STREAM_DOMAIN: stream.staging.example.test
  RECOVER_DOMAIN: recover.staging.example.test
  OTEL_DOMAIN: otel.staging.example.test
  WEBSITE_HOST: web.staging.example.test
  WEBSITE_SITE_URL: "https://web.staging.example.test"
  KEYCLOAK_FRONTEND_URL: "https://auth.staging.example.test"
  LLM_ENABLED: "false"
  LLM_RERANK_ENABLED: "false"
  LLM_ROUTER_URL: "http://llm-gateway-lmstudio.workspace-staging.svc.cluster.local:1234"
  LLM_EMBED_URL: "http://llm-gateway-embed.workspace-staging.svc.cluster.local:8081"
  SYSTEMTEST_LOOP_ENABLED: "false"
  MEDIAVIEWER_HOST: mediaviewer.staging.example.test
  VIDEOVAULT_DOMAIN: videovault.staging.example.test
setup_vars:
  KC_USER1_USERNAME: staging-admin
  KC_USER1_EMAIL: staging@example.test
YAML

  run bash -c "source '$SCRIPT' staging '$ENV_DIR' >/dev/null && echo \"\$ENV_CONTEXT|\$ENV_DOMAIN|\$ENV_OVERLAY|\$WORKSPACE_NAMESPACE|\$WEBSITE_NAMESPACE|\$BRAND_ID\""
  [ "$status" -eq 0 ]
  [ "$output" = "fleet|staging.example.test|prod-fleet/staging|workspace-staging|website-staging|staging" ]
}
