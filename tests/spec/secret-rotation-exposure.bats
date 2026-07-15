#!/usr/bin/env bats
# tests/spec/secret-rotation-exposure.bats
# Test: Secret rotation after transcript exposure

load 'test_helper'

SECRET_SCRIPT="${PROJECT_DIR}/scripts/secret-rotate.sh"

# Stub kubeseal so the rotation test doesn't need a real cluster / the
# kubeseal binary (absent on the CI runner — see tests/spec/env-seal-empty-value-keys.bats
# for the same pattern). Echoes the input Secret followed by a stub
# SealedSecret envelope; good enough for env-seal.sh's --fetch-cert and
# encrypt calls, both of which only check for non-empty output / exit 0.
make_kubeseal_stub() {
  local stub_dir="$1"
  cat > "${stub_dir}/kubeseal" <<'STUB'
#!/usr/bin/env bash
if [[ "$*" == *"--fetch-cert"* ]]; then
  echo "STUB_CERTIFICATE"
  exit 0
fi
cat
cat <<'ENVELOPE'
---
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: stub-envelope
  namespace: stub
spec:
  encryptedData: {}
ENVELOPE
STUB
  chmod +x "${stub_dir}/kubeseal"
}

@test "secret-rotate.sh does not rotate secrets when exposed (BUG: requires --force)" {
  local env_dir="${BATS_TEST_TMPDIR}/test-env"
  mkdir -p "${env_dir}" "${env_dir}/.secrets"
  
  cat > "${env_dir}/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
context: fleet
workspace_namespace: workspace
website_namespace: website
YAML

  echo "SHARED_DB_PASSWORD: old-secret-value-xyz" > "${env_dir}/.secrets/testenv.yaml"
  
  # Create environment file (required by env-seal.sh)
  cat > "${env_dir}/testenv.yaml" <<'YAML'
name: testenv
context: fleet
workspace_namespace: workspace
website_namespace: website
YAML
  
  # Run secret rotation WITHOUT --force (should fail because secrets already exist)
  run bash "$SECRET_SCRIPT" --env testenv --env-dir "$env_dir"
  
  [ "$status" -ne 0 ] || {
    echo "expected: FAIL (rotation should not happen automatically)"
    exit 1
  }
}

@test "secret-rotate.sh rotates secrets for environment on exposure trigger (--force)" {
  local env_dir="${BATS_TEST_TMPDIR}/test-env"
  mkdir -p "${env_dir}" "${env_dir}/.secrets"
  
  cat > "${env_dir}/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
context: fleet
workspace_namespace: workspace
website_namespace: website
YAML

  cat > "${env_dir}/testenv.yaml" <<'YAML'
name: testenv
context: fleet
workspace_namespace: workspace
website_namespace: website
YAML

  echo "SHARED_DB_PASSWORD: old-secret-value-xyz" > "${env_dir}/.secrets/testenv.yaml"

  local stub_dir="${BATS_TEST_TMPDIR}/kubeseal-stub"
  mkdir -p "$stub_dir"
  make_kubeseal_stub "$stub_dir"

  # Run secret rotation WITH --force to trigger rotation (fix implementation)
  PATH="${stub_dir}:${PATH}" \
    run bash "$SECRET_SCRIPT" --env testenv --env-dir "$env_dir" --force
  
  [ "$status" -eq 0 ] || {
    echo "expected: FAIL (rotation should succeed with --force)"
    exit 1
  }
  
  # Verify new secrets were generated with different values
  local new_value
  new_value=$(grep "^SHARED_DB_PASSWORD:" "${env_dir}/.secrets/testenv.yaml" | cut -d':' -f2)
  
  [[ "$new_value" != "old-secret-value-xyz" ]] || {
    echo "expected: FAIL (secret value should be different)"
    exit 1
  }
  
  # Verify sealed secret was updated
  [[ -f "${env_dir}/sealed-secrets/testenv.yaml" ]] || {
    echo "expected: FAIL (sealed secret not created)"
    exit 1
  }
}
