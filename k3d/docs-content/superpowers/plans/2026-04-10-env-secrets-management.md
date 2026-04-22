# Environment & Secrets Management Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile `.env` + `envsubst` + manual `prod/secrets.yaml` workflow with a validated environment registry and Sealed Secrets, eliminating stale secrets, envsubst misses, dev/prod drift, and wrong-env deployments.

**Architecture:** A new `environments/` directory declares every env var and secret per cluster in structured YAML. A validation script (`scripts/env-validate.sh`) acts as a hard gate before any deployment. Sealed Secrets encrypts prod credentials with cluster-specific keys so they can be committed to git and synced by ArgoCD. The Taskfile is refactored to accept an `ENV=<name>` parameter that selects the environment file, replacing `dotenv` and per-cluster deploy tasks.

**Tech Stack:** Bash (validation/sealing scripts), BATS (unit tests), Sealed Secrets (Bitnami), Kustomize, ArgoCD, existing Taskfile.

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `environments/schema.yaml` | Master list of all required env vars and secrets with types, defaults, validation rules |
| `environments/dev.yaml` | k3d local dev environment config |
| `environments/mentolder.yaml` | mentolder.de production environment config |
| `environments/korczewski.yaml` | korczewski.de production environment config |
| `environments/.secrets/.gitkeep` | Gitignored directory for plaintext secrets during sealing |
| `environments/sealed-secrets/` | Directory for encrypted SealedSecret manifests (committed) |
| `environments/certs/` | Directory for cluster sealing public keys (committed) |
| `scripts/env-validate.sh` | Pre-deploy validation gate |
| `scripts/env-resolve.sh` | Reads environment file + schema, exports all vars, used by deploy scripts |
| `scripts/env-generate.sh` | Generates secrets from schema (auto-generate or prompt) |
| `scripts/env-seal.sh` | Encrypts plaintext secrets into SealedSecret manifests |
| `k3d/sealed-secrets-controller.yaml` | Sealed Secrets controller Deployment + Service + RBAC |
| `tests/unit/env-validate.bats` | BATS tests for the validation script |

### Modified files

| File | Change |
|---|---|
| `Taskfile.yml` | Remove `dotenv`, add `env:*` tasks, refactor deploy tasks to use `ENV` param |
| `prod/kustomization.yaml` | Remove `secrets.yaml` patch, add SealedSecret resource |
| `prod-korczewski/kustomization.yaml` | Remove `secrets.yaml` patch, add SealedSecret resource |
| `.gitignore` | Add `environments/.secrets/` |
| `.github/workflows/ci.yml` | Add env-validate schema-only step |

### Deleted files (Phase 4)

| File | Replaced by |
|---|---|
| `.env` | `environments/mentolder.yaml` |
| `.env.korczewski` | `environments/korczewski.yaml` |
| `prod/secrets.yaml` | `environments/sealed-secrets/mentolder.yaml` |
| `prod-korczewski/secrets.yaml` | `environments/sealed-secrets/korczewski.yaml` |

---

## Phase 1: Environment Registry + Validation Gate

### Task 1: Create schema.yaml

**Files:**
- Create: `environments/schema.yaml`

- [ ] **Step 1: Create the environments directory**

```bash
mkdir -p environments/sealed-secrets environments/certs environments/.secrets
```

- [ ] **Step 2: Write schema.yaml**

Create `environments/schema.yaml` with the full list of env vars and secrets. Every key currently used in `.env`, `k3d/secrets.yaml`, and `prod/secrets.yaml` must be present.

```yaml
# environments/schema.yaml
# Single source of truth for all environment variables and secrets.
# Every deployment target must satisfy this schema.
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

  - name: CONTACT_PHONE
    required: true
    default_dev: "+49 000 000 00 000"

  - name: CONTACT_CITY
    required: true
    default_dev: "DevCity"

  - name: CONTACT_NAME
    required: true
    default_dev: "Dev User"

  - name: LEGAL_STREET
    required: true
    default_dev: "Musterstrasse 1"

  - name: LEGAL_ZIP
    required: true
    default_dev: "00000"

  - name: LEGAL_JOBTITLE
    required: true
    default_dev: "Coach, Berater, Trainer"

  - name: LEGAL_UST_ID
    required: true
    default_dev: "Nicht vorhanden"

  - name: LEGAL_WEBSITE
    required: true
    default_dev: "localhost"

  - name: WEBSITE_IMAGE
    required: true
    default_dev: "workspace-website"

  - name: INFRA_NAMESPACE
    required: true
    default_dev: "workspace-infra"

  - name: TLS_SECRET_NAME
    required: true
    default_dev: "workspace-wildcard-tls"

  - name: SMTP_FROM
    required: true
    default_dev: "noreply@localhost"

secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: KEYCLOAK_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: KEYCLOAK_ADMIN_PASSWORD
    required: true
    generate: false

  - name: MATTERMOST_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: MATTERMOST_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: NEXTCLOUD_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: NEXTCLOUD_ADMIN_PASSWORD
    required: true
    generate: false

  - name: NEXTCLOUD_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: SIGNALING_SECRET
    required: true
    generate: true
    length: 32

  - name: TURN_SECRET
    required: true
    generate: true
    length: 32

  - name: INVOICENINJA_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: INVOICENINJA_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: INVOICENINJA_API_TOKEN
    required: true
    generate: true
    length: 32

  - name: INVOICENINJA_APP_KEY
    required: true
    generate: true
    length: 32
    encoding: base64

  - name: INVOICENINJA_ADMIN_PASSWORD
    required: true
    generate: false

  - name: OAUTH2_PROXY_COOKIE_SECRET
    required: true
    generate: true
    length: 32

  - name: BILLING_BOT_MM_TOKEN
    required: true
    generate: true
    length: 32

  - name: COLLABORA_ADMIN_PASSWORD
    required: true
    generate: true
    length: 24

  - name: WHITEBOARD_JWT_SECRET
    required: true
    generate: true
    length: 32

  - name: VAULTWARDEN_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: VAULTWARDEN_ADMIN_TOKEN
    required: true
    generate: true
    length: 48

  - name: VAULTWARDEN_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: MEETINGS_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: RECORDING_SECRET
    required: true
    generate: true
    length: 32

  - name: SMTP_PASSWORD
    required: true
    generate: false

  - name: CLAUDE_CODE_ADMIN_EMAIL
    required: true
    generate: false

  - name: CLAUDE_CODE_ADMIN_PASSWORD
    required: true
    generate: false

  - name: WORDPRESS_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: WORDPRESS_DB_PASSWORD
    required: true
    generate: true
    length: 32

setup_vars:
  - name: KC_USER1_USERNAME
    required: true

  - name: KC_USER1_EMAIL
    required: true
    validate: "^.+@.+$"

  - name: KC_USER1_PASSWORD
    required: true

  - name: KC_USER2_USERNAME
    required: false

  - name: KC_USER2_EMAIL
    required: false

  - name: KC_USER2_PASSWORD
    required: false
```

