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
    --env)     ENV_NAME="$2"; shift 2 ;;
    --env-dir) ENV_DIR="$2"; shift 2 ;;
    *)         echo "Unknown option: $1"; usage ;;
  esac
done

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
  # The upstream chart deploys the controller as Deployment/Service name 'sealed-secrets'
  # (not 'sealed-secrets-controller'). Some clusters proxy the service endpoint unreliably,
  # so fall back to a short-lived port-forward if --fetch-cert fails.
  if ! kubeseal --controller-name=sealed-secrets \
                --controller-namespace=sealed-secrets \
                --context "$CONTEXT" \
                --fetch-cert > "$CERT_FILE" 2>/dev/null; then
    info "kubeseal --fetch-cert failed; falling back to port-forward"
    kubectl --context "$CONTEXT" -n sealed-secrets port-forward svc/sealed-secrets 18080:8080 \
      > /dev/null 2>&1 &
    PF_PID=$!
    trap 'kill $PF_PID 2>/dev/null || true' EXIT
    sleep 1
    curl -sSf http://localhost:18080/v1/cert.pem > "$CERT_FILE" \
      || die "Failed to fetch sealing certificate (both methods). Is sealed-secrets installed?"
    kill "$PF_PID" 2>/dev/null || true
    trap - EXIT
  fi
  info "Certificate saved to: ${CERT_FILE}"
else
  info "Using existing certificate: ${CERT_FILE}"
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
    key=$(echo "$line" | sed 's/:.*//')
    value=$(echo "$line" | sed 's/^[^:]*:[[:space:]]*//' | sed 's/^"//' | sed 's/"$//')

    echo "  ${key}: \"${value}\""
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
