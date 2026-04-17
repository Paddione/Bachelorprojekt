# Dev Secret Leakage Prevention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four targeted safeguards that prevent dev secrets from reaching production clusters.

**Architecture:** CI catches the structural break (missing `$patch: delete`) before it merges; the deploy script verifies the operator is on the correct cluster; `k3d/secrets.yaml` carries an audit label; `env-seal.sh` refuses to encrypt dev-placeholder values without an explicit override.

**Tech Stack:** bash, BATS (bats-core + bats-assert + bats-support), GitHub Actions, kubectl kustomize, Python 3 (for YAML parsing in CI)

---

## File Map

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Add `validate-prod-secrets` job |
| `Taskfile.yml` | Add context guard to `workspace:deploy` non-dev branch |
| `k3d/secrets.yaml` | Add `labels: environment: dev` to workspace-secrets Secret |
| `scripts/env-seal.sh` | Add dev-value scan + `--force` bypass flag before line 105 |
| `tests/unit/scripts.bats` | Add BATS tests for env-seal dev-value guard |
| `tests/unit/manifests.bats` | Add BATS test for prod overlay workspace-secrets absence |

---

## Task 1: BATS — prod overlay must not contain workspace-secrets Secret

Tests first. The CI job (Task 2) implements the check; this test verifies the same logic locally.

**Files:**
- Modify: `tests/unit/manifests.bats`

- [ ] **Step 1: Write the failing test**

Open `tests/unit/manifests.bats` and append after the last `@test` block:

```bash
@test "prod kustomize output has no workspace-secrets Secret with data" {
  if ! command -v python3 &>/dev/null; then
    skip "python3 not installed"
  fi
  if ! command -v kubectl &>/dev/null; then
    skip "kubectl not installed"
  fi

  run python3 -c "
import subprocess, sys, yaml

overlays = ['${PROJECT_DIR}/prod', '${PROJECT_DIR}/prod-korczewski', '${PROJECT_DIR}/prod-mentolder']
found = []
for overlay in overlays:
    try:
        result = subprocess.run(
            ['kubectl', 'kustomize', overlay],
            capture_output=True, text=True, check=True
        )
    except subprocess.CalledProcessError as e:
        print(f'kustomize build failed for {overlay}: {e.stderr}', file=sys.stderr)
        sys.exit(1)
    for doc in yaml.safe_load_all(result.stdout):
        if not doc:
            continue
        if (doc.get('kind') == 'Secret' and
                doc.get('metadata', {}).get('name') == 'workspace-secrets' and
                (doc.get('stringData') or doc.get('data'))):
            found.append(overlay)
if found:
    print('workspace-secrets Secret with data found in: ' + ', '.join(found))
    sys.exit(1)
print('OK: no workspace-secrets Secret in prod overlays')
"
  assert_success
}
```

- [ ] **Step 2: Run the test to verify it passes (it should — prod is correct now)**

```bash
cd /path/to/Bachelorprojekt
./tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats --filter "prod kustomize"
```

Expected: `ok - prod kustomize output has no workspace-secrets Secret with data`

This test passes now and will fail if `$patch: delete` is ever removed.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/manifests.bats
git commit -m "test: verify prod overlays exclude workspace-secrets Secret"
```

---

## Task 2: CI — validate-prod-secrets job (R1)

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the CI job**

In `.github/workflows/ci.yml`, after the `validate-environments` job block, add:

```yaml
  validate-prod-secrets:
    name: Validate Prod Overlays Have No Dev Secrets
    runs-on: ubuntu-latest
    needs: [validate-manifests]
    steps:
      - uses: actions/checkout@v5

      - name: Install kubectl
        run: |
          curl -sSL "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl

      - name: Create CI dummy secrets
        run: |
          for f in k3d/secrets.yaml k3d/backup-secrets.yaml; do
            if [ ! -f "$f" ]; then
              printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\ntype: Opaque\nstringData:\n  PLACEHOLDER: ci-dummy\n' "$(basename "$f" .yaml)" > "$f"
            fi
          done

      - name: Check prod overlays exclude workspace-secrets Secret
        run: |
          python3 - <<'EOF'
          import subprocess, sys, yaml

          overlays = ['prod', 'prod-korczewski', 'prod-mentolder']
          found = []
          for overlay in overlays:
              result = subprocess.run(
                  ['kubectl', 'kustomize', overlay],
                  capture_output=True, text=True
              )
              if result.returncode != 0:
                  print(f'ERROR: kustomize build failed for {overlay}:\n{result.stderr}', file=sys.stderr)
                  sys.exit(1)
              for doc in yaml.safe_load_all(result.stdout):
                  if not doc:
                      continue
                  if (doc.get('kind') == 'Secret' and
                          doc.get('metadata', {}).get('name') == 'workspace-secrets' and
                          (doc.get('stringData') or doc.get('data'))):
                      found.append(overlay)
          if found:
              print('FAIL: workspace-secrets Secret with data found in overlays: ' + ', '.join(found))
              print('The $patch: delete in prod/kustomization.yaml may have been removed.')
              sys.exit(1)
          print('OK: workspace-secrets Secret absent from all prod overlays')
          EOF
