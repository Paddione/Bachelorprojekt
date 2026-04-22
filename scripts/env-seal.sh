#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# env-seal.sh — Encrypt plaintext secrets into a SealedSecret
# ═══════════════════════════════════════════════════════════════════
# Reads plaintext secrets from environments/.secrets/<name>.yaml,
# builds a temporary K8s Secret, and encrypts it with kubeseal.
#
# Usage:
#   env-seal.sh --env <name> [--env-dir <path>]
#
# Output:
#   environments/sealed-secrets/<name>.yaml
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Globals ──────────────────────────────────────────────────────

ENV_NAME=""
ENV_DIR="environments"
FORCE=false
_TEST_SCAN_FILE=""
_TEST_DUP_FILE=""
_TEST_COMPLETENESS_FILE=""
_TEST_SCHEMA_FILE=""
_TEST_COMPLETENESS_ENV_FILE=""

# ── Helpers ──────────────────────────────────────────────────────

die() {
  echo "ERROR: $*" >&2
  exit 1
}

info() {
  echo "INFO: $*"
}

usage() {
  echo "Usage: $(basename "$0") --env <name> [--env-dir <path>]"
  exit 1
}

# ── Dev-value scanner ────────────────────────────────────────────

scan_for_dev_values() {
  local secrets_file="$1"
  local bad_keys=()

  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue
    if [[ "$line" =~ ^([A-Za-z0-9_]+):[[:space:]]*(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      value="${value%\"}"
      value="${value%\'}"
      value="${value#\"}"
      value="${value#\'}"
      value="${value// /}"

      local is_bad=false

      # dev-prefixed values (original check)
      [[ "$value" =~ ^dev[a-zA-Z0-9_] ]] && is_bad=true

      # _dev_placeholder or _placeholder suffix
      [[ "$value" == *"_dev_placeholder"* ]] && is_bad=true
      [[ "$value" == *"_placeholder" ]] && is_bad=true

      # Explicit stub values
      [[ "$value" == "not-configured" ]] && is_bad=true
      [[ "$value" == "MANAGED_EXTERNALLY" ]] && is_bad=true

      # Empty values are never valid secrets
      [[ -z "$value" ]] && is_bad=true

      $is_bad && bad_keys+=("$key")
    fi
  done < "$secrets_file"

  if [[ ${#bad_keys[@]} -gt 0 ]]; then
    echo "WARNING: The following secrets appear to contain dev placeholder values:"
    for k in "${bad_keys[@]}"; do
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

# ── Duplicate key checker ─────────────────────────────────────────

check_duplicate_keys() {
  local secrets_file="$1"
  [[ ! -f "$secrets_file" ]] && { echo "ERROR: File not found: ${secrets_file}"; return 1; }
  local duplicates=()

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    duplicates+=("$key")
  done < <(
    grep -E '^[A-Za-z0-9_]+:' "$secrets_file" \
      | sed 's/:.*//' \
      | sort \
      | uniq -d
  )

  if [[ ${#duplicates[@]} -gt 0 ]]; then
    # Duplicate keys are always an error — unlike placeholder values, there is no
    # valid reason to force-seal a structurally broken secrets file. Fix by removing
    # the duplicate entries; the last value silently wins in YAML.
    echo "ERROR: Duplicate keys found in ${secrets_file}:"
    for k in "${duplicates[@]}"; do
      echo "  ${k}"
    done
    echo "Remove duplicate entries — the last value silently wins in YAML."
    return 1
  fi
  return 0
}

# schema_keys <file> <section> — extract all "name:" values under a section
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

# yaml_get <file> <key> — extract value for a top-level key
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

# ── Schema completeness checker ──────────────────────────────────

check_schema_completeness() {
  local secrets_file="$1"
  local schema_file="$2"
  local env_file="${3:-}"
  local missing=()

  [[ ! -f "$schema_file" ]] && { echo "ERROR: Schema file not found: ${schema_file}"; return 1; }

  # Check all required secrets keys
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    local required
    required=$(schema_field "$schema_file" "secrets" "$key" "required")
    [[ "$required" != "true" ]] && continue

    if ! grep -qE "^${key}:" "$secrets_file"; then
      missing+=("${key} (secrets)")
    fi
  done < <(schema_keys "$schema_file" "secrets")

  # Check setup_vars marked sealed: true
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    local sealed
    sealed=$(schema_field "$schema_file" "setup_vars" "$key" "sealed")
    [[ "$sealed" != "true" ]] && continue

    # Only require in .secrets if the env file marks it SEALED (or no env file)
    if [[ -n "$env_file" && -f "$env_file" ]]; then
      local env_val
      env_val=$(yaml_get "$env_file" "$key")
      [[ "$env_val" != "SEALED" ]] && continue
    fi

    if ! grep -qE "^${key}:" "$secrets_file"; then
      missing+=("${key} (setup_vars, sealed: true)")
    fi
  done < <(schema_keys "$schema_file" "setup_vars")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: The following required keys are missing from ${secrets_file}:"
    for k in "${missing[@]}"; do
      echo "  ${k}"
    done
    echo ""
    echo "Add the missing values to ${secrets_file} before sealing."
    return 1
  fi
  return 0
}

# ── Parse Arguments ──────────────────────────────────────────────

[[ $# -eq 0 ]] && usage

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)              ENV_NAME="$2"; shift 2 ;;
    --env-dir)          ENV_DIR="$2"; shift 2 ;;
    --force)            FORCE=true; shift ;;
    --_test-dev-scan)        _TEST_SCAN_FILE="$2"; shift 2 ;;
    --_test-dup-check)       _TEST_DUP_FILE="$2"; shift 2 ;;
    --_test-completeness)    _TEST_COMPLETENESS_FILE="$2"; shift 2 ;;
    --_test-schema)          _TEST_SCHEMA_FILE="$2"; shift 2 ;;
    --_test-env-file)        _TEST_COMPLETENESS_ENV_FILE="$2"; shift 2 ;;
    *)                  echo "Unknown option: $1"; usage ;;
  esac
done

# ── Test-mode: only run the dev-value scan ───────────────────────

if [[ -n "$_TEST_SCAN_FILE" ]]; then
  if scan_for_dev_values "$_TEST_SCAN_FILE"; then
    echo "OK: no dev placeholder values found"
    exit 0
  else
    exit 1
  fi
fi

if [[ -n "$_TEST_DUP_FILE" ]]; then
  if check_duplicate_keys "$_TEST_DUP_FILE"; then
    echo "OK: no duplicate keys found"
    exit 0
  else
    exit 1
  fi
fi

if [[ -n "$_TEST_COMPLETENESS_FILE" ]]; then
  if check_schema_completeness "$_TEST_COMPLETENESS_FILE" "$_TEST_SCHEMA_FILE" "$_TEST_COMPLETENESS_ENV_FILE"; then
    echo "OK: all required schema keys present"
    exit 0
  else
    exit 1
  fi
fi

[[ -z "$ENV_NAME" ]] && die "--env <name> is required"

ENV_FILE="${ENV_DIR}/${ENV_NAME}.yaml"
SECRETS_FILE="${ENV_DIR}/.secrets/${ENV_NAME}.yaml"
SCHEMA="${ENV_DIR}/schema.yaml"
CERTS_DIR="${ENV_DIR}/certs"
CERT_FILE="${CERTS_DIR}/${ENV_NAME}.pem"
SEALED_DIR="${ENV_DIR}/sealed-secrets"
OUTPUT="${SEALED_DIR}/${ENV_NAME}.yaml"

# ── Validate inputs ─────────────────────────────────────────────

[[ ! -f "$ENV_FILE" ]] && die "Environment file not found: ${ENV_FILE}"
[[ ! -f "$SECRETS_FILE" ]] && die "Plaintext secrets not found: ${SECRETS_FILE} — run 'task env:generate ENV=${ENV_NAME}' first"

command -v kubeseal > /dev/null || die "kubeseal not found. Install: https://github.com/bitnami-labs/sealed-secrets#kubeseal"

# ── Read kubectl context from environment file ───────────────────

CONTEXT=$(yaml_get "$ENV_FILE" "context")
[[ -z "$CONTEXT" ]] && die "No 'context' found in ${ENV_FILE}"

info "Using kubectl context: ${CONTEXT}"

# ── Fetch sealing certificate if missing ─────────────────────────

mkdir -p "$CERTS_DIR"

if [[ ! -f "$CERT_FILE" ]]; then
  info "Fetching sealing certificate from cluster..."
  kubeseal --controller-name=sealed-secrets \
           --controller-namespace=sealed-secrets \
           --context "$CONTEXT" \
           --fetch-cert > "$CERT_FILE" \
    || die "Failed to fetch sealing certificate. Is sealed-secrets installed in the cluster?"
  info "Certificate saved to: ${CERT_FILE}"
else
  info "Using existing certificate: ${CERT_FILE}"
fi

# ── Scan for dev placeholder values ─────────────────────────────

info "Scanning secrets for dev placeholder values..."
if ! scan_for_dev_values "$SECRETS_FILE"; then
  exit 1
fi
info "No dev placeholder values detected."

info "Checking for duplicate keys..."
if ! check_duplicate_keys "$SECRETS_FILE"; then
  exit 1
fi
info "No duplicate keys detected."

info "Checking schema completeness..."
if [[ -f "$SCHEMA" ]]; then
  if ! check_schema_completeness "$SECRETS_FILE" "$SCHEMA" "$ENV_FILE"; then
    exit 1
  fi
  info "Schema completeness verified."
else
  info "No schema file found at ${SCHEMA}, skipping completeness check."
fi

# ── Build temporary K8s Secret manifest ──────────────────────────

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

SECRET_MANIFEST="${TMPDIR}/secret.yaml"

{
  echo "apiVersion: v1"
  echo "kind: Secret"
  echo "metadata:"
  echo "  name: workspace-secrets"
  echo "  namespace: workspace"
  echo "type: Opaque"
  echo "stringData:"

  # Read key-value pairs from the plaintext secrets file
  while IFS= read -r line; do
    # Skip comments and blank lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue

    # Parse KEY: "value" format
    # Use a more robust regex to handle keys with underscores and possible spaces
    if [[ "$line" =~ ^([A-Za-z0-9_]+):[[:space:]]*(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      # Strip quotes from value
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"

      echo "  ${key}: \"${value}\""
    fi
  done < "$SECRETS_FILE"
} > "$SECRET_MANIFEST"

# ── Seal the secret ──────────────────────────────────────────────

mkdir -p "$SEALED_DIR"

info "Encrypting workspace-secrets with kubeseal..."

kubeseal --cert "$CERT_FILE" \
         --format yaml \
         < "$SECRET_MANIFEST" \
         > "$OUTPUT" \
  || die "kubeseal encryption failed"

# ── Seal extra-namespace secrets (extra_namespaces in schema) ────
#
# For each unique (namespace, secret) pair declared in schema's
# extra_namespaces, build a Secret manifest containing only the
# relevant keys and append it as an additional YAML document.

seal_extra_namespace_secrets() {
  local schema_file="$1"
  local secrets_file="$2"
  local cert_file="$3"
  local output_file="$4"

  # Parse schema via python/PyYAML — handles optional dest_key (destination key
  # name in the target Secret, defaults to source key name). Emits one line per
  # (src_key, namespace, secret, dest_key) tuple, tab-separated.
  local entries
  entries=$(SCHEMA="$schema_file" python3 <<'PY'
import os, sys, yaml
with open(os.environ["SCHEMA"]) as f:
    schema = yaml.safe_load(f) or {}
for entry in schema.get("secrets") or []:
    src = entry["name"]
    for mapping in entry.get("extra_namespaces") or []:
        ns = mapping["namespace"]
        sec = mapping["secret"]
        dest = mapping.get("dest_key") or src
        print(f"{src}\t{ns}\t{sec}\t{dest}")
PY
)

  if [[ -z "$entries" ]]; then
    return 0
  fi

  # Group entries by (namespace, secret); each entry is "src:=:dest"
  declare -A ns_map=()
  while IFS=$'\t' read -r src ns sec dest; do
    [[ -z "$src" ]] && continue
    local pair="${ns}|${sec}"
    local mapping="${src}:=:${dest}"
    if [[ -v ns_map[$pair] ]]; then
      ns_map["$pair"]="${ns_map[$pair]} ${mapping}"
    else
      ns_map["$pair"]="${mapping}"
    fi
  done <<< "$entries"

  # Read all plaintext secrets into an associative array
  declare -A secret_vals
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue
    if [[ "$line" =~ ^([A-Za-z0-9_]+):[[:space:]]*(.*)$ ]]; then
      local k="${BASH_REMATCH[1]}" v="${BASH_REMATCH[2]}"
      v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
      secret_vals["$k"]="$v"
    fi
  done < "$secrets_file"

  # Seal one SealedSecret per (namespace, secret) pair
  for pair in "${!ns_map[@]}"; do
    local ns="${pair%%|*}"
    local sname="${pair##*|}"
    local mappings="${ns_map[$pair]}"

    local tmp_manifest
    tmp_manifest=$(mktemp)

    local dest_list=""
    {
      echo "apiVersion: v1"
      echo "kind: Secret"
      echo "metadata:"
      echo "  name: ${sname}"
      echo "  namespace: ${ns}"
      echo "type: Opaque"
      echo "stringData:"
      for m in $mappings; do
        local src="${m%%:=:*}"
        local dest="${m##*:=:}"
        local val="${secret_vals[$src]:-}"
        [[ -z "$val" ]] && { echo "WARNING: key ${src} not found in secrets file — skipping ${dest} in ${sname}" >&2; continue; }
        echo "  ${dest}: \"${val}\""
        dest_list="${dest_list} ${dest}"
      done
    } > "$tmp_manifest"

    info "Encrypting ${ns}/${sname} (keys:${dest_list}) with kubeseal..."
    {
      echo "---"
      kubeseal --cert "$cert_file" --format yaml < "$tmp_manifest"
    } >> "$output_file" \
      || die "kubeseal encryption failed for ${ns}/${sname}"

    rm -f "$tmp_manifest"
  done
}

seal_extra_namespace_secrets "$SCHEMA" "$SECRETS_FILE" "$CERT_FILE" "$OUTPUT"

info "SealedSecret written to: ${OUTPUT}"
info "This file is safe to commit to git."
