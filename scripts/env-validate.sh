#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# env-validate.sh — Pre-deploy environment validation gate
# ═══════════════════════════════════════════════════════════════════
# Validates environment files against environments/schema.yaml.
#
# Usage:
#   env-validate.sh --env <name> [--env-dir <path>] [--schema-only] [--strict]
#   env-validate.sh --drift [--env-dir <path>] [--schema-only] [--strict]
#
# Modes:
#   --env <name>    Validate a single environment file
#   --drift         Cross-environment drift detection
#
# Options:
#   --env-dir <p>   Path to environments directory (default: environments)
#   --schema-only   Skip cluster reachability check (for CI)
#   --strict        Treat drift warnings as errors
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Globals ──────────────────────────────────────────────────────

ERRORS=0
ENV_NAME=""
ENV_DIR="environments"
SCHEMA_ONLY=false
STRICT=false
DRIFT=false

PLACEHOLDERS="yourdomain\.tld|yourbrand\.tld|info@yourdomain\.tld|MANAGED_EXTERNALLY|REPLACE_ME|FILL_FROM_ENV"

# ── Helpers ──────────────────────────────────────────────────────

die() {
  echo "ERROR: $*" >&2
  ((ERRORS++)) || true
}

info() {
  echo "INFO: $*"
}

ok() {
  echo "  OK: $*"
}

usage() {
  echo "Usage: $(basename "$0") --env <name> [--env-dir <path>] [--schema-only] [--strict]"
  echo "       $(basename "$0") --drift [--env-dir <path>] [--schema-only] [--strict]"
  exit 1
}

# yaml_get <file> <key> — extract value for a top-level or env_vars/setup_vars key
yaml_get() {
  local file="$1" key="$2"
  local line
  line=$(grep -E "^[[:space:]]*${key}:" "$file" 2>/dev/null | head -1) || true
  if [[ -z "$line" ]]; then
    return 0
  fi
  echo "$line" \
    | sed 's/^[^:]*:[[:space:]]*//' \
    | sed 's/^["'"'"']//' \
    | sed 's/["'"'"']$//' \
    | sed 's/[[:space:]]*$//'
}

# schema_keys <file> <section> — extract all "name:" values under a section
# section is one of: env_vars, secrets, setup_vars
schema_keys() {
  local file="$1" section="$2"
  awk -v sect="$section" '
    /^[a-z_]+:/ { in_sect = ($0 ~ "^" sect ":"); next }
    in_sect && /^[[:space:]]*- name:/ {
      sub(/^[[:space:]]*- name:[[:space:]]*/, "")
      gsub(/"/, "")
      print
    }
  ' "$file"
}

# schema_field <file> <section> <key> <field> — get a field for a specific key
schema_field() {
  local file="$1" section="$2" key="$3" field="$4"
  awk -v sect="$section" -v keyname="$key" -v fname="$field" '
    /^[a-z_]+:/ { in_sect = ($0 ~ "^" sect ":"); next }
    in_sect && /^[[:space:]]*- name:/ {
      sub(/^[[:space:]]*- name:[[:space:]]*/, "")
      gsub(/"/, "")
      current_key = $0
      next
    }
    in_sect && current_key == keyname && $0 ~ "^[[:space:]]+" fname ":" {
      val = $0
      sub(/^[^:]*:[[:space:]]*/, "", val)
      gsub(/"/, "", val)
      print val
      exit
    }
  ' "$file"
}

# sealed_secret_keys <file> — extract keys from encryptedData section.
# Keys may contain digits (e.g. OAUTH2_PROXY_COOKIE_SECRET), so the character
# class must include [0-9] — the old [A-Z_]+ pattern silently skipped them.
sealed_secret_keys() {
  local file="$1"
  awk '
    /^[[:space:]]*encryptedData:/ { in_enc=1; next }
    in_enc && /^[[:space:]]+[A-Z0-9_]+:/ {
      sub(/^[[:space:]]+/, "")
      sub(/:.*/, "")
      print
    }
    in_enc && /^[[:space:]]*[a-z]/ && !/^[[:space:]]+[A-Z0-9_]+:/ { in_enc=0 }
  ' "$file"
}

# ── Parse Arguments ──────────────────────────────────────────────

[[ $# -eq 0 ]] && usage

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)     ENV_NAME="$2"; shift 2 ;;
    --env-dir) ENV_DIR="$2"; shift 2 ;;
    --schema-only) SCHEMA_ONLY=true; shift ;;
    --strict)  STRICT=true; shift ;;
    --drift)   DRIFT=true; shift ;;
    *)         echo "Unknown option: $1"; usage ;;
  esac
done

SCHEMA="${ENV_DIR}/schema.yaml"

if [[ ! -f "$SCHEMA" ]]; then
  echo "ERROR: Schema file not found: ${SCHEMA}" >&2
  exit 1
fi

# ── Drift Detection Mode ────────────────────────────────────────