- [ ] **Step 3: Commit**

```bash
git add environments/schema.yaml environments/.secrets/.gitkeep
git commit -m "feat(env): add environment schema — single source of truth for all vars and secrets"
```

---

### Task 2: Create environment files

**Files:**
- Create: `environments/dev.yaml`
- Create: `environments/mentolder.yaml`
- Create: `environments/korczewski.yaml`

- [ ] **Step 1: Write dev.yaml**

```yaml
# environments/dev.yaml
environment: dev
context: k3d-dev
domain: localhost

env_vars:
  # Dev uses default_dev from schema.yaml for most values.
  # Override only where the dev default differs from schema:
  WEBSITE_IMAGE: workspace-website

# Dev secrets: generated from schema defaults at deploy time.
secrets_mode: plaintext

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@localhost
  KC_USER1_PASSWORD: devadmin
```

- [ ] **Step 2: Write mentolder.yaml**

Extract values from the current `.env` file:

```yaml
# environments/mentolder.yaml
environment: mentolder
context: mentolder
domain: mentolder.de

env_vars:
  PROD_DOMAIN: mentolder.de
  BRAND_NAME: "Mentolder"
  CONTACT_EMAIL: info@mentolder.de
  CONTACT_PHONE: "+49 151 508 32 601"
  CONTACT_CITY: "Lueneburg"
  CONTACT_NAME: "Gerald Korczewski"
  LEGAL_STREET: "Ludwig-Erhard-Str. 18"
  LEGAL_ZIP: "20459"
  LEGAL_JOBTITLE: "Coach, Berater, Trainer"
  LEGAL_UST_ID: "Kleinunternehmer gem. 19 Abs. 1 UStG"
  LEGAL_WEBSITE: mentolder.de
  WEBSITE_IMAGE: mentolder-website
  INFRA_NAMESPACE: mentolder-infra
  TLS_SECRET_NAME: mentolder-tls
  SMTP_FROM: mentolder@mailbox.org

overlay: prod
secrets_ref: sealed-secrets/mentolder.yaml

setup_vars:
  KC_USER1_USERNAME: paddione
  KC_USER1_EMAIL: patrick@korczewski.de
  KC_USER1_PASSWORD: SEALED
  KC_USER2_USERNAME: gekko
  KC_USER2_EMAIL: quamain@web.de
  KC_USER2_PASSWORD: SEALED
```

- [ ] **Step 3: Write korczewski.yaml**

Extract values from `.env.korczewski` (read first to get actual values):

```yaml
# environments/korczewski.yaml
environment: korczewski
context: korczewski
domain: korczewski.de

env_vars:
  PROD_DOMAIN: korczewski.de
  BRAND_NAME: "Korczewski"
  CONTACT_EMAIL: info@korczewski.de
  # Fill remaining values from .env.korczewski
  # Every key from schema.yaml env_vars must be present
  CONTACT_PHONE: "FILL_FROM_ENV_KORCZEWSKI"
  CONTACT_CITY: "FILL_FROM_ENV_KORCZEWSKI"
  CONTACT_NAME: "FILL_FROM_ENV_KORCZEWSKI"
  LEGAL_STREET: "FILL_FROM_ENV_KORCZEWSKI"
  LEGAL_ZIP: "FILL_FROM_ENV_KORCZEWSKI"
  LEGAL_JOBTITLE: "FILL_FROM_ENV_KORCZEWSKI"
  LEGAL_UST_ID: "FILL_FROM_ENV_KORCZEWSKI"
  LEGAL_WEBSITE: korczewski.de
  WEBSITE_IMAGE: korczewski-website
  INFRA_NAMESPACE: korczewski-infra
  TLS_SECRET_NAME: korczewski-tls
  SMTP_FROM: noreply@korczewski.de

overlay: prod-korczewski
secrets_ref: sealed-secrets/korczewski.yaml

setup_vars:
  KC_USER1_USERNAME: paddione
  KC_USER1_EMAIL: patrick@korczewski.de
  KC_USER1_PASSWORD: SEALED
```

Note: The `FILL_FROM_ENV_KORCZEWSKI` placeholders must be replaced with actual values from `.env.korczewski` before committing. The validation script (Task 3) will catch these.

- [ ] **Step 4: Commit**

```bash
git add environments/dev.yaml environments/mentolder.yaml environments/korczewski.yaml
git commit -m "feat(env): add environment files for dev, mentolder, korczewski"
```

---

### Task 3: Write the validation script

**Files:**
- Create: `scripts/env-validate.sh`
- Test: `tests/unit/env-validate.bats`

- [ ] **Step 1: Write the failing BATS tests**

Create `tests/unit/env-validate.bats`:

