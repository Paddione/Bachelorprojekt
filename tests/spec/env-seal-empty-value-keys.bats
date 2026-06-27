#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# tests/spec/env-seal-empty-value-keys.bats
# ═══════════════════════════════════════════════════════════════════
# Regression test for G-CD01 root-cause: env-seal.sh silently skips
# keys in extra_namespaces whose plaintext value is empty (or missing
# from the secrets file), instead of either:
#   (a) writing them anyway with empty value (for `required: false` keys), or
#   (b) failing the seal with a clear error (for `required: true` keys).
#
# History (2026-06-27, T001198):
#   The korczewski-website deploy was at 27 % success rate because
#   5 env-from-secret keys (DEEPSEEK_API_KEY*, SEPA_CREDITOR_*) had
#   empty values in environments/.secrets/korczewski.yaml (schema:
#   `required: false, generate: false`) — env-seal.sh silently
#   skipped them, the cluster Secret was incomplete, pods failed with
#   CreateContainerConfigError.
#
#   PR #2124 (T001182) fixed the symptom (cluster repair + drift
#   guard). This test guards the root-cause: the seal script must
#   never silently drop a schema-declared key.
#
# SSOT: openspec/changes/g-cd01-korczewski-secret-drift
#       + follow-up T001198
# ═══════════════════════════════════════════════════════════════════

load 'test_helper'

REPO_ROOT="${PROJECT_DIR}"
SEAL_SCRIPT="${REPO_ROOT}/scripts/env-seal.sh"

# ── Helpers ──────────────────────────────────────────────────────

# Stub kubeseal: take the input Secret manifest on stdin and embed it
# verbatim inside a SealedSecret envelope. This lets the test assert
# on the secret stringData content without needing real encryption.
#
# The input Secret has the form:
#   apiVersion: v1
#   kind: Secret
#   metadata: { name: X, namespace: Y }
#   type: Opaque
#   stringData:
#     KEY1: "value1"
#     KEY2: ""
#
# We wrap it as:
#   ---
#   apiVersion: v1
#   kind: Secret        # ← original input
#   ...
#   ---
#   apiVersion: bitnami.com/v1alpha1
#   kind: SealedSecret
#   ...
#   encryptedData: {}
#
# so the input is preserved in the output file for assertion.
make_kubeseal_stub() {
  local stub_dir="$1"
  cat > "${stub_dir}/kubeseal" <<'STUB'
#!/usr/bin/env bash
# Read input Secret manifest from stdin and echo it back, followed by
# a stub SealedSecret envelope. The real kubeseal would replace the
# Secret with an encrypted SealedSecret; for tests we keep both.
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

# Build a minimal env-seal input set in $1 (work dir):
#   $1/test.yaml            — env file (top-level env config)
#   $1/.secrets/test.yaml   — plaintext secrets file
#   $1/schema.yaml          — schema with extra_namespaces entries
#   $1/certs/test.pem       — empty cert (stub doesn't validate it)
#   $1/sealed-secrets/      — output directory (env-seal writes here)
setup_seal_inputs() {
  local dir="$1"
  local mode="$2"  # "optional-empty" | "required-empty" | "happy"
  mkdir -p "$dir/.secrets" "$dir/certs" "$dir/sealed-secrets"

  # env-seal reads ${env_dir}/${env_name}.yaml — not under .secrets.
  # Must have at least `context:` for the env-seal preflight.
  cat > "$dir/test.yaml" <<'YAML'
environment: test
context: test-cluster
domain: test.local
YAML

  case "$mode" in
    optional-empty)
      # Two extra_namespaces entries: one with value, one optional+empty.
      # The bug: the optional+empty entry's key MUST appear in output
      # with empty value. Currently it is silently dropped.
      cat > "$dir/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: PRESENT_KEY
    required: true
    generate: true
    length: 16
  - name: OPTIONAL_EMPTY_KEY
    required: false
    generate: false
    extra_namespaces:
      - namespace: website-test
        secret: website-secrets
YAML
      cat > "$dir/.secrets/test.yaml" <<'YAML'
PRESENT_KEY: "abc123-real-value"
OPTIONAL_EMPTY_KEY: ""
YAML
      ;;
    required-empty)
      # One entry: required but empty value. The bug: env-seal.sh
      # silently skips (WARNING on stderr, exit 0). Expected behaviour:
      # fail with a clear error message and non-zero exit code.
      cat > "$dir/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: REQUIRED_EMPTY_KEY
    required: true
    generate: false
    extra_namespaces:
      - namespace: website-test
        secret: website-secrets
YAML
      cat > "$dir/.secrets/test.yaml" <<'YAML'
REQUIRED_EMPTY_KEY: ""
YAML
      ;;
    happy)
      cat > "$dir/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: HAPPY_KEY
    required: true
    generate: false
    extra_namespaces:
      - namespace: website-test
        secret: website-secrets