run_drift() {
  info "Running cross-environment drift detection"

  # Collect all env files (exclude schema)
  local env_files=()
  for f in "${ENV_DIR}"/*.yaml; do
    [[ "$(basename "$f")" == "schema.yaml" ]] && continue
    [[ -f "$f" ]] && env_files+=("$f")
  done

  if [[ ${#env_files[@]} -lt 2 ]]; then
    info "Need at least 2 environment files for drift detection"
    return 0
  fi

  # Get the set of env_var keys from schema
  local schema_env_keys
  schema_env_keys=$(schema_keys "$SCHEMA" "env_vars")

  # For each non-dev env, check it defines all schema env_vars
  local drift_warnings=0
  for ef in "${env_files[@]}"; do
    local ename
    ename=$(yaml_get "$ef" "environment")
    [[ "$ename" == "dev" ]] && continue

    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      local val
      val=$(yaml_get "$ef" "$key")
      if [[ -z "$val" ]]; then
        echo "DRIFT: ${ename} is missing env_var ${key}"
        ((drift_warnings++)) || true
      fi
    done <<< "$schema_env_keys"
  done

  if [[ $drift_warnings -gt 0 ]]; then
    echo "Drift detection found ${drift_warnings} warning(s)"
    if [[ "$STRICT" == "true" ]]; then
      die "Strict mode: drift warnings treated as errors"
    fi
  else
    ok "No drift detected across ${#env_files[@]} environments"
  fi
}

# ── Single Environment Validation ───────────────────────────────

validate_env() {
  local env_name="$1"
  local env_file="${ENV_DIR}/${env_name}.yaml"

  if [[ ! -f "$env_file" ]]; then
    echo "ERROR: Environment file not found: ${env_file}" >&2
    exit 1
  fi

  local is_dev=false
  local env_type
  env_type=$(yaml_get "$env_file" "environment")
  [[ "$env_type" == "dev" ]] && is_dev=true

  local secrets_mode
  secrets_mode=$(yaml_get "$env_file" "secrets_mode")
  local secrets_ref
  secrets_ref=$(yaml_get "$env_file" "secrets_ref")

  info "Validating environment: ${env_name} (dev=${is_dev})"

  # ── 1. Check required env_vars ───────────────────────────────
  local schema_env_keys
  schema_env_keys=$(schema_keys "$SCHEMA" "env_vars")

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue

    # Check if required
    local required
    required=$(schema_field "$SCHEMA" "env_vars" "$key" "required")
    [[ "$required" != "true" ]] && continue

    local val
    val=$(yaml_get "$env_file" "$key")

    # Dev environments can fall back to default_dev
    if [[ -z "$val" && "$is_dev" == "true" ]]; then
      local default_dev
      default_dev=$(schema_field "$SCHEMA" "env_vars" "$key" "default_dev")
      if [[ -n "$default_dev" ]]; then
        val="$default_dev"
      fi
    fi

    if [[ -z "$val" ]]; then
      die "Missing required env_var: ${key}"
      continue
    fi

    # ── 2. Regex validation ──────────────────────────────────────
    local pattern
    pattern=$(schema_field "$SCHEMA" "env_vars" "$key" "validate")
    if [[ -n "$pattern" ]]; then
      if ! echo "$val" | grep -qE "$pattern"; then
        die "env_var ${key}='${val}' does not match pattern: ${pattern}"
      fi
    fi

    # ── 3. Placeholder detection ─────────────────────────────────
    if echo "$val" | grep -qE "$PLACEHOLDERS"; then
      die "env_var ${key}='${val}' contains placeholder value"
    fi
  done <<< "$schema_env_keys"

  # ── 4. Check required setup_vars ─────────────────────────────
  local schema_setup_keys
  schema_setup_keys=$(schema_keys "$SCHEMA" "setup_vars")

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue

    local required
    required=$(schema_field "$SCHEMA" "setup_vars" "$key" "required")
    [[ "$required" != "true" ]] && continue

    local val
    val=$(yaml_get "$env_file" "$key")

    if [[ -z "$val" ]]; then
      die "Missing required setup_var: ${key}"
      continue
    fi

    # Regex validation for setup_vars
    local pattern
    pattern=$(schema_field "$SCHEMA" "setup_vars" "$key" "validate")
    if [[ -n "$pattern" ]]; then
      if ! echo "$val" | grep -qE "$pattern"; then
        die "setup_var ${key}='${val}' does not match pattern: ${pattern}"
      fi
    fi
  done <<< "$schema_setup_keys"

  # ── 5. Sealed secrets validation (non-plaintext only) ────────
  if [[ "$secrets_mode" != "plaintext" && -n "$secrets_ref" ]]; then
    local sealed_file="${ENV_DIR}/${secrets_ref}"
    if [[ ! -f "$sealed_file" ]]; then
      die "Sealed secret file not found: ${secrets_ref}"
    else
      # Check all required secret keys are present
      local schema_secret_keys
      schema_secret_keys=$(schema_keys "$SCHEMA" "secrets")
      local sealed_keys
      sealed_keys=$(sealed_secret_keys "$sealed_file")

      while IFS= read -r key; do
        [[ -z "$key" ]] && continue
        local required
        required=$(schema_field "$SCHEMA" "secrets" "$key" "required")
        [[ "$required" != "true" ]] && continue

        if ! echo "$sealed_keys" | grep -qx "$key"; then
          die "Sealed secret missing required key: ${key}"
        fi
      done <<< "$schema_secret_keys"
    fi
  fi

  # ── 6. Cluster reachability (unless --schema-only) ───────────
  if [[ "$SCHEMA_ONLY" != "true" ]]; then
    local ctx
    ctx=$(yaml_get "$env_file" "context")
    if [[ -n "$ctx" ]]; then
      if ! kubectl --context="$ctx" cluster-info &>/dev/null; then
        die "Cluster context '${ctx}' is not reachable"
      else
        ok "Cluster context '${ctx}' is reachable"
      fi
    fi
  fi

  # ── Summary ──────────────────────────────────────────────────
  if [[ $ERRORS -eq 0 ]]; then
    ok "Environment '${env_name}' passed all checks"
  else
    echo "FAIL: Environment '${env_name}' has ${ERRORS} error(s)" >&2
  fi
}

# ── Main ─────────────────────────────────────────────────────────

if [[ "$DRIFT" == "true" ]]; then
  run_drift
else
  if [[ -z "$ENV_NAME" ]]; then
    echo "ERROR: --env <name> or --drift required" >&2
    usage
  fi
  validate_env "$ENV_NAME"
fi

exit "$ERRORS"