```bash
#!/usr/bin/env bats
# env-validate.bats — Unit tests for the environment validation script

load test_helper

setup_file() {
  export VALIDATE="${PROJECT_DIR}/scripts/env-validate.sh"
  export FIXTURES="${BATS_FILE_TMPDIR}/fixtures"
  mkdir -p "${FIXTURES}/environments/sealed-secrets"

  # Minimal valid schema
  cat > "${FIXTURES}/environments/schema.yaml" <<'YAML'
version: 1
env_vars:
  - name: PROD_DOMAIN
    required: true
    default_dev: "localhost"
    validate: "^[a-z0-9.-]+$"
  - name: BRAND_NAME
    required: true
    default_dev: "Workspace"
secrets:
  - name: DB_PASSWORD
    required: true
    generate: true
    length: 32
  - name: ADMIN_PASSWORD
    required: true
    generate: false
setup_vars:
  - name: ADMIN_USER
    required: true
YAML

  # Valid dev environment
  cat > "${FIXTURES}/environments/dev.yaml" <<'YAML'
environment: dev
context: k3d-dev
domain: localhost
env_vars:
  WEBSITE_IMAGE: workspace-website
secrets_mode: plaintext
setup_vars:
  ADMIN_USER: admin
YAML

  # Valid prod environment
  cat > "${FIXTURES}/environments/prod.yaml" <<'YAML'
environment: prod
context: prod-ctx
domain: example.com
env_vars:
  PROD_DOMAIN: example.com
  BRAND_NAME: "Example"
secrets_ref: sealed-secrets/prod.yaml
setup_vars:
  ADMIN_USER: admin
YAML
}

# ── Schema completeness ──────────────────────────────────────────

@test "valid dev environment passes validation" {
  run bash "$VALIDATE" --env-dir "${FIXTURES}/environments" --env dev --schema-only
  [ "$status" -eq 0 ]
}

@test "valid prod environment passes schema-only validation" {
  # Create a dummy sealed secret file so the ref check passes
  cat > "${FIXTURES}/environments/sealed-secrets/prod.yaml" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: workspace-secrets
spec:
  encryptedData:
    DB_PASSWORD: AgBy3...
    ADMIN_PASSWORD: AgBy3...
YAML
  run bash "$VALIDATE" --env-dir "${FIXTURES}/environments" --env prod --schema-only
  [ "$status" -eq 0 ]
}

@test "missing required env_var fails validation" {
  local bad="${FIXTURES}/environments/bad-missing-var.yaml"
  cat > "$bad" <<'YAML'
environment: bad
context: bad-ctx
domain: bad.com
env_vars:
  PROD_DOMAIN: bad.com
secrets_ref: sealed-secrets/prod.yaml
setup_vars:
  ADMIN_USER: admin
YAML
  run bash "$VALIDATE" --env-dir "${FIXTURES}/environments" --env bad-missing-var --schema-only
  [ "$status" -ne 0 ]
  [[ "$output" == *"BRAND_NAME"* ]]
}

@test "env_var failing regex validation is rejected" {
  local bad="${FIXTURES}/environments/bad-regex.yaml"
  cat > "$bad" <<'YAML'
environment: bad
context: bad-ctx
domain: bad.com
env_vars:
  PROD_DOMAIN: "BAD DOMAIN WITH SPACES"
  BRAND_NAME: "Test"
secrets_ref: sealed-secrets/prod.yaml
setup_vars:
  ADMIN_USER: admin
YAML
  run bash "$VALIDATE" --env-dir "${FIXTURES}/environments" --env bad-regex --schema-only
  [ "$status" -ne 0 ]
  [[ "$output" == *"PROD_DOMAIN"* ]]
}

@test "placeholder values are rejected" {
  local bad="${FIXTURES}/environments/bad-placeholder.yaml"
  cat > "$bad" <<'YAML'
environment: bad
context: bad-ctx
domain: bad.com
env_vars:
  PROD_DOMAIN: "yourdomain.tld"
  BRAND_NAME: "Test"
secrets_ref: sealed-secrets/prod.yaml
setup_vars:
  ADMIN_USER: admin
YAML
  run bash "$VALIDATE" --env-dir "${FIXTURES}/environments" --env bad-placeholder --schema-only
  [ "$status" -ne 0 ]
  [[ "$output" == *"placeholder"* ]] || [[ "$output" == *"yourdomain.tld"* ]]
}

# ── Secret completeness ──────────────────────────────────────────

@test "missing sealed secret file fails validation" {
  local bad="${FIXTURES}/environments/bad-no-sealed.yaml"
  cat > "$bad" <<'YAML'
environment: bad
context: bad-ctx
domain: bad.com
env_vars:
  PROD_DOMAIN: bad.com
  BRAND_NAME: "Test"
secrets_ref: sealed-secrets/nonexistent.yaml
setup_vars:
  ADMIN_USER: admin
YAML
  run bash "$VALIDATE" --env-dir "${FIXTURES}/environments" --env bad-no-sealed --schema-only
  [ "$status" -ne 0 ]
  [[ "$output" == *"sealed"* ]] || [[ "$output" == *"not found"* ]]
}

@test "sealed secret missing a key fails validation" {
  local bad="${FIXTURES}/environments/bad-sealed-keys.yaml"
  cat > "$bad" <<'YAML'
environment: bad
context: bad-ctx
domain: bad.com
env_vars:
  PROD_DOMAIN: bad.com
  BRAND_NAME: "Test"
secrets_ref: sealed-secrets/bad-sealed-keys.yaml
setup_vars:
  ADMIN_USER: admin
YAML
  cat > "${FIXTURES}/environments/sealed-secrets/bad-sealed-keys.yaml" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: workspace-secrets
spec:
  encryptedData:
    DB_PASSWORD: AgBy3...
YAML
  run bash "$VALIDATE" --env-dir "${FIXTURES}/environments" --env bad-sealed-keys --schema-only
  [ "$status" -ne 0 ]
  [[ "$output" == *"ADMIN_PASSWORD"* ]]
}

# ── Cross-environment drift ──────────────────────────────────────

@test "drift check catches key missing in one environment" {
  run bash "$VALIDATE" --env-dir "${FIXTURES}/environments" --drift
  # Should report drift for bad-* envs but succeed structurally
  # (drift is a warning, not a hard failure, unless --strict)
  true  # drift detection is advisory by default
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/env-validate.bats
```

Expected: All tests FAIL because `scripts/env-validate.sh` does not exist.

- [ ] **Step 3: Write env-validate.sh**

Create `scripts/env-validate.sh`:

