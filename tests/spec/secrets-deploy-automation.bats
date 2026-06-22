#!/usr/bin/env bats
# tests/spec/secrets-deploy-automation.bats
# SSOT: openspec/specs/secrets-deploy-automation.md
# Uses simple [ ... ] assertions (matches tests/spec/* convention).

load 'test_helper'

SEAL_SCRIPT="${PROJECT_DIR}/scripts/env-seal.sh"
REPO_ROOT="${PROJECT_DIR}"

@test "prod/kustomization.yaml contains patch:delete for workspace-secrets" {
  run grep -cE 'patch.*delete|delete.*patch|\$patch.*delete' "${REPO_ROOT}/prod/kustomization.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "env-seal: required key missing from sealed file is detected" {
  local schema_file="${BATS_TEST_TMPDIR}/schema.yaml"
  local sealed_file="${BATS_TEST_TMPDIR}/sealed.yaml"
  local env_file="${BATS_TEST_TMPDIR}/env.yaml"

  cat > "$schema_file" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
  - name: SMTP_PASSWORD
    required: true
    generate: true
    length: 32
YAML

  cat > "$sealed_file" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
spec:
  encryptedData:
    SHARED_DB_PASSWORD: "AgBCDEFGH..."
YAML

  echo "{}" > "$env_file"

  run bash "$SEAL_SCRIPT" --env _noexist \
    --_test-completeness "$sealed_file" \
    --_test-schema "$schema_file" \
    --_test-env-file "$env_file"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "SMTP_PASSWORD"
}

@test "env-seal: completeness check format is the secrets-file (KEY: value)" {
  local schema_file="${BATS_TEST_TMPDIR}/schema.yaml"
  local secrets_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  local env_file="${BATS_TEST_TMPDIR}/env.yaml"

  cat > "$schema_file" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
YAML

  cat > "$secrets_file" <<'YAML'
SHARED_DB_PASSWORD: "real-value-abc"
YAML

  echo "{}" > "$env_file"

  run bash "$SEAL_SCRIPT" --env _noexist \
    --_test-completeness "$secrets_file" \
    --_test-schema "$schema_file" \
    --_test-env-file "$env_file"
  [ "$status" -eq 0 ]
}

@test "env-seal: completeness check passes when all required keys are present" {
  local schema_file="${BATS_TEST_TMPDIR}/schema.yaml"
  local secrets_file="${BATS_TEST_TMPDIR}/secrets_complete.yaml"
  local env_file="${BATS_TEST_TMPDIR}/env.yaml"

  cat > "$schema_file" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
YAML

  cat > "$secrets_file" <<'YAML'
SHARED_DB_PASSWORD: "real-value-X7k9mQ2v"
YAML

  echo "{}" > "$env_file"

  run bash "$SEAL_SCRIPT" --env _noexist \
    --_test-completeness "$secrets_file" \
    --_test-schema "$schema_file" \
    --_test-env-file "$env_file"
  [ "$status" -eq 0 ]
}

@test "sealed-secrets/mentolder.yaml exists and has encryptedData" {
  local sealed="${REPO_ROOT}/environments/sealed-secrets/mentolder.yaml"
  if [ ! -f "$sealed" ]; then
    skip "mentolder sealed-secrets not found (env not sealed yet)"
  fi
  run grep -c "encryptedData" "$sealed"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "sealed-secrets/korczewski.yaml exists and has encryptedData" {
  local sealed="${REPO_ROOT}/environments/sealed-secrets/korczewski.yaml"
  if [ ! -f "$sealed" ]; then
    skip "korczewski sealed-secrets not found (env not sealed yet)"
  fi
  run grep -c "encryptedData" "$sealed"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