```

- [ ] **Step 2: Verify CI job syntax is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Run the check locally to verify it passes**

```bash
python3 - <<'EOF'
import subprocess, sys, yaml

overlays = ['prod', 'prod-korczewski', 'prod-mentolder']
found = []
for overlay in overlays:
    result = subprocess.run(
        ['kubectl', 'kustomize', overlay],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f'ERROR: kustomize build failed for {overlay}:\n{result.stderr}', file=sys.stderr)
        sys.exit(1)
    for doc in yaml.safe_load_all(result.stdout):
        if not doc:
            continue
        if (doc.get('kind') == 'Secret' and
                doc.get('metadata', {}).get('name') == 'workspace-secrets' and
                (doc.get('stringData') or doc.get('data'))):
            found.append(overlay)
if found:
    print('FAIL: ' + ', '.join(found))
    sys.exit(1)
print('OK: workspace-secrets Secret absent from all prod overlays')
EOF
```

Expected: `OK: workspace-secrets Secret absent from all prod overlays`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add validate-prod-secrets job — assert workspace-secrets absent from prod overlays"
```

---

## Task 3: dev label on k3d/secrets.yaml (R2 audit layer)

**Files:**
- Modify: `k3d/secrets.yaml`

- [ ] **Step 1: Add the label**

In `k3d/secrets.yaml`, find the `metadata:` block for the first Secret (`workspace-secrets`) and add a `labels` stanza:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: workspace-secrets
  labels:
    environment: dev
type: Opaque
stringData:
  ...
```

The file currently looks like:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: workspace-secrets
type: Opaque
```

Change to:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: workspace-secrets
  labels:
    environment: dev
type: Opaque
```

- [ ] **Step 2: Write BATS test for the label**

In `tests/unit/scripts.bats`, append after the last `@test`:

```bash
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
```

- [ ] **Step 3: Run the test**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/scripts.bats --filter "environment: dev label"
```

Expected: `ok - k3d/secrets.yaml workspace-secrets has environment: dev label`

- [ ] **Step 4: Commit**

```bash
git add k3d/secrets.yaml tests/unit/scripts.bats
git commit -m "chore: label k3d/secrets.yaml as environment=dev for audit trail"
```

---

## Task 4: env-seal.sh — dev-value scan before encryption (R4)

**Files:**
- Modify: `scripts/env-seal.sh`
- Modify: `tests/unit/scripts.bats`

- [ ] **Step 1: Write failing BATS tests**

In `tests/unit/scripts.bats`, append after the last `@test`:

```bash
@test "env-seal.sh rejects dev-prefixed values without --force" {
  local tmpdir
  tmpdir="$(mktemp -d)"
  # Write a fake secrets file with a dev-prefixed value
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

@test "env-seal.sh dev-value scan --force bypasses warning" {
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/scripts.bats --filter "env-seal"
```

Expected: all three tests FAIL (function `--_test-dev-scan` not yet implemented)

- [ ] **Step 3: Add `--_test-dev-scan` mode and `--force` flag to env-seal.sh**

In `scripts/env-seal.sh`, replace the argument parsing block and add the scan function.

Find the `# ── Globals` section (around line 16) and add `FORCE=false`:

```bash
ENV_NAME=""
ENV_DIR="environments"
FORCE=false
```

Find the argument parsing `while` loop (around line 56) and add the new flags:

```bash
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)              ENV_NAME="$2"; shift 2 ;;
    --env-dir)          ENV_DIR="$2"; shift 2 ;;
    --force)            FORCE=true; shift ;;
    --_test-dev-scan)   _TEST_SCAN_FILE="$2"; shift 2 ;;
    *)                  echo "Unknown option: $1"; usage ;;
  esac
done
```

After the argument parsing block and before `[[ -z "$ENV_NAME" ]] && die`, add the dev-value scan function and test-mode handler:

