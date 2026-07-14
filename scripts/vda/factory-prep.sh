#!/usr/bin/env bash
# scripts/vda/factory-prep.sh — Factory PREP (consolidated)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${SCRIPT_DIR}/../lib/vda-core.sh"
source "${SCRIPT_DIR}/../factory/guards.sh"

log() { echo "[PREP] $*" >&2; }

run_dry_run() {
  echo "PREP STEP START"
  echo "---guard_killswitch_on mentolder---"
  GUARDS_REPO="$REPO"
  if guard_killswitch_on mentolder; then echo "KILLSWITCH=TRIPPED"; else echo "KILLSWITCH=OK"; fi
  echo "---guard_killswitch_on korczewski---"
  if guard_killswitch_on korczewski; then echo "KILLSWITCH=TRIPPED"; else echo "KILLSWITCH=OK"; fi
  echo "---guard_daily_cap_reached mentolder---"
  if FACTORY_DAILY_DEPLOY_CAP=5 guard_daily_cap_reached mentolder; then echo "CAP=REACHED"; else echo "CAP=OK"; fi
  echo "---guard_daily_cap_reached korczewski---"
  if FACTORY_DAILY_DEPLOY_CAP=5 guard_daily_cap_reached korczewski; then echo "CAP=REACHED"; else echo "CAP=OK"; fi
  echo "---watchdog mentolder---"
  BRAND=mentolder bash "${REPO}/scripts/factory/watchdog.sh"
  echo "---watchdog korczewski---"
  BRAND=korczewski bash "${REPO}/scripts/factory/watchdog.sh"
  echo "---schedule mentolder---"
  BRAND=mentolder FACTORY_GLOBAL_CAP=3 bash "${REPO}/scripts/factory/schedule.sh"
  echo "---schedule korczewski---"
  BRAND=korczewski FACTORY_GLOBAL_CAP=3 bash "${REPO}/scripts/factory/schedule.sh"
  echo "PREP STEP END"
}

run_prep() {
  local final_launch='[]'
  local final_skipped='[]'

  for brand in mentolder korczewski; do
    log "=== ${brand} ==="
    local skip=false reason=""

    # Kill-switch
    if GUARDS_REPO="${REPO}" guard_killswitch_on "${brand}"; then
      log "KILLSWITCH ON -> skip ${brand}"
      skip=true; reason="killswitch"
    fi

    # Daily cap
    if ! "${skip}"; then
      if FACTORY_DAILY_DEPLOY_CAP="${FACTORY_DAILY_DEPLOY_CAP:-5}" GUARDS_REPO="${REPO}" guard_daily_cap_reached "${brand}"; then
        log "DAILY CAP REACHED -> skip ${brand}"
        skip=true; reason="daily_cap"
      fi
    fi

    if "${skip}"; then
      final_skipped=$(echo "${final_skipped}" | jq -c --arg b "${brand}" --arg r "${reason}" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi

    # Watchdog — stdout muss von einer stdin-lesenden Schleife konsumiert werden:
    # log() liest kein stdin; ein direktes `| log` beendet die rechte Seite sofort
    # und der Watchdog stirbt an SIGPIPE (rc 141 unter pipefail). Best-effort:
    # ein Watchdog-Fehler bricht den PREP nicht ab (T001806).
    log "Watchdog ${brand}..."
    BRAND="${brand}" bash "${REPO}/scripts/factory/watchdog.sh" 2>&1 \
      | while IFS= read -r _wdline; do log "${_wdline}"; done \
      || log "Watchdog ${brand} failed (non-fatal)"

    # Schedule
    log "Schedule ${brand}..."
    local schedule_out
    schedule_out=$(BRAND="${brand}" FACTORY_GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}" bash "${REPO}/scripts/factory/schedule.sh" 2>/dev/null)
    log "Schedule result: ${schedule_out}"

    # Process candidates from schedule
    for row in $(echo "${schedule_out}" | jq -c '.[]' 2>/dev/null); do
      [[ -z "${row}" ]] && continue
      local ext_id slot dry_run
      ext_id=$(echo "${row}" | jq -r '.external_id')
      slot=$(echo "${row}" | jq -r '.slot')
      log "Processing claimed ticket ${ext_id} (slot ${slot})"

      # Dry-run-first guard
      if GUARDS_REPO="${REPO}" guard_dryrun_ok "${ext_id}"; then
        dry_run=false
      else
        dry_run=true
        log "Dry-run check FAILED for ${ext_id} -> forcing dry_run=true"
      fi

      # Session-coordination guard (T000510)
      local al=0
      bash "${REPO}/scripts/agent-lock.sh" check ticket "${ext_id}" 2>/dev/null; al=$? || true
      if [[ "${al}" -eq 3 ]]; then
        log "Ticket ${ext_id} claimed by live interactive session -> releasing slot"
        BRAND="${brand}" bash "${REPO}/scripts/ticket.sh" release-slot --id "${ext_id}" 2>/dev/null || true
        final_skipped=$(echo "${final_skipped}" | jq -c --arg b "${brand}" --arg r "claimed by live interactive session" '. + [{"brand":$b,"reason":$r}]')
        continue
      fi

      # Fetch details
      local ticket_json title plan_ref branch plan_path br pp
      ticket_json=$(BRAND="${brand}" bash "${REPO}/scripts/ticket.sh" get --id "${ext_id}" 2>/dev/null || echo '{}')
      title=$(echo "${ticket_json}" | jq -r '.title // null')
      plan_ref=$(echo "${ticket_json}" | jq -r '.plan_ref // ""')

      branch=null; plan_path=null
      if [[ -n "${plan_ref}" ]]; then
        br=$(echo "${plan_ref}" | grep -oP 'branch=\K\S+' || true)
        pp=$(echo "${plan_ref}" | grep -oP 'plan=\K\S+' || true)
        [[ -n "${br}" ]] && branch="${br}"
        [[ -n "${pp}" ]] && plan_path="${pp}"
      fi

      final_launch=$(echo "${final_launch}" | jq -c \
        --arg b "${brand}" --arg e "${ext_id}" --argjson s "${slot}" \
        --arg t "${title:-}" --arg br "${branch:-null}" --arg p "${plan_path:-null}" --argjson dr "${dry_run}" \
        '. + [{"brand":$b, "external_id":$e, "slot":$s, "title":$t, "branch":$br, "plan_path":$p, "dry_run":$dr}]')
    done
  done

  jq -n --argjson launch "${final_launch}" --argjson skipped "${final_skipped}" '{launch: $launch, skipped: $skipped}'
}

main() {
  local dry_run=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --dry-run) dry_run=1; shift ;;
    *) vda_error "Unknown option: $1"; exit 2 ;;
  esac; done

  if [[ "$dry_run" -eq 1 ]]; then
    run_dry_run
  else
    run_prep
  fi
}

main "$@"
