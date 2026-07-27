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

# ═══════════════════════════════════════════════════════════════════
# T002254 — Flux-Bootstrap-Secrets im Secret-SSOT
# extra_namespaces: `type`, dockerconfigjson-Builder, `output_file`
# ═══════════════════════════════════════════════════════════════════

SEAL_LIB="${PROJECT_DIR}/scripts/lib/seal-extra-namespaces.sh"

# Source the sealer library standalone (env-seal.sh provides die/info at
# runtime; stub them so the pure build functions are testable offline).
load_seal_lib() {
  die() { echo "DIE: $*" >&2; return 1; }
  info() { :; }
  # shellcheck source=../../scripts/lib/seal-extra-namespaces.sh
  source "$SEAL_LIB"
}

# Stub kubeseal: wrap the input manifest verbatim in a SealedSecret envelope.
seal_stub_dir() {
  local d="${BATS_TEST_TMPDIR}/stub"
  mkdir -p "$d"
  cat > "${d}/kubeseal" <<'STUB'
#!/usr/bin/env bash
cat
echo "kind: SealedSecret"
STUB
  chmod +x "${d}/kubeseal"
  echo "$d"
}

@test "seal lib: extra_namespaces entry without type defaults to Opaque" {
  load_seal_lib
  local secrets="${BATS_TEST_TMPDIR}/s.yaml"
  echo 'SOME_TOKEN: "plain-value"' > "$secrets"
  local out="${BATS_TEST_TMPDIR}/m-opaque.yaml"

  build_secret_manifest "$out" "flux-system" "some-secret" \
    "SOME_TOKEN:=:token:=:false:=:-:=:-" "$secrets" ""
  grep -q '^type: Opaque$' "$out"
  grep -q 'token: "plain-value"' "$out"
}

@test "seal lib: schema type is passed through to the manifest" {
  load_seal_lib
  local secrets="${BATS_TEST_TMPDIR}/s.yaml"
  echo 'SOME_TOKEN: "plain-value"' > "$secrets"
  local out="${BATS_TEST_TMPDIR}/m-typed.yaml"

  build_secret_manifest "$out" "flux-system" "ghcr-auth" \
    "SOME_TOKEN:=:token:=:false:=:-:=:-" "$secrets" "" \
    "kubernetes.io/dockerconfigjson"
  grep -q '^type: kubernetes.io/dockerconfigjson$' "$out"
}

@test "seal lib: dockerconfigjson is assembled from username and token" {
  load_seal_lib
  local secrets="${BATS_TEST_TMPDIR}/s.yaml"
  cat > "$secrets" <<'YAML'
GHCR_USERNAME: "test-user"
GHCR_PAT: "test-token-42"
YAML
  local out="${BATS_TEST_TMPDIR}/m-dcj.yaml"

  build_secret_manifest "$out" "flux-system" "ghcr-auth" \
    "GHCR_PAT:=:.dockerconfigjson:=:false:=:ghcr.io:=:GHCR_USERNAME" \
    "$secrets" "" "kubernetes.io/dockerconfigjson"

  local expect
  expect=$(printf '%s' 'test-user:test-token-42' | base64 | tr -d '\n')
  grep -q "{\"auths\":{\"ghcr.io\":{\"auth\":\"${expect}\"}}}" "$out"
  # Gegenprobe: der rohe Token darf nicht unverpackt im Manifest stehen.
  ! grep -q 'test-token-42' "$out"
}

