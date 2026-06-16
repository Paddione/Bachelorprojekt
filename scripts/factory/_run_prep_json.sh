#!/usr/bin/env bash
set -uo pipefail
cd /home/patrick/Bachelorprojekt
REPO=/home/patrick/Bachelorprojekt

source scripts/factory/guards.sh

FACTORY_DAILY_DEPLOY_CAP="${FACTORY_DAILY_DEPLOY_CAP:-5}"
FACTORY_GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}"

final_launch='[]'
final_skipped='[]'

for brand in mentolder korczewski; do
  skip=false; reason=""

  if GUARDS_REPO="${REPO}" guard_killswitch_on "${brand}"; then
    skip=true; reason="killswitch"
  fi

  if ! "${skip}"; then
    if FACTORY_DAILY_DEPLOY_CAP="${FACTORY_DAILY_DEPLOY_CAP}" GUARDS_REPO="${REPO}" guard_daily_cap_reached "${brand}"; then
      skip=true; reason="daily_cap"
    fi
  fi

  if "${skip}"; then
    final_skipped=$(echo "${final_skipped}" | jq -c --arg b "${brand}" --arg r "${reason}" '. + [{"brand":$b,"reason":$r}]')
    continue
  fi

  BRAND="${brand}" bash "${REPO}/scripts/factory/watchdog.sh" 2>&1 | while read -r line; do :; done

  schedule_out=$(BRAND="${brand}" FACTORY_GLOBAL_CAP="${FACTORY_GLOBAL_CAP}" bash "${REPO}/scripts/factory/schedule.sh" 2>/dev/null)

  for row in $(echo "${schedule_out}" | jq -c '.[]' 2>/dev/null); do
    [[ -z "${row}" ]] && continue
    ext_id=$(echo "${row}" | jq -r '.external_id')
    slot=$(echo "${row}" | jq -r '.slot')

    dry_run=false
    if GUARDS_REPO="${REPO}" guard_dryrun_ok "${ext_id}"; then
      dry_run=false
    else
      dry_run=true
    fi

    al=0
    bash "${REPO}/scripts/agent-lock.sh" check ticket "${ext_id}" 2>/dev/null; al=$? || true
    if [[ "${al}" -eq 3 ]]; then
      BRAND="${brand}" bash "${REPO}/scripts/ticket.sh" release-slot --id "${ext_id}" 2>/dev/null || true
      final_skipped=$(echo "${final_skipped}" | jq -c --arg b "${brand}" --arg r "claimed by live interactive session" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi

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