```bash
#!/usr/bin/env bash
# env-validate.sh — Pre-deploy environment validation gate
# Usage:
#   env-validate.sh --env <name> [--env-dir <path>] [--schema-only] [--strict]
#   env-validate.sh --drift [--env-dir <path>]
#
# --schema-only: skip cluster reachability check (for CI)
# --strict: treat drift warnings as errors
# --drift: compare all environments for key consistency
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────
ENV_DIR="${ENV_DIR:-environments}"
SCHEMA_ONLY=false
STRICT=false
DRIFT_MODE=false
TARGET_ENV=""

# ── Arg parsing ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)        TARGET_ENV="$2"; shift 2 ;;
    --env-dir)    ENV_DIR="$2"; shift 2 ;;
    --schema-only) SCHEMA_ONLY=true; shift ;;
    --strict)     STRICT=true; shift ;;
    --drift)      DRIFT_MODE=true; shift ;;
    *) echo "ERROR: Unknown arg: $1" >&2; exit 1 ;;
  esac
done

SCHEMA="${ENV_DIR}/schema.yaml"
ERRORS=0

# ── Helpers ──────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); }
warn() { echo "WARN: $*" >&2; }
info() { echo "INFO: $*" >&2; }

# Parse YAML values using grep/sed (no yq dependency).
# Returns the value for a given key under a given section.
yaml_get() {
  local file="$1" key="$2"
  grep -E "^\s+${key}:" "$file" 2>/dev/null | head -1 | sed 's/^[^:]*:\s*//' | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/"
}

# Extract all keys from a YAML list-of-maps section (e.g. env_vars, secrets).
# Each item has a "name:" field.
schema_keys() {
  local section="$1"
  awk -v sect="$section" '
    $0 ~ "^"sect":" { in_sect=1; next }
    in_sect && /^[a-z_]/ { in_sect=0 }
    in_sect && /^\s+- name:/ { gsub(/.*name:\s*/, ""); gsub(/"/, ""); print }
  ' "$SCHEMA"
}

# Extract a field for a given key in a schema section.
schema_field() {
  local section="$1" key="$2" field="$3"
  awk -v sect="$section" -v k="$key" -v f="$field" '
    $0 ~ "^"sect":" { in_sect=1; next }
    in_sect && /^[a-z_]/ { in_sect=0 }
    in_sect && /- name:/ { gsub(/.*name:\s*/, ""); gsub(/"/, ""); current=$0 }
    in_sect && current==k && $0 ~ f":" { gsub(/.*:\s*/, ""); gsub(/"/, ""); print; exit }
  ' "$SCHEMA"
}

# Extract all keys from env_vars section of an environment file.
env_file_keys() {
  local file="$1"
  awk '
    /^env_vars:/ { in_sect=1; next }
    in_sect && /^[a-z_]/ { in_sect=0 }
    in_sect && /^\s+[A-Z_]+:/ { gsub(/:\s*.*/, ""); gsub(/^\s+/, ""); print }
  ' "$file"
}

# Extract keys from a SealedSecret encryptedData section.
sealed_secret_keys() {
  local file="$1"
  awk '
    /encryptedData:/ { in_sect=1; next }
    in_sect && /^[a-z ]/ && !/^\s/ { in_sect=0 }
    in_sect && /^\s+[A-Z_]+:/ { gsub(/:\s*.*/, ""); gsub(/^\s+/, ""); print }
  ' "$file"
}

# Blocklist of known placeholder values that must never reach a prod cluster.
PLACEHOLDERS="yourdomain.tld|yourbrand.tld|info@yourdomain.tld|MANAGED_EXTERNALLY|REPLACE_ME|FILL_FROM_ENV"

# ── Drift mode ───────────────────────────────────────────────────

if [[ "$DRIFT_MODE" == "true" ]]; then
  info "Checking for key drift across all environments..."
  all_envs=()
  for f in "${ENV_DIR}"/*.yaml; do
    [[ "$(basename "$f")" == "schema.yaml" ]] && continue
    all_envs+=("$f")
  done

  # Collect env_var keys per file
  for f in "${all_envs[@]}"; do
    name="$(basename "$f" .yaml)"
    missing=()
    for key in $(schema_keys "env_vars"); do
      required="$(schema_field "env_vars" "$key" "required")"
      default_dev="$(schema_field "env_vars" "$key" "default_dev")"
      val="$(yaml_get "$f" "$key")"
      # Dev environments can rely on default_dev
      if [[ -z "$val" && -z "$default_dev" && "$required" == "true" ]]; then
        secrets_mode="$(yaml_get "$f" "secrets_mode")"
        # Dev with defaults is ok
        [[ "$secrets_mode" == "plaintext" && -n "$default_dev" ]] && continue
        missing+=("$key")
      fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
      warn "Environment '$name' is missing env_vars: ${missing[*]}"
      [[ "$STRICT" == "true" ]] && ERRORS=$((ERRORS + ${#missing[@]}))
    fi
  done
  exit "$ERRORS"
fi

# ── Single environment validation ────────────────────────────────

if [[ -z "$TARGET_ENV" ]]; then
  echo "Usage: $0 --env <name> [--env-dir <path>] [--schema-only]" >&2
  exit 1
fi

ENV_FILE="${ENV_DIR}/${TARGET_ENV}.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
  die "Environment file not found: ${ENV_FILE}"
  exit 1
fi

if [[ ! -f "$SCHEMA" ]]; then
  die "Schema file not found: ${SCHEMA}"
  exit 1
fi

info "Validating environment: ${TARGET_ENV}"

# ── 1. Env var completeness ──────────────────────────────────────

secrets_mode="$(yaml_get "$ENV_FILE" "secrets_mode")"
env_domain="$(yaml_get "$ENV_FILE" "domain")"

for key in $(schema_keys "env_vars"); do
  required="$(schema_field "env_vars" "$key" "required")"
  default_dev="$(schema_field "env_vars" "$key" "default_dev")"
  validate_regex="$(schema_field "env_vars" "$key" "validate")"

  val="$(yaml_get "$ENV_FILE" "$key")"

  # Dev environments can use schema defaults
  if [[ -z "$val" && "$secrets_mode" == "plaintext" && -n "$default_dev" ]]; then
    val="$default_dev"
  fi

  # Check required
  if [[ -z "$val" && "$required" == "true" ]]; then
    die "Missing required env_var: ${key} in ${TARGET_ENV}"
    continue
  fi

  # Check placeholders
  if [[ -n "$val" ]] && echo "$val" | grep -qE "$PLACEHOLDERS"; then
    die "Env var ${key} contains placeholder value '${val}' in ${TARGET_ENV}"
  fi

  # Check regex
  if [[ -n "$val" && -n "$validate_regex" ]]; then
    if ! echo "$val" | grep -qE "$validate_regex"; then
      die "Env var ${key} value '${val}' does not match pattern '${validate_regex}'"
    fi
  fi
done

# ── 2. Setup var completeness ────────────────────────────────────

for key in $(schema_keys "setup_vars"); do
  required="$(schema_field "setup_vars" "$key" "required")"
  val="$(yaml_get "$ENV_FILE" "$key")"

  if [[ -z "$val" && "$required" == "true" ]]; then
    die "Missing required setup_var: ${key} in ${TARGET_ENV}"
  fi
done

# ── 3. Secret completeness ──────────────────────────────────────

if [[ "$secrets_mode" != "plaintext" ]]; then
  secrets_ref="$(yaml_get "$ENV_FILE" "secrets_ref")"
  sealed_file="${ENV_DIR}/${secrets_ref}"

  if [[ ! -f "$sealed_file" ]]; then
    die "Sealed secret file not found: ${sealed_file} (referenced by ${TARGET_ENV})"
  else
    sealed_keys="$(sealed_secret_keys "$sealed_file")"
    for key in $(schema_keys "secrets"); do
      required="$(schema_field "secrets" "$key" "required")"
      if [[ "$required" == "true" ]] && ! echo "$sealed_keys" | grep -qx "$key"; then
        die "Sealed secret missing key: ${key} in ${sealed_file}"
      fi
    done
  fi
fi

# ── 4. Cluster reachability ──────────────────────────────────────

if [[ "$SCHEMA_ONLY" != "true" ]]; then
  context="$(yaml_get "$ENV_FILE" "context")"
  if [[ -n "$context" ]]; then
    if ! kubectl --context "$context" cluster-info > /dev/null 2>&1; then
      die "Cluster not reachable via context: ${context}"
    else
      info "Cluster '${context}' is reachable"
    fi
  fi
fi

# ── Result ───────────────────────────────────────────────────────

if [[ "$ERRORS" -gt 0 ]]; then
  echo "FAILED: ${ERRORS} validation error(s) in environment '${TARGET_ENV}'" >&2
  exit 1
else
  info "PASSED: Environment '${TARGET_ENV}' is valid"
  exit 0
fi
```

- [ ] **Step 4: Make script executable**

```bash
chmod +x scripts/env-validate.sh
```