YAML
      cat > "$dir/.secrets/test.yaml" <<'YAML'
HAPPY_KEY: "value-here"
YAML
      ;;
  esac

  : > "$dir/certs/test.pem"
}

# ── Tests ────────────────────────────────────────────────────────

@test "env-seal: optional extra_namespaces key with empty value is included in output (G-CD01 regression)" {
  [ -f "$SEAL_SCRIPT" ] || skip "env-seal.sh not found at $SEAL_SCRIPT"

  local stub_dir="${BATS_TEST_TMPDIR}/kubeseal-stub"
  local work="${BATS_TEST_TMPDIR}/env-seal"
  mkdir -p "$stub_dir"
  make_kubeseal_stub "$stub_dir"
  setup_seal_inputs "$work" "optional-empty"

  # Note: the seal script reads ${env_dir}/${env_name}.yaml (not under
  # .secrets). setup_seal_inputs creates the right structure.
  # --reuse-cert: skip the cert-drift check (we use a stub cert).
  PATH="${stub_dir}:${PATH}" \
    run bash "$SEAL_SCRIPT" --env test --env-dir "$work" --reuse-cert 2>&1 || true

  # The bug: env-seal.sh silently skips the extra_namespaces entry
  # with empty value, so the entire `website-test/website-secrets`
  # SealedSecret is NOT written. After the fix, it MUST be written.
  #
  # We assert on the namespace marker of the extra SealedSecret
  # (the main Secret lives in `${WORKSPACE_NS}` — default `workspace`).
  local output_file="${work}/sealed-secrets/test.yaml"
  [[ -f "$output_file" ]] \
    || { echo "Output file $output_file not created — seal did not run."; \
         echo "run output: $output"; false; }

  # The main Secret has `namespace: workspace`; the extra SealedSecret
  # (after fix) has `namespace: website-test`. With the bug, no
  # website-test resource is written.
  local extra_ns_hits
  extra_ns_hits=$(grep -c 'namespace: website-test' "$output_file" || true)
  [[ "$extra_ns_hits" -ge 1 ]] \
    || { echo "BUG: extra_namespaces SealedSecret (website-test/website-secrets) not in output."; \
         echo "Expected: a Secret/SealedSecret with 'namespace: website-test'."; \
         echo "--- output file content ---"; cat "$output_file"; \
         false; }
}

@test "env-seal: required key with empty value fails seal with non-zero exit (G-CD01 regression)" {
  [ -f "$SEAL_SCRIPT" ] || skip "env-seal.sh not found at $SEAL_SCRIPT"

  local stub_dir="${BATS_TEST_TMPDIR}/kubeseal-stub"
  local work="${BATS_TEST_TMPDIR}/env-seal"
  mkdir -p "$stub_dir"
  make_kubeseal_stub "$stub_dir"
  setup_seal_inputs "$work" "required-empty"

  PATH="${stub_dir}:${PATH}" \
    run bash "$SEAL_SCRIPT" --env test --env-dir "$work" --reuse-cert 2>&1 || true

  # Expected after fix: exit ≠ 0 with a clear error mentioning
  # "required" and the key name. Current bug: exit 0 with a WARNING.
  [[ "$status" -ne 0 ]] \
    || { echo "BUG: required+empty key was silently accepted (exit 0)"; \
         echo "output: $output"; false; }
  echo "$output" | grep -qiE 'required|REQUIRED_EMPTY_KEY' \
    || { echo "BUG: error message does not mention 'required' or the key name"; \
         echo "output: $output"; false; }
}

@test "env-seal: happy path with all required keys present succeeds (regression-guard)" {
  [ -f "$SEAL_SCRIPT" ] || skip "env-seal.sh not found at $SEAL_SCRIPT"

  local stub_dir="${BATS_TEST_TMPDIR}/kubeseal-stub"
  local work="${BATS_TEST_TMPDIR}/env-seal"
  mkdir -p "$stub_dir"
  make_kubeseal_stub "$stub_dir"
  setup_seal_inputs "$work" "happy"

  PATH="${stub_dir}:${PATH}" \
    run bash "$SEAL_SCRIPT" --env test --env-dir "$work" --reuse-cert 2>&1 || true

  # Happy path must continue to work — no regression from the fix.
  [[ "$status" -eq 0 ]] \
    || { echo "REGRESSION: happy path failed (status=$status)"; \
         echo "output: $output"; false; }
  local output_file="${work}/sealed-secrets/test.yaml"
  [[ -f "$output_file" ]] \
    || { echo "REGRESSION: output file $output_file not created"; false; }
  grep -q 'HAPPY_KEY' "$output_file" \
    || { echo "REGRESSION: HAPPY_KEY not in $output_file"; \
         cat "$output_file"; false; }
}