```bash
# ── Dev-value scanner ────────────────────────────────────────────

scan_for_dev_values() {
  local secrets_file="$1"
  local dev_keys=()

  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue
    if [[ "$line" =~ ^([A-Za-z0-9_]+):[[:space:]]*[\"\'"]?([^\"\']+) ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      value="${value%\"}"
      value="${value%\'}"
      value="${value// /}"
      if [[ "$value" =~ ^dev[a-zA-Z] ]]; then
        dev_keys+=("$key")
      fi
    fi
  done < "$secrets_file"

  if [[ ${#dev_keys[@]} -gt 0 ]]; then
    echo "WARNING: The following secrets appear to contain dev placeholder values:"
    for k in "${dev_keys[@]}"; do
      echo "  ${k}"
    done
    echo ""
    if [[ "$FORCE" == "true" ]]; then
      echo "WARNING: --force specified, proceeding anyway."
      return 0
    fi
    echo "ERROR: Refusing to seal dev placeholder values."
    echo "Fix the values in ${secrets_file} or re-run with --force to override."
    return 1
  fi
  return 0
}

# ── Test-mode: only run the dev-value scan ───────────────────────

if [[ -n "${_TEST_SCAN_FILE:-}" ]]; then
  if scan_for_dev_values "$_TEST_SCAN_FILE"; then
    echo "OK: no dev placeholder values found"
    exit 0
  else
    exit 1
  fi
fi
```

Finally, find the `# ── Build temporary K8s Secret manifest` section and add the scan call just before it (after the kubeseal check):

```bash
# ── Scan for dev placeholder values ─────────────────────────────

info "Scanning secrets for dev placeholder values..."
if ! scan_for_dev_values "$SECRETS_FILE"; then
  exit 1
fi
info "No dev placeholder values detected."
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/scripts.bats --filter "env-seal"
```

Expected:
```
ok - env-seal.sh rejects dev-prefixed values without --force
ok - env-seal.sh dev-value scan passes with no dev values
ok - env-seal.sh dev-value scan --force bypasses warning
```

- [ ] **Step 5: Verify bash syntax is still clean**

```bash
bash -n scripts/env-seal.sh && echo "syntax OK"
```

Expected: `syntax OK`

- [ ] **Step 6: Commit**

```bash
git add scripts/env-seal.sh tests/unit/scripts.bats
git commit -m "feat(security): env-seal.sh rejects dev placeholder values; add --force override"
```

---

## Task 5: workspace:deploy — context guard for prod envs (R2, R3)

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add the context guard**

In `Taskfile.yml`, find the `workspace:deploy` task's second `cmds` shell block (the one that starts with `source scripts/env-resolve.sh "{{.ENV}}"`). After the `source scripts/env-resolve.sh` line and before the `if [ "{{.ENV}}" = "dev" ]; then` check, add:

```bash
        if [ "{{.ENV}}" != "dev" ]; then
          active_ctx=$(kubectl config current-context 2>/dev/null || echo "")
          if [ "$active_ctx" != "$ENV_CONTEXT" ]; then
            echo ""
            echo "ERROR: kubectl context mismatch"
            echo "  Expected : $ENV_CONTEXT  (from environments/{{.ENV}}.yaml)"
            echo "  Active   : $active_ctx"
            echo ""
            echo "Fix: kubectl config use-context $ENV_CONTEXT"
            exit 1
          fi
        fi
```

The full block should look like:

```bash
      - |
        source scripts/env-resolve.sh "{{.ENV}}"

        if [ "{{.ENV}}" != "dev" ]; then
          active_ctx=$(kubectl config current-context 2>/dev/null || echo "")
          if [ "$active_ctx" != "$ENV_CONTEXT" ]; then
            echo ""
            echo "ERROR: kubectl context mismatch"
            echo "  Expected : $ENV_CONTEXT  (from environments/{{.ENV}}.yaml)"
            echo "  Active   : $active_ctx"
            echo ""
            echo "Fix: kubectl config use-context $ENV_CONTEXT"
            exit 1
          fi
        fi

        if [ "{{.ENV}}" = "dev" ]; then
          # Dev: build from k3d base, apply locally
          kustomize build k3d/ | envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL" | kubectl apply -f -
        else
          ...
```

- [ ] **Step 2: Verify Taskfile.yml is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('Taskfile.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Verify the task dry-run still parses**

```bash
task --dry workspace:deploy 2>&1 | head -5
```

Expected: no parse errors, shows the task commands.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(security): workspace:deploy refuses to deploy if kubectl context != env context"
```

---

## Final: Run full BATS suite

- [ ] **Run all unit tests**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/
```

Expected: all tests pass (no new failures introduced).

- [ ] **Push and verify CI is green**

```bash
git push
```

Watch the `validate-prod-secrets` and existing CI jobs pass on GitHub Actions.