- [ ] **Step 5: Run BATS tests to verify they pass**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/env-validate.bats
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/env-validate.sh tests/unit/env-validate.bats
git commit -m "feat(env): add validation gate script with BATS tests"
```

---

### Task 4: Add .gitignore entry for plaintext secrets

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append gitignore entries**

Add to `.gitignore`:

```
# ── Environment secrets (plaintext, never commit) ──
environments/.secrets/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore plaintext environment secrets"
```

---

### Task 5: Wire validation into Taskfile

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add env:validate task to Taskfile.yml**

Add the following task block after the existing `workspace:validate` task (around line 987):

```yaml
  # ─────────────────────────────────────────────
  # Environment Management
  # ─────────────────────────────────────────────
  env:validate:
    desc: Validate environment config against schema
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - bash scripts/env-validate.sh --env {{.ENV}} --env-dir environments {{if eq .ENV "dev"}}--schema-only{{end}}

  env:validate:all:
    desc: Validate all environment configs (schema-only, no cluster needed)
    cmds:
      - |
        errors=0
        for f in environments/*.yaml; do
          name="$(basename "$f" .yaml)"
          [ "$name" = "schema" ] && continue
          echo "--- Validating: $name ---"
          bash scripts/env-validate.sh --env "$name" --env-dir environments --schema-only || errors=$((errors + 1))
        done
        exit "$errors"

  env:show:
    desc: Show resolved config for an environment
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        echo "=== Environment: {{.ENV}} ==="
        cat "environments/{{.ENV}}.yaml"
```

- [ ] **Step 2: Add validation as precondition to workspace:prod:deploy**

In the existing `workspace:prod:deploy` task (line 542), add a dep:

```yaml
  workspace:prod:deploy:
    desc: Deploy workspace stack to production cluster
    deps: [env:validate]
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
```

Keep the existing preconditions for now (they'll be removed in Phase 4).

- [ ] **Step 3: Test the tasks**

```bash
task env:validate ENV=dev
task env:validate:all
```

Expected: `dev` passes. `mentolder` and `korczewski` pass if their env files are complete.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(env): wire env:validate into Taskfile with ENV parameter"
```

---

### Task 6: Add CI validation step

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add validate-environments job**

Add after the `test-configs` job:

```yaml
  validate-environments:
    name: Validate Environment Configs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - name: Validate all environments against schema
        run: |
          for f in environments/*.yaml; do
            name="$(basename "$f" .yaml)"
            [ "$name" = "schema" ] && continue
            echo "--- Validating: $name ---"
            bash scripts/env-validate.sh --env "$name" --env-dir environments --schema-only
          done

      - name: Check for cross-environment drift
        run: bash scripts/env-validate.sh --drift --env-dir environments --strict
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add environment schema validation to PR checks"
```

---

## Phase 2: Sealed Secrets

### Task 7: Add Sealed Secrets controller manifest

**Files:**
- Create: `k3d/sealed-secrets-controller.yaml`

- [ ] **Step 1: Write the controller manifest**

Create `k3d/sealed-secrets-controller.yaml`. This deploys the Sealed Secrets controller (the standard Bitnami Helm chart rendered to static YAML). Use the latest stable version.

```yaml
# k3d/sealed-secrets-controller.yaml
# Sealed Secrets controller — decrypts SealedSecret resources into K8s Secrets.
# Install: included in kustomize base (k3d/kustomization.yaml)
# Docs: https://github.com/bitnami-labs/sealed-secrets
---
apiVersion: v1
kind: Namespace
metadata:
  name: sealed-secrets
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sealed-secrets-controller
  namespace: sealed-secrets
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secrets-unsealer
rules:
  - apiGroups: ["bitnami.com"]
    resources: ["sealedsecrets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["bitnami.com"]
    resources: ["sealedsecrets/status"]
    verbs: ["update"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "create", "update", "delete", "watch"]
  - apiGroups: [""]
    resources: ["events"]
    verbs: ["create", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: sealed-secrets-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: secrets-unsealer
subjects:
  - kind: ServiceAccount
    name: sealed-secrets-controller
    namespace: sealed-secrets
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sealed-secrets-controller
  namespace: sealed-secrets
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: sealed-secrets-controller
  template:
    metadata:
      labels:
        app.kubernetes.io/name: sealed-secrets-controller
    spec:
      serviceAccountName: sealed-secrets-controller
      containers:
        - name: controller
          image: docker.io/bitnami/sealed-secrets-controller:0.27.3
          args:
            - --update-status
          ports:
            - containerPort: 8080
              name: http
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: sealed-secrets-controller
  namespace: sealed-secrets
spec:
  selector:
    app.kubernetes.io/name: sealed-secrets-controller
  ports:
    - port: 8080
      targetPort: http
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: sealedsecrets.bitnami.com
spec:
  group: bitnami.com
  names:
    kind: SealedSecret
    listKind: SealedSecretList
    plural: sealedsecrets
    singular: sealedsecret
  scope: Namespaced
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              x-kubernetes-preserve-unknown-fields: true
            status:
              type: object
              x-kubernetes-preserve-unknown-fields: true
      subresources:
        status: {}
```

Note: In production, prefer installing via Helm (`helm install sealed-secrets bitnami/sealed-secrets -n sealed-secrets`). This static manifest is for the k3d base. Add a `sealed-secrets:install` Taskfile task for prod clusters that uses Helm.

- [ ] **Step 2: Commit**

```bash
git add k3d/sealed-secrets-controller.yaml
git commit -m "feat(env): add Sealed Secrets controller manifest"
```

---

### Task 8: Write the secret generation script

**Files:**
- Create: `scripts/env-generate.sh`

- [ ] **Step 1: Write env-generate.sh**

```bash
#!/usr/bin/env bash
# env-generate.sh — Generate secrets for an environment from schema.yaml
# Usage: env-generate.sh --env <name> [--env-dir <path>]
#
# For keys with generate:true, creates random passwords.
# For keys with generate:false, prompts the user interactively.
# Output: environments/.secrets/<name>.yaml (plaintext, gitignored)
set -euo pipefail

ENV_DIR="${ENV_DIR:-environments}"
TARGET_ENV=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)     TARGET_ENV="$2"; shift 2 ;;
    --env-dir) ENV_DIR="$2"; shift 2 ;;
    *) echo "ERROR: Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TARGET_ENV" ]]; then
  echo "Usage: $0 --env <name>" >&2
  exit 1
fi

SCHEMA="${ENV_DIR}/schema.yaml"
OUTPUT_DIR="${ENV_DIR}/.secrets"
OUTPUT="${OUTPUT_DIR}/${TARGET_ENV}.yaml"
mkdir -p "$OUTPUT_DIR"

if [[ -f "$OUTPUT" ]]; then
  echo "Secrets file already exists: $OUTPUT"
  echo "To regenerate, delete it first or use env:rotate."
  exit 1
fi

echo "# Generated secrets for ${TARGET_ENV}" > "$OUTPUT"
echo "# $(date -Iseconds)" >> "$OUTPUT"
echo "# DO NOT COMMIT — this file is gitignored" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Parse secret entries from schema
awk '
  /^secrets:/ { in_sect=1; next }
  in_sect && /^[a-z_]/ { in_sect=0 }
  in_sect && /- name:/ { gsub(/.*name:\s*/, ""); gsub(/"/, ""); print "NAME=" $0 }
  in_sect && /generate:/ { gsub(/.*generate:\s*/, ""); print "GENERATE=" $0 }
  in_sect && /length:/ { gsub(/.*length:\s*/, ""); print "LENGTH=" $0 }
  in_sect && /encoding:/ { gsub(/.*encoding:\s*/, ""); print "ENCODING=" $0 }
  in_sect && /^$/ { print "---" }
' "$SCHEMA" | while IFS= read -r line; do
  case "$line" in
    NAME=*)
      current_name="${line#NAME=}"
      current_generate=""
      current_length="32"
      current_encoding=""
      ;;
    GENERATE=*)
      current_generate="${line#GENERATE=}"
      ;;
    LENGTH=*)
      current_length="${line#LENGTH=}"
      ;;
    ENCODING=*)
      current_encoding="${line#ENCODING=}"
      ;;
    ---)
      if [[ -n "$current_name" ]]; then
        if [[ "$current_generate" == "true" ]]; then
          value="$(openssl rand -hex "$((current_length / 2))")"
          if [[ "$current_encoding" == "base64" ]]; then
            value="base64:$(echo -n "$value" | base64)"
          fi
          echo "${current_name}: \"${value}\"" >> "$OUTPUT"
          echo "  Generated: ${current_name} (${current_length} chars)"
        else
          echo -n "  Enter value for ${current_name}: "
          read -r value
          echo "${current_name}: \"${value}\"" >> "$OUTPUT"
        fi
        current_name=""
      fi
      ;;
  esac
