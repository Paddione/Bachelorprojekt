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

# ── Parse Arguments ──────────────────────────────────────────────

[[ $# -eq 0 ]] && usage

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)              ENV_NAME="$2"; shift 2 ;;
    --env-dir)          ENV_DIR="$2"; shift 2 ;;
    --force)            FORCE=true; shift ;;
    --_test-dev-scan)   _TEST_SCAN_FILE="$2"; shift 2 ;;
    --_test-dup-check)  _TEST_DUP_FILE="$2"; shift 2 ;;
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

[[ -z "$ENV_NAME" ]] && die "--env <name> is required"

ENV_FILE="${ENV_DIR}/${ENV_NAME}.yaml"
SECRETS_FILE="${ENV_DIR}/.secrets/${ENV_NAME}.yaml"
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

info "Encrypting secrets with kubeseal..."

kubeseal --cert "$CERT_FILE" \
         --format yaml \
         < "$SECRET_MANIFEST" \
         > "$OUTPUT" \
  || die "kubeseal encryption failed"

info "SealedSecret written to: ${OUTPUT}"
info "This file is safe to commit to git."
