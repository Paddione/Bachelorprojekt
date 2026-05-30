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
SERVICE_PREFIXES=("livekit" "stream" "turn")

IPV64_API="${IPV64_API:-https://ipv64.net/api}"
STATE_DIR="${FLEET_DNS_STATE_DIR:-/tmp}"

require() { [ -n "${!1:-}" ] || { echo "ERROR: $1 not set" >&2; exit 1; }; }

# Emit the full set of A records to set, one per line, as TYPE|PREFIX|IP.
# A "@" prefix is printed for the root (empty praefix) for human readability;
# apply_record() maps "@" back to the empty praefix the ipv64 API expects.
build_change_set() {
  require PROD_DOMAIN
  require LIVEKIT_PIN_IP
  local p ip label
  for p in "${ROOTLIKE_PREFIXES[@]}"; do
    label="${p:-@}"
    for ip in "${FLEET_NODE_IPS[@]}"; do echo "A|${label}|${ip}"; done
  done
  for p in "${SERVICE_PREFIXES[@]}"; do echo "A|${p}|${LIVEKIT_PIN_IP}"; done
}

# State file path for the active domain.
state_file() { echo "${STATE_DIR}/fleet-dns-rollback-${PROD_DOMAIN}.state"; }

# Map the human "@" label back to the empty praefix the ipv64 API expects.
_praefix() { [ "$1" = "@" ] && echo "" || echo "$1"; }

# Delete existing A records for a prefix, then add the new one (ipv64 has no
# atomic set). Mirrors prod-korczewski/ddns-updater.yaml's del-then-add pattern.
apply_record() {
  local prefix="$1" ip="$2" px; px="$(_praefix "$prefix")"
  curl -fsS -X DELETE "${IPV64_API}" \
    -H "Authorization: Bearer ${IPV64_API_KEY}" \
    --data-urlencode "domain=${PROD_DOMAIN}" \
    --data-urlencode "praefix=${px}" \
    --data-urlencode "type=A" \
    -H "Content-Type: application/x-www-form-urlencoded" || true
  curl -fsS -X POST "${IPV64_API}" \
    -H "Authorization: Bearer ${IPV64_API_KEY}" \
    --data-urlencode "domain=${PROD_DOMAIN}" \
    --data-urlencode "praefix=${px}" \
    --data-urlencode "type=A" \
    --data-urlencode "content=${ip}" \
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
  require PROD_DOMAIN; require LIVEKIT_PIN_IP
  echo "DNS cutover plan for ${PROD_DOMAIN:-<unset>} (DRY-RUN — no API calls):"
  local line
  while IFS= read -r line; do echo "CHANGE: ${line}"; done < <(build_change_set)
}

cmd_cutover() {
  require PROD_DOMAIN; require LIVEKIT_PIN_IP; require IPV64_API_KEY
  capture_rollback_state
  local type label ip
  while IFS='|' read -r type label ip; do
    [ "$type" = "A" ] || { echo "refusing non-A change: $type" >&2; exit 4; }
    apply_record "$label" "$ip"
    echo "set ${label}.${PROD_DOMAIN} A -> ${ip}"
  done < <(build_change_set)
  echo "Cutover complete for ${PROD_DOMAIN}"
}

cmd_rollback() {
  require PROD_DOMAIN; require IPV64_API_KEY
  local sf; sf="$(state_file)"
  [ -s "$sf" ] || { echo "ERROR: no rollback state at $sf" >&2; exit 5; }
  local type label ip
  while IFS='|' read -r type label ip; do
    [ "$type" = "A" ] || continue
    apply_record "$label" "$ip"
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
