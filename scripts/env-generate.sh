#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# env-generate.sh — Generate secrets from schema for an environment
# ═══════════════════════════════════════════════════════════════════
# Reads the secrets section from environments/schema.yaml and
# generates random passwords or prompts interactively.
#
# Usage:
#   env-generate.sh --env <name> [--env-dir <path>]
#
# Output:
#   environments/.secrets/<name>.yaml (KEY: "value" format)
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

SCHEMA="${ENV_DIR}/schema.yaml"
SECRETS_DIR="${ENV_DIR}/.secrets"
OUTPUT="${SECRETS_DIR}/${ENV_NAME}.yaml"

[[ ! -f "$SCHEMA" ]] && die "Schema file not found: ${SCHEMA}"

# ── Refuse to overwrite ─────────────────────────────────────────

if [[ -f "$OUTPUT" ]]; then
  die "Secrets file already exists: ${OUTPUT} — remove it first to regenerate"
fi

# ── Generate secrets ─────────────────────────────────────────────

mkdir -p "$SECRETS_DIR"

info "Generating secrets for environment: ${ENV_NAME}"

secret_keys=$(schema_keys "$SCHEMA" "secrets")
setup_keys=$(schema_keys "$SCHEMA" "setup_vars")

{
  echo "# Plaintext secrets for environment: ${ENV_NAME}"
  echo "# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# WARNING: This file contains sensitive values. Do NOT commit to git."
  echo ""

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue

    generate=$(schema_field "$SCHEMA" "secrets" "$key" "generate")
    length=$(schema_field "$SCHEMA" "secrets" "$key" "length")
    encoding=$(schema_field "$SCHEMA" "secrets" "$key" "encoding")

    if [[ "$generate" == "true" ]]; then
      hex_len=${length:-32}
      raw_value=$(openssl rand -hex "$hex_len")

      if [[ "$encoding" == "base64" ]]; then
        encoded=$(echo -n "$raw_value" | base64 -w0)
        value="base64:${encoded}"
      else
        value="$raw_value"
      fi

      echo "${key}: \"${value}\""
      info "  Generated: ${key} (${hex_len} hex chars)"
    else
      echo "" >&2
      read -rp "Enter value for ${key}: " user_value </dev/tty
      if [[ -z "$user_value" ]]; then
        die "No value provided for required secret: ${key}"
      fi
      echo "${key}: \"${user_value}\""
      info "  Set: ${key} (user-provided)"
    fi
  done <<< "$secret_keys"

  # Prompt for setup_vars that are sealed: true (passwords that live in the K8s secret)
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    sealed=$(schema_field "$SCHEMA" "setup_vars" "$key" "sealed")
    [[ "$sealed" != "true" ]] && continue

    echo "" >&2
    read -rp "Enter value for ${key} (setup_var, sealed): " user_value </dev/tty
    if [[ -z "$user_value" ]]; then
      die "No value provided for sealed setup_var: ${key}"
    fi
    echo "${key}: \"${user_value}\""
    info "  Set: ${key} (sealed setup_var, user-provided)"
  done <<< "$setup_keys"
} > "$OUTPUT"

chmod 600 "$OUTPUT"

info "Secrets written to: ${OUTPUT}"
info "Next step: run 'task env:seal ENV=${ENV_NAME}' to encrypt into a SealedSecret"
