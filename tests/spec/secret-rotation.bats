#!/usr/bin/env bats
# tests/spec/secret-rotation.bats
# SSOT: openspec/specs/secret-rotation.md
# Uses simple [ ... ] assertions (matches tests/spec/* convention — bats-assert
# is not loaded by tests/spec/test_helper.bash).

load 'test_helper'

SEAL_SCRIPT="${PROJECT_DIR}/scripts/env-seal.sh"
GEN_SCRIPT="${PROJECT_DIR}/scripts/env-generate.sh"

@test "env-seal: dev-prefixed value is rejected without --force" {
  local scan_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  cat > "$scan_file" <<'YAML'
SHARED_DB_PASSWORD: "devpassword123"
BOTS_TOKEN: "real-token-here"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dev-scan "$scan_file"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "SHARED_DB_PASSWORD"
}

@test "env-seal: _placeholder suffix is rejected" {
  local scan_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  cat > "$scan_file" <<'YAML'
SMTP_PASSWORD: "smtp_dev_placeholder"
REAL_KEY: "actual-value-abc123"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dev-scan "$scan_file"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "SMTP_PASSWORD"
}

@test "env-seal: clean secrets file passes dev-value scan" {
  local scan_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  cat > "$scan_file" <<'YAML'
SHARED_DB_PASSWORD: "X7k9mQ2vLpR4sN1wE8hA3uG6tB5cF0dJ"
SMTP_PASSWORD: "real-smtp-secret-value-42"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dev-scan "$scan_file"
  [ "$status" -eq 0 ]
}

@test "env-seal: MANAGED_EXTERNALLY is rejected" {
  local scan_file="${BATS_TEST_TMPDIR}/secrets.yaml"
  cat > "$scan_file" <<'YAML'
LLM_API_KEY: "MANAGED_EXTERNALLY"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dev-scan "$scan_file"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "LLM_API_KEY"
}

@test "env-seal: duplicate keys in secrets file are rejected" {
  local dup_file="${BATS_TEST_TMPDIR}/secrets_dup.yaml"
  cat > "$dup_file" <<'YAML'
SHARED_DB_PASSWORD: "first-value"
SMTP_PASSWORD: "some-value"
SHARED_DB_PASSWORD: "second-value-oops"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dup-check "$dup_file"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "SHARED_DB_PASSWORD"
}

@test "env-seal: unique keys pass duplicate check" {
  local dup_file="${BATS_TEST_TMPDIR}/secrets_ok.yaml"
  cat > "$dup_file" <<'YAML'
SHARED_DB_PASSWORD: "unique-value-1"
SMTP_PASSWORD: "unique-value-2"
BOTS_TOKEN: "unique-value-3"
YAML

  run bash "$SEAL_SCRIPT" --env _noexist --_test-dup-check "$dup_file"
  [ "$status" -eq 0 ]
}

@test "env-seal: identical certs pass fingerprint check" {
  local cert_a="${BATS_TEST_TMPDIR}/cert-a.pem"
  local cert_b="${BATS_TEST_TMPDIR}/cert-b.pem"
  echo "-----BEGIN CERTIFICATE-----" > "$cert_a"
  echo "MIIFakeCert==" >> "$cert_a"
  echo "-----END CERTIFICATE-----" >> "$cert_a"
  cp "$cert_a" "$cert_b"

  run bash "$SEAL_SCRIPT" --env _noexist --_test-cert-compare "$cert_a" "$cert_b"
  [ "$status" -eq 0 ]
}

@test "env-seal: differing certs fail fingerprint check with drift message" {
  local cert_a="${BATS_TEST_TMPDIR}/cert-a.pem"
  local cert_b="${BATS_TEST_TMPDIR}/cert-b.pem"
  echo "-----BEGIN CERTIFICATE-----" > "$cert_a"
  echo "Cert-A-Content==" >> "$cert_a"
  echo "-----END CERTIFICATE-----" >> "$cert_a"
  echo "-----BEGIN CERTIFICATE-----" > "$cert_b"
  echo "Cert-B-DIFFERENT==" >> "$cert_b"
  echo "-----END CERTIFICATE-----" >> "$cert_b"

  run bash "$SEAL_SCRIPT" --env _noexist --_test-cert-compare "$cert_a" "$cert_b"
  [ "$status" -ne 0 ]
}

@test "env-generate: refuses to overwrite existing secrets file" {
  local env_dir="${BATS_TEST_TMPDIR}/environments"
  mkdir -p "${env_dir}/.secrets"
  cat > "${env_dir}/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
YAML
  echo "SHARED_DB_PASSWORD: existing-value" > "${env_dir}/.secrets/testenv.yaml"

  run bash "$GEN_SCRIPT" --env testenv --env-dir "$env_dir"
  [ "$status" -ne 0 ]
  grep -q "existing-value" "${env_dir}/.secrets/testenv.yaml"
}