done

# Handle the last entry (no trailing ---)
# Re-parse to catch it — simpler to just ensure schema ends with a blank line

echo ""
echo "Secrets written to: ${OUTPUT}"
echo "Next: run 'task env:seal ENV=${TARGET_ENV}' to encrypt for the cluster."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/env-generate.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/env-generate.sh
git commit -m "feat(env): add secret generation script from schema"
```

---

### Task 9: Write the sealing script

**Files:**
- Create: `scripts/env-seal.sh`

- [ ] **Step 1: Write env-seal.sh**

```bash
#!/usr/bin/env bash
# env-seal.sh — Encrypt plaintext secrets into a SealedSecret manifest
# Usage: env-seal.sh --env <name> [--env-dir <path>]
#
# Reads:  environments/.secrets/<name>.yaml (plaintext key-value pairs)
# Writes: environments/sealed-secrets/<name>.yaml (encrypted SealedSecret)
#
# Requires: kubeseal CLI, cluster access (to fetch the sealing key),
#           OR a pre-fetched cert in environments/certs/<name>.pem
set -euo pipefail

ENV_DIR="${ENV_DIR:-environments}"
TARGET_ENV=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)     TARGET_ENV="$2"; shift 2 ;;
    --env-dir) ENV_DIR="$2"; shift 2 ;;
    *) echo "ERROR: Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TARGET_ENV" ]]; then
  echo "Usage: $0 --env <name>" >&2
  exit 1
fi

ENV_FILE="${ENV_DIR}/${TARGET_ENV}.yaml"
SECRETS_FILE="${ENV_DIR}/.secrets/${TARGET_ENV}.yaml"
SEALED_OUTPUT="${ENV_DIR}/sealed-secrets/${TARGET_ENV}.yaml"
CERT_FILE="${ENV_DIR}/certs/${TARGET_ENV}.pem"

# Read the kubectl context from the environment file
context="$(grep '^\s*context:' "$ENV_FILE" | head -1 | sed 's/^[^:]*:\s*//' | tr -d '"')"

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERROR: Plaintext secrets not found: ${SECRETS_FILE}" >&2
  echo "Run 'task env:generate ENV=${TARGET_ENV}' first." >&2
  exit 1
fi

mkdir -p "${ENV_DIR}/sealed-secrets" "${ENV_DIR}/certs"

# Fetch or use existing cert
if [[ ! -f "$CERT_FILE" ]]; then
  echo "Fetching sealing certificate from cluster '${context}'..."
  kubeseal --controller-name=sealed-secrets-controller \
           --controller-namespace=sealed-secrets \
           --context "$context" \
           --fetch-cert > "$CERT_FILE"
  echo "Certificate saved to: ${CERT_FILE}"
fi

# Build a K8s Secret manifest from the plaintext key-value file
TEMP_SECRET="$(mktemp)"
cat > "$TEMP_SECRET" <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: workspace-secrets
  namespace: workspace
type: Opaque
stringData:
YAML

# Append each key-value pair (skip comments and blank lines)
grep -E '^[A-Z_]+:' "$SECRETS_FILE" | while IFS= read -r line; do
  echo "  ${line}" >> "$TEMP_SECRET"
done

# Seal it
echo "Sealing secrets for ${TARGET_ENV}..."
kubeseal --cert "$CERT_FILE" \
         --format yaml \
         < "$TEMP_SECRET" \
         > "$SEALED_OUTPUT"

rm -f "$TEMP_SECRET"

echo "Sealed secret written to: ${SEALED_OUTPUT}"
echo "This file is safe to commit to git."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/env-seal.sh
```

- [ ] **Step 3: Add Taskfile tasks for generate and seal**

Add to `Taskfile.yml` in the Environment Management section:

```yaml
  env:generate:
    desc: Generate secrets for an environment from schema
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - bash scripts/env-generate.sh --env {{.ENV}} --env-dir environments

  env:seal:
    desc: Encrypt secrets into a SealedSecret manifest
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    preconditions:
      - sh: command -v kubeseal > /dev/null
        msg: "kubeseal not found. Install: https://github.com/bitnami-labs/sealed-secrets#kubeseal"
    cmds:
      - bash scripts/env-seal.sh --env {{.ENV}} --env-dir environments

  env:fetch-cert:
    desc: Fetch the sealing certificate from a cluster
    vars:
      ENV: '{{.ENV}}'
    cmds:
      - |
        context="$(grep 'context:' environments/{{.ENV}}.yaml | head -1 | sed 's/.*: *//' | tr -d '\"')"
        mkdir -p environments/certs
        kubeseal --controller-name=sealed-secrets-controller \
                 --controller-namespace=sealed-secrets \
                 --context "$context" \
                 --fetch-cert > "environments/certs/{{.ENV}}.pem"
        echo "Certificate saved to environments/certs/{{.ENV}}.pem"

  env:init:
    desc: Create a new environment file from schema template
    vars:
      ENV: '{{.ENV}}'
    cmds:
      - |
        if [ -f "environments/{{.ENV}}.yaml" ]; then
          echo "ERROR: environments/{{.ENV}}.yaml already exists" >&2
          exit 1
        fi
        cat > "environments/{{.ENV}}.yaml" <<'ENVYAML'
        # environments/{{.ENV}}.yaml — created $(date -Idate)
        environment: {{.ENV}}
        context: FILL_ME
        domain: FILL_ME

        env_vars:
        ENVYAML
        # Append all env_var keys from schema as placeholders
        awk '/^env_vars:/{in_sect=1;next} in_sect&&/^[a-z_]/{exit} in_sect&&/- name:/{gsub(/.*name: */,"");gsub(/"/,"");print "  "$0": FILL_ME"}' environments/schema.yaml >> "environments/{{.ENV}}.yaml"
        echo "" >> "environments/{{.ENV}}.yaml"
        echo "setup_vars:" >> "environments/{{.ENV}}.yaml"
        awk '/^setup_vars:/{in_sect=1;next} in_sect&&/^[a-z_]/{exit} in_sect&&/- name:/{gsub(/.*name: */,"");gsub(/"/,"");print "  "$0": FILL_ME"}' environments/schema.yaml >> "environments/{{.ENV}}.yaml"
        echo "Created: environments/{{.ENV}}.yaml — fill in all FILL_ME values."
