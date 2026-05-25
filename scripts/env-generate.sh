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
  echo "INFO: $*" >&2
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

# env_file_var <file> <key> [section] — read a scalar from a section of an env file
# Section defaults to env_vars. Use setup_vars to read identity/setup values.
env_file_var() {
  local file="$1" key="$2" section="${3:-env_vars}"
  [[ -f "$file" ]] || return 0
  awk -v keyname="$key" -v sect="$section" '
    $0 ~ "^" sect ":" { in_sect=1; next }
    /^[a-z_]+:/ { in_sect=0 }
    in_sect && $0 ~ "^[[:space:]]+" keyname ":" {
      val = $0
      sub(/^[^:]*:[[:space:]]*/, "", val)
      gsub(/^["'\'']|["'\'']$/, "", val)
      sub(/[[:space:]]+$/, "", val)
      print val
      exit
    }
  ' "$file"
}

# can_prompt — true if a tty is reachable for an interactive read.
# `-r /dev/tty` is not enough: the special file exists even in non-interactive
# contexts (cron, CI), but opening it fails with ENXIO. Probe by actually
# attempting to open it for reading.
can_prompt() {
  ( : </dev/tty ) 2>/dev/null
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
ENV_FILE="${ENV_DIR}/${ENV_NAME}.yaml"
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
    required=$(schema_field "$SCHEMA" "secrets" "$key" "required")
    default_dev=$(schema_field "$SCHEMA" "secrets" "$key" "default_dev")

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
      continue
    fi

    # generate: false — try several sources before prompting

    # 1. Copy from env file env_vars (keeps SMTP_FROM/SMTP_USER in sync)
    env_value=$(env_file_var "$ENV_FILE" "$key")
    if [[ -n "$env_value" ]]; then
      echo "${key}: \"${env_value}\""
      info "  Set: ${key} (copied from ${ENV_FILE})"
      continue
    fi

    # 2. Schema default_dev (dev env only). Check the secret entry first, then
    # the matching env_vars entry — some keys (SMTP_FROM, SMTP_USER) appear in
    # both sections and only the env_vars entry carries a default.
    if [[ "$ENV_NAME" == "dev" ]]; then
      if [[ -n "$default_dev" ]]; then
        echo "${key}: \"${default_dev}\""
        info "  Set: ${key} (schema default_dev)"
        continue
      fi
      env_default=$(schema_field "$SCHEMA" "env_vars" "$key" "default_dev")
      if [[ -n "$env_default" ]]; then
        echo "${key}: \"${env_default}\""
        info "  Set: ${key} (schema env_vars.default_dev)"
        continue
      fi
    fi

    # 3. Optional + no source — skip silently
    if [[ "$required" != "true" ]]; then
      info "  Skipped: ${key} (optional, no value provided)"
      continue
    fi

    # 4. Required — prompt if a tty is reachable, else die
    if can_prompt; then
      echo "" >&2
      read -rp "Enter value for ${key}: " user_value </dev/tty
      if [[ -z "$user_value" ]]; then
        die "No value provided for required secret: ${key}"
      fi
      echo "${key}: \"${user_value}\""
      info "  Set: ${key} (user-provided)"
    else
      die "Required secret '${key}' has no value and no tty for prompting. Add it to ${ENV_FILE} (env_vars:) or pipe input."
    fi
  done <<< "$secret_keys"

  # setup_vars with sealed: true live in the K8s secret too.
  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    sealed=$(schema_field "$SCHEMA" "setup_vars" "$key" "sealed")
    [[ "$sealed" != "true" ]] && continue

    required=$(schema_field "$SCHEMA" "setup_vars" "$key" "required")
    default_dev=$(schema_field "$SCHEMA" "setup_vars" "$key" "default_dev")

    # 1. Copy from env file setup_vars section
    env_value=$(env_file_var "$ENV_FILE" "$key" "setup_vars")
    if [[ -n "$env_value" ]]; then
      echo "${key}: \"${env_value}\""
      info "  Set: ${key} (copied from ${ENV_FILE} setup_vars)"
      continue
    fi

    # 2. Schema default_dev (dev only)
    if [[ "$ENV_NAME" == "dev" && -n "$default_dev" ]]; then
      echo "${key}: \"${default_dev}\""
      info "  Set: ${key} (schema default_dev)"
      continue
    fi

    # 3. Optional + no source — skip
    if [[ "$required" != "true" ]]; then
      info "  Skipped: ${key} (optional setup_var, no value provided)"
      continue
    fi

    # 4. Required — prompt or die
    if can_prompt; then
      echo "" >&2
      read -rp "Enter value for ${key} (setup_var, sealed): " user_value </dev/tty
      if [[ -z "$user_value" ]]; then
        die "No value provided for sealed setup_var: ${key}"
      fi
      echo "${key}: \"${user_value}\""
      info "  Set: ${key} (sealed setup_var, user-provided)"
    else
      die "Required sealed setup_var '${key}' has no value and no tty for prompting. Add it to ${ENV_FILE} (setup_vars:)."
    fi
  done <<< "$setup_keys"
} > "$OUTPUT"

chmod 600 "$OUTPUT"

info "Secrets written to: ${OUTPUT}"
info "Next step: run 'task env:seal ENV=${ENV_NAME}' to encrypt into a SealedSecret"
