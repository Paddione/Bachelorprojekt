#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# env-validate.bats — Tests for scripts/env-validate.sh
# ═══════════════════════════════════════════════════════════════════
# Validates the pre-deploy environment validation gate using
# temporary fixtures (schema + env files) in BATS_FILE_TMPDIR.
#
# Prerequisites: bash
# No cluster required — uses --schema-only throughout.
# ═══════════════════════════════════════════════════════════════════

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/env-validate.sh"

# ── Fixtures ─────────────────────────────────────────────────────

setup_file() {
  export ENV_DIR="${BATS_FILE_TMPDIR}/environments"
  mkdir -p "$ENV_DIR"

  # ── Minimal schema ──────────────────────────────────────────
  cat > "${ENV_DIR}/schema.yaml" <<'YAML'
version: 1

env_vars:
  - name: PROD_DOMAIN
    required: true
    default_dev: "localhost"
    validate: "^[a-z0-9.-]+$"

  - name: BRAND_NAME
    required: true
    default_dev: "Workspace"

  - name: CONTACT_EMAIL
    required: true
    default_dev: "dev@localhost"
    validate: "^.+@.+$"

secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: KEYCLOAK_ADMIN_PASSWORD
    required: true
    generate: false

setup_vars:
  - name: KC_USER1_USERNAME
    required: true

  - name: KC_USER1_EMAIL
    required: true
    validate: "^.+@.+$"

  - name: KC_USER1_PASSWORD
    required: true
YAML

  # ── Valid dev environment (uses schema defaults) ────────────
  cat > "${ENV_DIR}/dev.yaml" <<'YAML'
environment: dev
context: k3d-dev
domain: localhost

env_vars:
  WEBSITE_IMAGE: workspace-website

secrets_mode: plaintext

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@localhost
  KC_USER1_PASSWORD: devadmin
YAML

  # ── Valid prod environment ──────────────────────────────────
  mkdir -p "${ENV_DIR}/sealed-secrets"
  cat > "${ENV_DIR}/prod.yaml" <<'YAML'
environment: prod
context: prod-cluster
domain: example.de

env_vars:
  PROD_DOMAIN: example.de
  BRAND_NAME: "Example"
  CONTACT_EMAIL: info@example.de

secrets_ref: sealed-secrets/prod.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@example.de
  KC_USER1_PASSWORD: SEALED
YAML

  # Sealed secret file with all required keys
  cat > "${ENV_DIR}/sealed-secrets/prod.yaml" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: workspace-secrets
spec:
  encryptedData:
    SHARED_DB_PASSWORD: AgBsomeencrypteddata==
    KEYCLOAK_ADMIN_PASSWORD: AgBmoreencrypteddata==
YAML

  # ── Env missing a required key ──────────────────────────────
  cat > "${ENV_DIR}/missing-key.yaml" <<'YAML'
environment: missing-key
context: missing-ctx
domain: missing.de

env_vars:
  PROD_DOMAIN: missing.de
  BRAND_NAME: "Missing"

secrets_ref: sealed-secrets/prod.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@missing.de
  KC_USER1_PASSWORD: SEALED
YAML

  # ── Env with invalid regex value ────────────────────────────
  cat > "${ENV_DIR}/bad-regex.yaml" <<'YAML'
environment: bad-regex
context: bad-ctx
domain: bad.de

env_vars:
  PROD_DOMAIN: "INVALID DOMAIN!"
  BRAND_NAME: "Bad"
  CONTACT_EMAIL: not-an-email

secrets_ref: sealed-secrets/prod.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@bad.de
  KC_USER1_PASSWORD: SEALED
YAML

  # ── Env with placeholder values ─────────────────────────────
  cat > "${ENV_DIR}/placeholder.yaml" <<'YAML'
environment: placeholder
context: placeholder-ctx
domain: yourdomain.tld

env_vars:
  PROD_DOMAIN: yourdomain.tld
  BRAND_NAME: "Placeholder"
  CONTACT_EMAIL: info@yourdomain.tld

secrets_ref: sealed-secrets/prod.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@placeholder.de
  KC_USER1_PASSWORD: SEALED
YAML

  # ── Prod env with missing sealed secret file ────────────────
  cat > "${ENV_DIR}/no-sealed.yaml" <<'YAML'
environment: no-sealed
context: no-sealed-ctx
domain: nosealed.de

env_vars:
  PROD_DOMAIN: nosealed.de
  BRAND_NAME: "NoSealed"
  CONTACT_EMAIL: info@nosealed.de

secrets_ref: sealed-secrets/nonexistent.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@nosealed.de
  KC_USER1_PASSWORD: SEALED
YAML

  # ── Sealed secret missing a required key ────────────────────
  mkdir -p "${ENV_DIR}/sealed-secrets"
  cat > "${ENV_DIR}/sealed-secrets/partial.yaml" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: workspace-secrets
spec:
  encryptedData:
    SHARED_DB_PASSWORD: AgBsomeencrypteddata==
YAML

  cat > "${ENV_DIR}/partial-sealed.yaml" <<'YAML'
environment: partial-sealed
context: partial-ctx
domain: partial.de

env_vars:
  PROD_DOMAIN: partial.de
  BRAND_NAME: "Partial"
  CONTACT_EMAIL: info@partial.de

secrets_ref: sealed-secrets/partial.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@partial.de
  KC_USER1_PASSWORD: SEALED
YAML
}

