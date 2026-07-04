#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# secret-rotate.sh — Rotate secrets after transcript exposure
# Usage: secret-rotate.sh [--env <name>] [--force] [--env-dir <path>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEFAULT_ENV_DIR="${PROJECT_DIR}/environments"

ENV_NAME=""
FORCE=false
CUSTOM_ENV_DIR=""

# ── Parse Arguments ───────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV_NAME="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    --_test-env-dir|--env-dir) CUSTOM_ENV_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Determine environments to process ─────────────────────────────

if [[ -n "$CUSTOM_ENV_DIR" ]]; then
  ENV_DIR="$CUSTOM_ENV_DIR"
else
  ENV_DIR="${DEFAULT_ENV_DIR}"
fi

SECRETS_FILE="${ENV_DIR}/.secrets/${ENV_NAME}.yaml"
SEALED_OUTPUT="${ENV_DIR}/sealed-secrets/${ENV_NAME}.yaml"

[[ ! -f "$SECRETS_FILE" ]] && { echo "❌ Secrets file missing: ${SECRETS_FILE}"; exit 1; }

echo "🔐 Rotating secrets for environment: $ENV_NAME"
echo "   Directory: $ENV_DIR"

# Check if secrets already exist (normal rotation should fail without --force)
if [[ "$FORCE" != "true" ]]; then
  echo "❌ Secrets file exists: ${SECRETS_FILE}"
  echo "   Run with --force to force regeneration after exposure"
  exit 1
fi

# Remove old secrets and regenerate (rotation)
rm -f "$SECRETS_FILE"

echo ""
echo "📄 Generating new secrets..."
bash "${SCRIPT_DIR}/env-generate.sh" --env "$ENV_NAME" --env-dir "$ENV_DIR" || {
  echo "❌ Failed to generate new secrets for $ENV_NAME"
  exit 1
}

[[ ! -f "$SECRETS_FILE" ]] && { echo "❌ New secrets file missing: ${SECRETS_FILE}"; exit 1; }

# Re-seal the rotated secrets
echo "🔒 Sealing new secrets..."
bash "${SCRIPT_DIR}/env-seal.sh" --env "$ENV_NAME" --env-dir "$ENV_DIR" || {
  echo "❌ Failed to seal new secrets for $ENV_NAME"
  exit 1
}

[[ ! -f "$SEALED_OUTPUT" ]] && { echo "❌ Sealed secret missing: ${SEALED_OUTPUT}"; exit 1; }

echo ""
echo "✅ Secrets rotated successfully!"
