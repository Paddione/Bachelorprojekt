#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# env-resolve.sh — Resolve and export all variables for an environment
# ═══════════════════════════════════════════════════════════════════
# Reads an environment file + schema defaults and exports all
# variables as shell environment variables.
#
# Usage:
#   source scripts/env-resolve.sh <env-name> [env-dir]
#
# Exports:
#   - All env_vars as shell variables (e.g. export PROD_DOMAIN=mentolder.de)
#   - All setup_vars as shell variables
#   - ENV_CONTEXT — kubectl context from environment file
#   - ENV_DOMAIN  — domain from environment file
#   - ENV_OVERLAY — overlay from environment file (empty if not set)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Arguments ────────────────────────────────────────────────────

_ENV_NAME="${1:-}"
_ENV_DIR="${2:-environments}"

if [[ -z "$_ENV_NAME" ]]; then
  echo "ERROR: Usage: source scripts/env-resolve.sh <env-name> [env-dir]" >&2
  return 1 2>/dev/null || exit 1
fi

_SCHEMA="${_ENV_DIR}/schema.yaml"
_ENV_FILE="${_ENV_DIR}/${_ENV_NAME}.yaml"

if [[ ! -f "$_SCHEMA" ]]; then
  echo "ERROR: Schema file not found: ${_SCHEMA}" >&2
  return 1 2>/dev/null || exit 1
fi

if [[ ! -f "$_ENV_FILE" ]]; then
  echo "ERROR: Environment file not found: ${_ENV_FILE}" >&2
  return 1 2>/dev/null || exit 1
fi

# ── Helpers (prefixed to avoid namespace collisions) ─────────────

# _resolve_yaml_get <file> <key> — extract value for a key
_resolve_yaml_get() {
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

# _resolve_schema_keys <file> <section> — extract all "name:" values under a section
_resolve_schema_keys() {
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

# _resolve_schema_field <file> <section> <key> <field>
_resolve_schema_field() {
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

# ── Detect if this is a dev environment ──────────────────────────

_env_type=$(_resolve_yaml_get "$_ENV_FILE" "environment")
_is_dev=false
[[ "$_env_type" == "dev" ]] && _is_dev=true

# ── Export convenience vars ──────────────────────────────────────

ENV_CONTEXT=$(_resolve_yaml_get "$_ENV_FILE" "context")
ENV_DOMAIN=$(_resolve_yaml_get "$_ENV_FILE" "domain")
ENV_OVERLAY=$(_resolve_yaml_get "$_ENV_FILE" "overlay")
export ENV_CONTEXT ENV_DOMAIN ENV_OVERLAY

# ── Export env_vars ──────────────────────────────────────────────

_env_keys=$(_resolve_schema_keys "$_SCHEMA" "env_vars")

while IFS= read -r _key; do
  [[ -z "$_key" ]] && continue

  _val=$(_resolve_yaml_get "$_ENV_FILE" "$_key")

  # Dev environments fall back to default_dev from schema
  if [[ -z "$_val" && "$_is_dev" == "true" ]]; then
    _val=$(_resolve_schema_field "$_SCHEMA" "env_vars" "$_key" "default_dev")
  fi

  if [[ -n "$_val" ]]; then
    export "${_key}=${_val}"
  fi
done <<< "$_env_keys"

# ── Export setup_vars ────────────────────────────────────────────

_setup_keys=$(_resolve_schema_keys "$_SCHEMA" "setup_vars")

while IFS= read -r _key; do
  [[ -z "$_key" ]] && continue

  _val=$(_resolve_yaml_get "$_ENV_FILE" "$_key")

  if [[ -n "$_val" ]]; then
    export "${_key}=${_val}"
  fi
done <<< "$_setup_keys"

# ── Cleanup internal vars ───────────────────────────────────────

unset _ENV_NAME _ENV_DIR _SCHEMA _ENV_FILE _env_type _is_dev
unset _env_keys _setup_keys _key _val
