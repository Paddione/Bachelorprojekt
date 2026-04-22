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

# kc_assert_no_placeholders INPUT
#   Exits non-zero (returns 1) if INPUT still contains any ${NAME} token
#   where NAME matches [A-Z0-9_]+. Prints each offending token on its own
#   line (sorted, deduped) before returning.
kc_assert_no_placeholders() {
  local input="$1"
  local leftover
  leftover=$(printf '%s' "$input" | grep -oE '\$\{[A-Z0-9_]+\}' | sort -u || true)
  if [ -n "$leftover" ]; then
    printf 'unresolved placeholders:\n%s\n' "$leftover" >&2
    # bats `run` captures both stdout and stderr into $output, so mirror to stdout.
    printf 'unresolved placeholders:\n%s\n' "$leftover"
    return 1
  fi
  return 0
}

# kc_extract_clients_from_template FILE
#   Reads the realm template JSON at FILE and prints each element of the
#   .clients[] array on its own line as compact JSON (NDJSON). Requires jq.
kc_extract_clients_from_template() {
  local file="$1"
  jq -c '.clients[]' "$file"
}
