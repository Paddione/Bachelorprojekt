#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# keycloak-helpers.sh — Pure helpers for keycloak-sync.sh
# Sourced; do NOT execute directly.
# ═══════════════════════════════════════════════════════════════════════

# kc_substitute_placeholders INPUT KV
#   Replaces every occurrence of ${NAME} in INPUT with the value of NAME
#   found in KV. KV is newline-separated KEY=VALUE pairs.
#   Uses `|` as the sed delimiter so URL-style values pass through unharmed.
#   Values containing a literal `|` would break this — callers must not pass them
#   (OIDC secrets and domain names in this project are base64/URL-safe).
kc_substitute_placeholders() {
  local input="$1"
  local kv="$2"
  local key val
  local out="$input"
  while IFS='=' read -r key val; do
    [ -z "$key" ] && continue
    # Escape &, \, | in the replacement to keep sed happy.
    local esc
    esc=$(printf '%s' "$val" | sed 's/[\&|]/\\&/g')
    out=$(printf '%s' "$out" | sed "s|\${${key}}|${esc}|g")
  done <<< "$kv"
  printf '%s' "$out"
}
