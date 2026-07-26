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

# ── RED guard: config files must NOT contain plaintext secrets ──────────
# This test is EXPECTED TO FAIL (RED) initially because dotfiles/agy/settings.json
# and dotfiles/opencode/config.json still carry their tokens. After Task 4
# removes the secrets and the SSOT takes over, this test turns GREEN.
# The .claude/settings.json assertion must always be GREEN — it proves the
# test logic is correct and not simply passing by accident.
# [T002214 Task 1]

@test "RED-guard: harness config files contain no secret patterns" {
  local fail=0
  local errors=""

  # ── 1) dotfiles/agy/settings.json ─────────────────────────────────
  local agy="${REPO_ROOT}/dotfiles/agy/settings.json"
  if [ -f "$agy" ]; then
    # Check for known token prefixes in values
    if grep -qE '"(ghp_|github_pat_|sk-|xox)[A-Za-z0-9_\-]{5,}' "$agy" 2>/dev/null; then
      errors="${errors}  ✗ dotfiles/agy/settings.json contains token-prefixed secrets"$'\n'
      fail=1
    fi
  else
    errors="${errors}  ✗ dotfiles/agy/settings.json not found"$'\n'
    fail=1
  fi

  # ── 2) dotfiles/opencode/config.json ──────────────────────────────
  local oc="${REPO_ROOT}/dotfiles/opencode/config.json"
  if [ -f "$oc" ]; then
    # Check for known token prefixes in values
    if grep -qE '"(ghp_|github_pat_|sk-|xox)[A-Za-z0-9_\-]{5,}' "$oc" 2>/dev/null; then
      errors="${errors}  ✗ dotfiles/opencode/config.json contains token-prefixed secrets"$'\n'
      fail=1
    fi
  else
    errors="${errors}  ✗ dotfiles/opencode/config.json not found"$'\n'
    fail=1
  fi

  # ── 3) .claude/settings.json (must ALWAYS be GREEN) ───────────────
  local claude="${REPO_ROOT}/.claude/settings.json"
  if [ -f "$claude" ]; then
    # Check for known token prefixes in values
    if grep -qE '"(ghp_|github_pat_|sk-|xox)[A-Za-z0-9_\-]{5,}' "$claude" 2>/dev/null; then
      errors="${errors}  ✗ .claude/settings.json contains token-prefixed secrets"$'\n'
      fail=1
    fi
    # Also check for env keys ending in _TOKEN/_KEY/_SECRET with value >20 chars
    if jq -e '.env | to_entries[] | select(.key | test("_(TOKEN|KEY|SECRET)$")) | select((.value | length) > 20)' "$claude" >/dev/null 2>&1; then
      errors="${errors}  ✗ .claude/settings.json contains long env secrets"$'\n'
      fail=1
    fi
  fi

  if [ "$fail" -ne 0 ]; then
    echo "RED-guard FAILED — secrets found in config files:" >&2
    echo "$errors" >&2
    echo "" >&2
    echo "  Task 4 will remove these secrets after the SSOT is created." >&2
    echo "  This test is intentionally RED until then." >&2
  fi
  [ "$fail" -eq 0 ]
}