@test "seal lib: output_file routes documents away from the collected file" {
  load_seal_lib
  local work="${BATS_TEST_TMPDIR}/routed"
  mkdir -p "$work"
  local secrets="${work}/s.yaml" schema="${work}/schema.yaml"
  local collected="${work}/collected.yaml" cert="${work}/c.pem"
  : > "$collected"; : > "$cert"
  cat > "$secrets" <<'YAML'
GHCR_USERNAME: "test-user"
GHCR_PAT: "test-token-42"
FLUX_WEBHOOK_TOKEN: "webhook-token-42"
OTHER_KEY: "other-value"
YAML
  cat > "$schema" <<'YAML'
version: 1
secrets:
  - name: GHCR_PAT
    required: false
    extra_namespaces:
      - namespace: flux-system
        secret: ghcr-auth
        type: kubernetes.io/dockerconfigjson
        registry: ghcr.io
        username_key: GHCR_USERNAME
        dest_key: .dockerconfigjson
        output_file: bootstrap/ghcr-auth-sealedsecret.yaml
  - name: FLUX_WEBHOOK_TOKEN
    required: false
    extra_namespaces:
      - namespace: flux-system
        secret: flux-webhook-token
        dest_key: token
        output_file: bootstrap/flux-webhook-token-sealedsecret.yaml
  - name: OTHER_KEY
    required: false
    extra_namespaces:
      - namespace: website
        secret: website-secrets
YAML

  ENV_NAME=mentolder ENV_FILE="${work}/none.yaml" \
  SEAL_OUTPUT_ROOT="$work" PATH="$(seal_stub_dir):${PATH}" \
    seal_extra_namespace_secrets "$schema" "$secrets" "$cert" "$collected"

  [ -f "${work}/bootstrap/ghcr-auth-sealedsecret.yaml" ]
  [ -f "${work}/bootstrap/flux-webhook-token-sealedsecret.yaml" ]
  grep -q 'name: ghcr-auth' "${work}/bootstrap/ghcr-auth-sealedsecret.yaml"
  grep -q 'task env:seal ENV=mentolder' "${work}/bootstrap/ghcr-auth-sealedsecret.yaml"
  # Die Sammeldatei enthält nur das Mapping ohne output_file.
  ! grep -q 'flux-system' "$collected"
  grep -q 'name: website-secrets' "$collected"
}

@test "seal lib: empty source keys leave the output_file untouched" {
  load_seal_lib
  local work="${BATS_TEST_TMPDIR}/guard"
  mkdir -p "${work}/bootstrap"
  local secrets="${work}/s.yaml" schema="${work}/schema.yaml"
  local collected="${work}/collected.yaml" cert="${work}/c.pem"
  local target="${work}/bootstrap/flux-webhook-token-sealedsecret.yaml"
  : > "$collected"; : > "$cert"
  echo "LIVE-CIPHERTEXT-MUST-SURVIVE" > "$target"
  echo 'FLUX_WEBHOOK_TOKEN: ""' > "$secrets"
  cat > "$schema" <<'YAML'
version: 1
secrets:
  - name: FLUX_WEBHOOK_TOKEN
    required: false
    extra_namespaces:
      - namespace: flux-system
        secret: flux-webhook-token
        dest_key: token
        output_file: bootstrap/flux-webhook-token-sealedsecret.yaml
YAML

  ENV_NAME=mentolder ENV_FILE="${work}/none.yaml" \
  SEAL_OUTPUT_ROOT="$work" PATH="$(seal_stub_dir):${PATH}" \
    seal_extra_namespace_secrets "$schema" "$secrets" "$cert" "$collected"

  grep -q 'LIVE-CIPHERTEXT-MUST-SURVIVE' "$target"
}

@test "schema: flux-system mappings are owned by mentolder only" {
  local schema="${PROJECT_DIR}/environments/schema.yaml"
  [ -f "$schema" ] || skip "environments/schema.yaml not found"

  python3 - "$schema" <<'PY'
import sys, yaml
with open(sys.argv[1]) as f:
    schema = yaml.safe_load(f) or {}
seen = {}
for entry in schema.get("secrets") or []:
    for m in entry.get("extra_namespaces") or []:
        if m.get("namespace") != "flux-system":
            continue
        assert [str(b).lower() for b in m.get("owner_brand") or []] == ["mentolder"], \
            f"{entry['name']} → flux-system needs owner_brand: [mentolder]"
        assert m.get("output_file"), f"{entry['name']} → flux-system needs output_file"
        seen[m["secret"]] = m["output_file"]
for name in ("ghcr-auth", "flux-webhook-token"):
    assert name in seen, f"schema does not map flux-system/{name}"
    assert seen[name].startswith("flux/clusters/fleet/bootstrap/"), seen[name]
PY
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
