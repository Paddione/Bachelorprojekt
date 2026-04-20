#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# scripts.bats — Validate scripts for syntax & basic behavior
# ═══════════════════════════════════════════════════════════════════
# Tests that scripts are syntactically correct, have proper shebangs,
# and handle --help / missing-args gracefully. No cluster required.
# ═══════════════════════════════════════════════════════════════════

load test_helper

# ── Syntax Validation ────────────────────────────────────────────

@test "all scripts/*.sh pass bash syntax check" {
  local failures=()
  for f in "${PROJECT_DIR}"/scripts/*.sh; do
    [[ -f "$f" ]] || continue
    if ! bash -n "$f" 2>/dev/null; then
      failures+=("$(basename "$f")")
    fi
  done
  if (( ${#failures[@]} > 0 )); then
    echo "Syntax errors in: ${failures[*]}"
    return 1
  fi
}

@test "all tests/lib/*.sh pass bash syntax check" {
  local failures=()
  for f in "${PROJECT_DIR}"/tests/lib/*.sh; do
    [[ -f "$f" ]] || continue
    if ! bash -n "$f" 2>/dev/null; then
      failures+=("$(basename "$f")")
    fi
  done
  if (( ${#failures[@]} > 0 )); then
    echo "Syntax errors in: ${failures[*]}"
    return 1
  fi
}

@test "all tests/local/*.sh pass bash syntax check" {
  local failures=()
  for f in "${PROJECT_DIR}"/tests/local/*.sh; do
    [[ -f "$f" ]] || continue
    if ! bash -n "$f" 2>/dev/null; then
      failures+=("$(basename "$f")")
    fi
  done
  if (( ${#failures[@]} > 0 )); then
    echo "Syntax errors in: ${failures[*]}"
    return 1
  fi
}

# ── Shebang Lines ───────────────────────────────────────────────

@test "all scripts have proper shebang" {
  local missing=()
  for f in "${PROJECT_DIR}"/scripts/*.sh; do
    [[ -f "$f" ]] || continue
    local first_line
    first_line=$(head -1 "$f")
    if [[ "$first_line" != "#!/"* ]]; then
      missing+=("$(basename "$f")")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    echo "Missing shebang: ${missing[*]}"
    return 1
  fi
}

# ── Test Runner ──────────────────────────────────────────────────

@test "runner.sh prints usage on --help" {
  run bash "${PROJECT_DIR}/tests/runner.sh" --help
  assert_success
  assert_output --partial "Usage"
}

@test "runner.sh exits non-zero without arguments" {
  run bash "${PROJECT_DIR}/tests/runner.sh"
  assert_failure
  assert_output --partial "Tier required"
}

# ── Taskfile ─────────────────────────────────────────────────────

@test "Taskfile.yml is valid YAML" {
  python3 -c "import yaml; yaml.safe_load(open('${PROJECT_DIR}/Taskfile.yml'))"
}

@test "Taskfile.yml declares version 3" {
  grep -q 'version: "3"' "${PROJECT_DIR}/Taskfile.yml"
}

# ── Config Files ─────────────────────────────────────────────────

@test "realm-workspace-dev.json is valid JSON" {
  python3 -c "import json; json.load(open('${PROJECT_DIR}/k3d/realm-workspace-dev.json'))"
}

@test "nextcloud-oidc-dev.php has valid PHP syntax" {
  if command -v php &>/dev/null; then
    run php -l "${PROJECT_DIR}/k3d/nextcloud-oidc-dev.php"
    assert_success
  else
    skip "php not installed"
  fi
}

@test "kustomization.yaml is valid YAML" {
  python3 -c "import yaml; yaml.safe_load(open('${PROJECT_DIR}/k3d/kustomization.yaml'))"
}

# ── Kustomization References ────────────────────────────────────

@test "all resources in kustomization.yaml exist as files" {
  # secrets.yaml is gitignored (dev-only, created locally or by CI)
  local KNOWN_GENERATED=("secrets.yaml")
  local missing=()
  local resources
  resources=$(python3 -c "
import yaml
with open('${PROJECT_DIR}/k3d/kustomization.yaml') as f:
    data = yaml.safe_load(f)
for r in data.get('resources', []):
    print(r)
")
  while IFS= read -r res; do
    [[ -z "$res" ]] && continue
    if [[ ! -f "${PROJECT_DIR}/k3d/${res}" ]]; then
      local known=false
      for g in "${KNOWN_GENERATED[@]}"; do
        [[ "$res" == "$g" ]] && known=true && break
      done
      [[ "$known" == "false" ]] && missing+=("$res")
    fi
  done <<< "$resources"
  if (( ${#missing[@]} > 0 )); then
    echo "Missing resource files: ${missing[*]}"
    return 1
  fi
}

@test "all configMapGenerator source files exist" {
  local missing=()
  # Extract file references from configMapGenerator
  local files
  files=$(python3 -c "
import yaml
with open('${PROJECT_DIR}/k3d/kustomization.yaml') as f:
    data = yaml.safe_load(f)
for gen in data.get('configMapGenerator', []):
    for fref in gen.get('files', []):
        # Format: key=value or just filename
        src = fref.split('=')[-1]
        print(src)
")
  while IFS= read -r src; do
    [[ -z "$src" ]] && continue
    if [[ ! -f "${PROJECT_DIR}/k3d/${src}" ]]; then
      missing+=("$src")
    fi
  done <<< "$files"
  if (( ${#missing[@]} > 0 )); then
    echo "Missing configMap source files: ${missing[*]}"
    return 1
  fi
}

# ── Dry-run: key tasks parse without errors ──────────────────────

@test "task --dry workspace:validate parses successfully" {
  if ! command -v task &>/dev/null; then
    skip "task (go-task) not installed"
  fi
  cd "$PROJECT_DIR"
  run task --dry workspace:validate
  assert_success
}

@test "task --dry workspace:status parses successfully" {
  if ! command -v task &>/dev/null; then
    skip "task (go-task) not installed"
  fi
  cd "$PROJECT_DIR"
  run task --dry workspace:status
  assert_success
}

@test "task --dry workspace:deploy parses successfully" {
  if ! command -v task &>/dev/null; then
    skip "task (go-task) not installed"
  fi
  cd "$PROJECT_DIR"
  run task --dry workspace:deploy
  assert_success
}

@test "k3d/secrets.yaml workspace-secrets has environment: dev label" {
  run python3 -c "
import yaml
with open('${PROJECT_DIR}/k3d/secrets.yaml') as f:
    docs = list(yaml.safe_load_all(f))
ws = next((d for d in docs if d and d.get('metadata', {}).get('name') == 'workspace-secrets'), None)
assert ws is not None, 'workspace-secrets not found'
labels = ws.get('metadata', {}).get('labels', {})
assert labels.get('environment') == 'dev', f'expected environment=dev, got: {labels}'
print('OK')
"
  assert_success
  assert_output "OK"
}

@test "env-seal.sh rejects dev-prefixed values without --force" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/mysecrets.yaml" <<'YAML'
KEYCLOAK_DB_PASSWORD: "devkeycloakdb"
NEXTCLOUD_DB_PASSWORD: "realpassword123"
YAML

  run bash "${PROJECT_DIR}/scripts/env-seal.sh" --_test-dev-scan "${tmpdir}/mysecrets.yaml"
  assert_failure
  assert_output --partial "dev placeholder"
  assert_output --partial "KEYCLOAK_DB_PASSWORD"
  rm -rf "$tmpdir"
}

@test "env-seal.sh dev-value scan passes with no dev values" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/mysecrets.yaml" <<'YAML'
KEYCLOAK_DB_PASSWORD: "xR7kP9mQ2nL5vB3h"
NEXTCLOUD_DB_PASSWORD: "realpassword123"
YAML

  run bash "${PROJECT_DIR}/scripts/env-seal.sh" --_test-dev-scan "${tmpdir}/mysecrets.yaml"
  assert_success
  assert_output --partial "OK"
  rm -rf "$tmpdir"
}

@test "env-seal.sh dev-value scan --force bypasses and warns" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/mysecrets.yaml" <<'YAML'
KEYCLOAK_DB_PASSWORD: "devkeycloakdb"
YAML

  run bash "${PROJECT_DIR}/scripts/env-seal.sh" --_test-dev-scan "${tmpdir}/mysecrets.yaml" --force
  assert_success
  assert_output --partial "WARNING"
  rm -rf "$tmpdir"
}

@test "env-seal.sh rejects _dev_placeholder suffix values" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/mysecrets.yaml" <<'YAML'
GITHUB_PAT: "ghp_dev_placeholder"
YAML

  run bash "${PROJECT_DIR}/scripts/env-seal.sh" --_test-dev-scan "${tmpdir}/mysecrets.yaml"
  assert_failure
  assert_output --partial "dev placeholder"
  assert_output --partial "GITHUB_PAT"
  rm -rf "$tmpdir"
}

@test "env-seal.sh rejects _placeholder suffix values" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/mysecrets.yaml" <<'YAML'
STRIPE_SECRET_KEY: "sk_test_dev_placeholder"
YAML

  run bash "${PROJECT_DIR}/scripts/env-seal.sh" --_test-dev-scan "${tmpdir}/mysecrets.yaml"
  assert_failure
  assert_output --partial "dev placeholder"
  rm -rf "$tmpdir"
}

@test "env-seal.sh rejects not-configured values" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/mysecrets.yaml" <<'YAML'
GITLAB_APP_ID: "not-configured"
YAML

  run bash "${PROJECT_DIR}/scripts/env-seal.sh" --_test-dev-scan "${tmpdir}/mysecrets.yaml"
  assert_failure
  assert_output --partial "dev placeholder"
  assert_output --partial "GITLAB_APP_ID"
  rm -rf "$tmpdir"
}

@test "env-seal.sh rejects MANAGED_EXTERNALLY values" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/mysecrets.yaml" <<'YAML'
KEYCLOAK_ADMIN_PASSWORD: "MANAGED_EXTERNALLY"
YAML

  run bash "${PROJECT_DIR}/scripts/env-seal.sh" --_test-dev-scan "${tmpdir}/mysecrets.yaml"
  assert_failure
  assert_output --partial "dev placeholder"
  assert_output --partial "KEYCLOAK_ADMIN_PASSWORD"
  rm -rf "$tmpdir"
}

@test "env-seal.sh rejects empty values" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/mysecrets.yaml" <<'YAML'
SMTP_PASSWORD: ""
YAML

  run bash "${PROJECT_DIR}/scripts/env-seal.sh" --_test-dev-scan "${tmpdir}/mysecrets.yaml"
  assert_failure
  assert_output --partial "SMTP_PASSWORD"
  rm -rf "$tmpdir"
}