# ── Valid Environments ───────────────────────────────────────────

@test "valid dev environment passes validation" {
  run bash "$SCRIPT" --env dev --env-dir "$ENV_DIR" --schema-only
  assert_success
}

@test "valid prod environment passes schema-only validation" {
  run bash "$SCRIPT" --env prod --env-dir "$ENV_DIR" --schema-only
  assert_success
}

# ── Missing Required Key ────────────────────────────────────────

@test "missing required env_var fails validation" {
  run bash "$SCRIPT" --env missing-key --env-dir "$ENV_DIR" --schema-only
  assert_failure
  assert_output --partial "CONTACT_EMAIL"
}

# ── Regex Validation ────────────────────────────────────────────

@test "env var failing regex validation is rejected" {
  run bash "$SCRIPT" --env bad-regex --env-dir "$ENV_DIR" --schema-only
  assert_failure
  assert_output --partial "PROD_DOMAIN"
}

# ── Placeholder Detection ───────────────────────────────────────

@test "placeholder values are rejected" {
  run bash "$SCRIPT" --env placeholder --env-dir "$ENV_DIR" --schema-only
  assert_failure
  assert_output --partial "yourdomain.tld"
}

# ── Sealed Secret File Missing ──────────────────────────────────

@test "missing sealed secret file fails validation" {
  run bash "$SCRIPT" --env no-sealed --env-dir "$ENV_DIR" --schema-only
  assert_failure
  assert_output --partial "sealed-secrets/nonexistent.yaml"
}

# ── Sealed Secret Missing Key ──────────────────────────────────

@test "sealed secret missing a required key fails validation" {
  run bash "$SCRIPT" --env partial-sealed --env-dir "$ENV_DIR" --schema-only
  assert_failure
  assert_output --partial "KEYCLOAK_ADMIN_PASSWORD"
}

# ── Usage / Edge Cases ──────────────────────────────────────────

@test "script exits with error when no arguments given" {
  run bash "$SCRIPT"
  assert_failure
  assert_output --partial "Usage"
}

@test "script exits with error for nonexistent environment" {
  run bash "$SCRIPT" --env nonexistent --env-dir "$ENV_DIR" --schema-only
  assert_failure
}

# ── Drift Detection ────────────────────────────────────────────

@test "drift detection runs without error on consistent envs" {
  # Create a minimal drift-safe directory with only dev and prod
  local drift_dir="${BATS_TEST_TMPDIR}/drift-envs"
  mkdir -p "$drift_dir/sealed-secrets"
  cp "${ENV_DIR}/schema.yaml" "$drift_dir/"
  cp "${ENV_DIR}/dev.yaml" "$drift_dir/"
  cp "${ENV_DIR}/prod.yaml" "$drift_dir/"
  cp "${ENV_DIR}/sealed-secrets/prod.yaml" "$drift_dir/sealed-secrets/"
  run bash "$SCRIPT" --drift --env-dir "$drift_dir" --schema-only
  assert_success
}