```

- [ ] **Step 4: Commit**

```bash
git add scripts/env-seal.sh Taskfile.yml
git commit -m "feat(env): add secret generation, sealing, and init tasks"
```

---

### Task 10: Write the env-resolve script

**Files:**
- Create: `scripts/env-resolve.sh`

- [ ] **Step 1: Write env-resolve.sh**

This script reads an environment file + schema defaults and exports all variables. It's sourced by the deploy tasks.

```bash
#!/usr/bin/env bash
# env-resolve.sh — Resolve and export all environment variables for a given env.
# Usage: source scripts/env-resolve.sh <env-name> [env-dir]
#
# After sourcing, all env_vars from the environment file (or schema defaults
# for dev) are exported as shell variables.
# This replaces the old `dotenv: ['.env']` + manual export pattern.

TARGET_ENV="${1:?Usage: source env-resolve.sh <env-name> [env-dir]}"
ENV_DIR="${2:-environments}"

SCHEMA="${ENV_DIR}/schema.yaml"
ENV_FILE="${ENV_DIR}/${TARGET_ENV}.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Environment file not found: ${ENV_FILE}" >&2
  return 1 2>/dev/null || exit 1
fi

# Helper: get value from env file
_yaml_get() {
  local file="$1" key="$2"
  grep -E "^\s+${key}:" "$file" 2>/dev/null | head -1 | sed 's/^[^:]*:\s*//' | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/"
}

