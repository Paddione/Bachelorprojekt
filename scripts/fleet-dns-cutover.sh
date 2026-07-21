#!/usr/bin/env bash
# fleet-dns-cutover.sh — surgically flip a brand's cluster A-records onto the
# fleet nodes via the ipv64.net Bearer REST API, with rollback-state capture.
#
# Touches ONLY A records for the fixed prefix allowlist (@, *, livekit, stream,
# turn). It never references MX / TXT / CNAME (mail) records, so email keeps
# working across the cutover — this safety is structural, not conditional.
#
# Usage (env vars come from `source scripts/env-resolve.sh <env>`):
#   PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
#       bash scripts/fleet-dns-cutover.sh plan       # dry-run, prints change set
#   ... IPV64_API_KEY=xxx fleet-dns-cutover.sh cutover    # capture state + apply
#   ... IPV64_API_KEY=xxx fleet-dns-cutover.sh rollback   # restore from state file
set -euo pipefail

# Fleet node public IPs — root (@) and wildcard (*) round-robin across all three.
FLEET_NODE_IPS=("204.168.244.104" "37.27.251.38" "62.238.23.79")
# A-record prefix allowlist. "" = root @, "*" = wildcard. NO mail prefixes, ever.
ROOTLIKE_PREFIXES=("" "*")
SERVICE_PREFIXES=("stream" "turn")

IPV64_API="${IPV64_API:-https://ipv64.net/api}"
STATE_DIR="${FLEET_DNS_STATE_DIR:-/tmp}"

require() { [ -n "${!1:-}" ] || { echo "ERROR: $1 not set" >&2; exit 1; }; }

# Emit the full set of A records to set, one per line, as TYPE|PREFIX|IP.
# A "@" prefix is printed for the root (empty praefix) for human readability;
# apply_record() maps "@" back to the empty praefix the ipv64 API expects.
build_change_set() {
  require PROD_DOMAIN
  local p ip label
  for p in "${ROOTLIKE_PREFIXES[@]}"; do
    label="${p:-@}"
    for ip in "${FLEET_NODE_IPS[@]}"; do echo "A|${label}|${ip}"; done
  done
  for p in "${SERVICE_PREFIXES[@]}"; do
    if [ "$p" = "turn" ]; then
      echo "A|${p}|${TURN_PUBLIC_IP:-204.168.244.104}"
    else
      echo "A|${p}|${STREAM_PIN_IP:-204.168.244.104}"
    fi
  done
}

# State file path for the active domain.
state_file() { echo "${STATE_DIR}/fleet-dns-rollback-${PROD_DOMAIN}.state"; }

# Map the human "@" label back to the empty praefix the ipv64 API expects.
_praefix() { [ "$1" = "@" ] && echo "" || echo "$1"; }

# ipv64 has no atomic multi-set, so a prefix is cleared once (DELETE removes ALL
# A records for that praefix) and then each desired IP is POSTed. The earlier
# apply_record() deleted before EVERY add, which collapsed multi-IP round-robin
# prefixes (@ and *) to only their LAST IP — callers below now delete a prefix
# exactly once (seen-tracker) before adding its records.
delete_prefix_a() {
  local px; px="$(_praefix "$1")"
  curl -fsS -X DELETE "${IPV64_API}" \
    -H "Authorization: Bearer ${IPV64_API_KEY}" \
    --data-urlencode "domain=${PROD_DOMAIN}" \
    --data-urlencode "praefix=${px}" \
    --data-urlencode "type=A" \
    -H "Content-Type: application/x-www-form-urlencoded" || true
}
add_one_a() {
  local px; px="$(_praefix "$1")"
  curl -fsS -X POST "${IPV64_API}" \
    -H "Authorization: Bearer ${IPV64_API_KEY}" \
    --data-urlencode "domain=${PROD_DOMAIN}" \
    --data-urlencode "praefix=${px}" \
    --data-urlencode "type=A" \
    --data-urlencode "content=${2}" \
    -H "Content-Type: application/x-www-form-urlencoded"
}

# Capture the current A records we are about to overwrite, into the state file.
# Best-effort read via get_domains; the runbook also records old IPs manually as
# the authoritative fallback. Writes one "A|<label>|<ip>" line per current value.
capture_rollback_state() {
  require IPV64_API_KEY
  local sf; sf="$(state_file)"
  : > "$sf"
  local resp; resp="$(curl -fsS "${IPV64_API}?get_domains" \
    -H "Authorization: Bearer ${IPV64_API_KEY}" || echo '{}')"
  # Extract A records for the allowlisted prefixes. The exact JSON path MUST be
  # confirmed against a live get_domains response (runbook prereq step); this
  # jq filter targets the documented record_info[] array.
  local p label px
  for p in "${ROOTLIKE_PREFIXES[@]}" "${SERVICE_PREFIXES[@]}"; do
    label="${p:-@}"; px="$(_praefix "$label")"
    echo "$resp" | jq -r --arg px "$px" '
      (.record_info // [])[]?
      | select(.type=="A" and (.praefix // "")==$px)
      | "A|" + (if (.praefix // "")=="" then "@" else .praefix end) + "|" + .content
    ' >> "$sf" 2>/dev/null || true
  done
  echo "Rollback state written to $sf ($(wc -l < "$sf") records)"
}

cmd_plan() {
  # Validate in the main shell: build_change_set's require runs inside the
  # process-substitution subshell below, whose exit can't abort cmd_plan.
  require PROD_DOMAIN
  echo "DNS cutover plan for ${PROD_DOMAIN:-<unset>} (DRY-RUN — no API calls):"
  local line
  while IFS= read -r line; do echo "CHANGE: ${line}"; done < <(build_change_set)
}

cmd_cutover() {
  require PROD_DOMAIN; require IPV64_API_KEY
  capture_rollback_state
  local type label ip seen=" "
  while IFS='|' read -r type label ip; do
    [ "$type" = "A" ] || { echo "refusing non-A change: $type" >&2; exit 4; }
    # Quote ${label} inside the pattern so a "*" prefix is matched literally,
    # not as a glob. Delete each prefix exactly once before adding its IPs.
    if [[ "$seen" != *" ${label} "* ]]; then delete_prefix_a "$label"; seen="${seen}${label} "; fi
    add_one_a "$label" "$ip"
    echo "set ${label}.${PROD_DOMAIN} A -> ${ip}"
  done < <(build_change_set)
  echo "Cutover complete for ${PROD_DOMAIN}"
}

cmd_rollback() {
  require PROD_DOMAIN; require IPV64_API_KEY
  local sf; sf="$(state_file)"
  [ -s "$sf" ] || { echo "ERROR: no rollback state at $sf" >&2; exit 5; }
  local type label ip seen=" "
  while IFS='|' read -r type label ip; do
    [ "$type" = "A" ] || continue
    if [[ "$seen" != *" ${label} "* ]]; then delete_prefix_a "$label"; seen="${seen}${label} "; fi
    add_one_a "$label" "$ip"
    echo "restored ${label}.${PROD_DOMAIN} A -> ${ip}"
  done < "$sf"
  echo "Rollback complete for ${PROD_DOMAIN}"
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    plan)     cmd_plan ;;
    cutover)  cmd_cutover ;;
    rollback) cmd_rollback ;;
    *) echo "usage: $0 {plan|cutover|rollback}" >&2; exit 2 ;;
  esac
}

main "$@"