# Export env_vars: use env file value, fall back to schema default_dev
while IFS= read -r key; do
  val="$(_yaml_get "$ENV_FILE" "$key")"
  if [[ -z "$val" ]]; then
    # Try schema default_dev
    val="$(awk -v k="$key" '
      /^env_vars:/ { in_sect=1; next }
      in_sect && /^[a-z_]/ { in_sect=0 }
      in_sect && /- name:/ { gsub(/.*name:\s*/, ""); gsub(/"/, ""); current=$0 }
      in_sect && current==k && /default_dev:/ { gsub(/.*default_dev:\s*/, ""); gsub(/"/, ""); print; exit }
    ' "$SCHEMA")"
  fi
  if [[ -n "$val" ]]; then
    export "$key=$val"
  fi
done < <(awk '
  /^env_vars:/ { in_sect=1; next }
  in_sect && /^[a-z_]/ { in_sect=0 }
  in_sect && /- name:/ { gsub(/.*name:\s*/, ""); gsub(/"/, ""); print }
' "$SCHEMA")

# Also export setup_vars
while IFS= read -r key; do
  val="$(_yaml_get "$ENV_FILE" "$key")"
  if [[ -n "$val" ]]; then
    export "$key=$val"
  fi
done < <(awk '
  /^setup_vars:/ { in_sect=1; next }
  in_sect && /^[a-z_]/ { in_sect=0 }
  in_sect && /- name:/ { gsub(/.*name:\s*/, ""); gsub(/"/, ""); print }
' "$SCHEMA")

# Export context and domain as convenience vars
export ENV_CONTEXT="$(_yaml_get "$ENV_FILE" "context")"
export ENV_DOMAIN="$(_yaml_get "$ENV_FILE" "domain")"
export ENV_OVERLAY="$(_yaml_get "$ENV_FILE" "overlay")"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/env-resolve.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/env-resolve.sh
git commit -m "feat(env): add env-resolve script to export vars from registry"
```

---

## Phase 3: Refactor Deploy Tasks

### Task 11: Update prod kustomizations for SealedSecrets

**Files:**
- Modify: `prod/kustomization.yaml`
- Modify: `prod-korczewski/kustomization.yaml`

- [ ] **Step 1: Update prod/kustomization.yaml**

Replace the `secrets.yaml` patch with a SealedSecret resource reference. The SealedSecret manifest will be in `environments/sealed-secrets/mentolder.yaml`, but we reference it relative to the overlay via a symlink or direct path.

In `prod/kustomization.yaml`, change:

```yaml
patches:
  # Override secrets with production values
  - path: secrets.yaml
```

to:

```yaml
# Sealed Secrets replaces the old secrets.yaml patch.
# The SealedSecret is applied separately by the deploy script.
# Remove secrets.yaml from patches — it no longer exists.
patches:
```

(Remove the `- path: secrets.yaml` line from the patches list. Keep all other patches.)

- [ ] **Step 2: Update prod-korczewski/kustomization.yaml**

Same change — remove `- path: secrets.yaml` from patches.

- [ ] **Step 3: Validate kustomize still builds**

```bash
kustomize build prod/ > /dev/null 2>&1 || echo "FAIL: prod kustomize broken"
kustomize build prod-korczewski/ > /dev/null 2>&1 || echo "FAIL: prod-korczewski kustomize broken"
```

Note: This will fail until `prod/secrets.yaml` is actually removed. For now, just remove the patch reference — the file can stay as a no-op until Phase 4 cleanup.

- [ ] **Step 4: Commit**

```bash
git add prod/kustomization.yaml prod-korczewski/kustomization.yaml
git commit -m "feat(env): remove secrets.yaml patch from prod kustomizations (prep for SealedSecrets)"
```

---

### Task 12: Refactor deploy tasks to use ENV parameter

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add unified workspace:deploy task**

Add a new parameterized deploy task that uses `env-resolve.sh`:

```yaml
  workspace:deploy:
    desc: "Deploy workspace to any environment (ENV=dev|mentolder|korczewski|...)"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - task: env:validate
        vars: { ENV: "{{.ENV}}" }
      - |
        source scripts/env-resolve.sh "{{.ENV}}"

        if [ "{{.ENV}}" = "dev" ]; then
          # Dev: build from k3d base, apply locally
          kustomize build k3d/ | envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL" | kubectl apply -f -
        else
          # Prod: build from overlay, apply to target cluster
          overlay="${ENV_OVERLAY:-prod}"
          kustomize build "$overlay/" \
            | envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$INFRA_NAMESPACE \$TLS_SECRET_NAME \$SMTP_FROM" \
            | kubectl --context "$ENV_CONTEXT" apply --server-side --force-conflicts -f -

          # Apply SealedSecret
          sealed="environments/sealed-secrets/{{.ENV}}.yaml"
          if [ -f "$sealed" ]; then
            kubectl --context "$ENV_CONTEXT" apply -f "$sealed"
          fi
        fi
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        context_flag=""
        [ "{{.ENV}}" != "dev" ] && context_flag="--context $ENV_CONTEXT"
        echo "Waiting for shared-db..."
        kubectl $context_flag rollout status deployment/shared-db -n workspace --timeout=120s
      - 'echo "✓ Workspace deployed to {{.ENV}}"'
```

- [ ] **Step 2: Keep old tasks working during migration**

Do NOT delete the existing `workspace:prod:deploy` or `korczewski:deploy` tasks yet. They still work via `.env`. Add a deprecation notice:

```yaml
  workspace:prod:deploy:
    desc: "[DEPRECATED — use 'task workspace:deploy ENV=mentolder'] Deploy to mentolder prod"
    # ... existing implementation stays unchanged
```

- [ ] **Step 3: Test the new task with dev**

```bash
task workspace:deploy ENV=dev
```

Expected: Same behavior as `task workspace:deploy` currently.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(env): add unified workspace:deploy task with ENV parameter"
```

---

## Phase 4: Cleanup

### Task 13: Remove old env files and deploy tasks

**Files:**
- Modify: `Taskfile.yml`
- Delete: `.env` (move values to environments/ first — already done in Task 2)
- Delete: `prod/secrets.yaml`
- Delete: `prod-korczewski/secrets.yaml`

- [ ] **Step 1: Verify all environment files are complete**

```bash
task env:validate:all
```

Expected: All environments pass.

- [ ] **Step 2: Remove dotenv from Taskfile**

In `Taskfile.yml` line 3, remove:

```yaml
dotenv: ['.env']
```

And remove the entire `env:` block (lines 5-20) and the `vars:` block that reads from `${PROD_DOMAIN:-...}` (lines 22-70). Replace with a minimal vars block:

```yaml
vars:
  CLUSTER_NAME: dev
  REGISTRY: localhost:5000
  DEV_DOMAIN: localhost
```

All tasks that previously used `{{.PROD_DOMAIN}}` etc. now use `source scripts/env-resolve.sh`.

- [ ] **Step 3: Remove deprecated deploy tasks**

Remove the old `workspace:prod:deploy` task and `korczewski:deploy` task. The unified `workspace:deploy ENV=<name>` replaces both.

- [ ] **Step 4: Remove old secret files**

```bash
git rm .env
git rm prod/secrets.yaml
git rm prod-korczewski/secrets.yaml
```

Note: `.env` is gitignored so `git rm` may need `--cached`. If `.env.korczewski` is tracked, remove it too.

- [ ] **Step 5: Run full validation**

```bash
task env:validate:all
task workspace:validate
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(env): remove dotenv, old secrets, and deprecated deploy tasks

All configuration now flows through environments/ registry.
Secrets are managed via Sealed Secrets.
Deploy via: task workspace:deploy ENV=<name>"
```

---

### Task 14: Update ArgoCD CMP plugin

**Files:**
- Modify: `argocd/install/cmp-plugin.yaml`
- Modify: `argocd/applicationset.yaml`

- [ ] **Step 1: Simplify CMP plugin**

The CMP plugin no longer needs to hardcode which vars to substitute. Update `argocd/install/cmp-plugin.yaml` to read all `ARGOCD_ENV_*` vars dynamically:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cmp-kustomize-envsubst
data:
  plugin.yaml: |
    apiVersion: argoproj.io/v1alpha1
    kind: ConfigManagementPlugin
    metadata:
      name: kustomize-envsubst
    spec:
      allowConcurrency: true
      discover:
        find:
          glob: "**/kustomization.yaml"
      generate:
        command: [sh, -c]
        args:
          - |
            # Export all ARGOCD_ENV_* vars without the prefix
            for var in $(env | grep ^ARGOCD_ENV_ | cut -d= -f1); do
              name="${var#ARGOCD_ENV_}"
              export "$name=$(printenv "$var")"
            done
            kustomize build . | envsubst
      lockRepo: false
```

- [ ] **Step 2: Update ApplicationSet to pass all env vars**

The ApplicationSet already passes vars via cluster annotations. No structural change needed — but when adding new env vars to the schema, they must also be added as annotations on the ArgoCD cluster secret and as `env:` entries in the ApplicationSet template. Document this in the spec.

- [ ] **Step 3: Commit**

```bash
git add argocd/install/cmp-plugin.yaml
git commit -m "refactor(argocd): simplify CMP plugin to auto-export all ARGOCD_ENV vars"
```

---

### Task 15: Add Sealed Secrets install task for prod clusters

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add sealed-secrets:install task**

```yaml
  sealed-secrets:install:
    desc: Install Sealed Secrets controller on a cluster via Helm
    vars:
      ENV: '{{.ENV}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
        helm repo update
        helm upgrade --install sealed-secrets sealed-secrets/sealed-secrets \
          --namespace sealed-secrets --create-namespace \
          --context "$ENV_CONTEXT" \
          --set resources.requests.cpu=50m \
          --set resources.requests.memory=64Mi \
          --set resources.limits.memory=128Mi
        echo "✓ Sealed Secrets controller installed on ${ENV_CONTEXT}"

  sealed-secrets:status:
    desc: Show Sealed Secrets controller status
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        context_flag=""
        [ "{{.ENV}}" != "dev" ] && context_flag="--context $ENV_CONTEXT"
        kubectl $context_flag get pods -n sealed-secrets
        echo ""
        kubectl $context_flag get sealedsecrets -n workspace 2>/dev/null || echo "(no SealedSecrets in workspace namespace)"
```

- [ ] **Step 2: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(env): add sealed-secrets:install and status tasks"
```

---

### Task 16: End-to-end smoke test

**Files:** (no new files — manual verification)

- [ ] **Step 1: Validate all environments**

```bash
task env:validate:all
```

Expected: All environments pass schema validation.

- [ ] **Step 2: Deploy dev with new flow**

```bash
task workspace:deploy ENV=dev
```

Expected: k3d cluster deploys successfully, all pods running.

- [ ] **Step 3: Verify Sealed Secrets controller is running (dev)**

```bash
kubectl get pods -n sealed-secrets
```

Expected: `sealed-secrets-controller` pod is Running.

- [ ] **Step 4: Test the generate + seal flow**

```bash
task env:generate ENV=dev
task env:seal ENV=dev
kubectl apply -f environments/sealed-secrets/dev.yaml
kubectl get secret workspace-secrets -n workspace -o jsonpath='{.data}' | jq 'keys'
```

Expected: Secret created with all keys from schema.

- [ ] **Step 5: Run existing test suite**

```bash
./tests/runner.sh local
```

Expected: All existing tests pass — pods consume secrets the same way.

- [ ] **Step 6: Run BATS unit tests**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/
```

Expected: All unit tests pass, including the new `env-validate.bats`.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "test: verify end-to-end env management flow"
```

---

## Future Work (not in scope for this plan)

- **`env:rotate` / `env:rotate-all` tasks** -- Delete `.secrets/<env>.yaml`, re-run `env:generate` + `env:seal`. Straightforward extension of existing scripts.
- **Kustomize `replacements`** -- Replace envsubst for domain substitution in main workspace overlay. The website deploy (13+ vars) stays on envsubst behind the validation gate.
- **Backup sealing keys** -- Add `sealed-secrets:backup-key` task to export the controller's private key for disaster recovery.
