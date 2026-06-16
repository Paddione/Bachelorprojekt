#!/usr/bin/env bash
set -uo pipefail
cd /home/patrick/Bachelorprojekt
GLOBAL_CAP=3
DAILY_CAP=5
launch='[]'
skipped='[]'

is_on() { grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$' <<<"$1" && return 0; return 1; }

for brand in mentolder korczewski; do
  skip=false; reason=""

  g=$(bash scripts/ticket.sh factory-control get --key killswitch 2>/dev/null || echo "")
  b=$(bash scripts/ticket.sh factory-control get --key killswitch --brand "$brand" 2>/dev/null || echo "")
  if is_on "${g}"$'\n'"${b}"; then skip=true; reason="killswitch"; fi

  if ! $skip; then
    cnt=$(bash scripts/ticket.sh factory-control get --key daily_deploy_count --brand "$brand" 2>/dev/null || echo "0")
    cnt=${cnt:-0}; [[ "$cnt" =~ ^[0-9]+$ ]] || cnt=0
    if (( cnt >= DAILY_CAP )); then skip=true; reason="daily_cap"; fi
  fi

  if $skip; then
    skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "$reason" '. + [{"brand":$b,"reason":$r}]')
    continue
  fi

  BRAND=$brand bash scripts/factory/watchdog.sh >/dev/null 2>&1 || true
  sched=$(BRAND=$brand FACTORY_GLOBAL_CAP=$GLOBAL_CAP bash scripts/factory/schedule.sh 2>/dev/null || echo "[]")
  for row in $(echo "$sched" | jq -c '.[]' 2>/dev/null); do
    [[ -z "$row" ]] && continue
    ext=$(echo "$row" | jq -r '.external_id')
    sl=$(echo "$row" | jq -r '.slot')
    dr=true
    bash scripts/ticket.sh dryrun-check --id "$ext" >/dev/null 2>&1 && dr=false
    al=0
    bash scripts/agent-lock.sh check ticket "$ext" 2>/dev/null; al=$? || true
    if [[ "$al" -eq 3 ]]; then
      BRAND=$brand bash scripts/ticket.sh release-slot --id "$ext" 2>/dev/null || true
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "claimed by live interactive session" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi
    tj=$(BRAND=$brand bash scripts/ticket.sh get --id "$ext" 2>/dev/null || echo '{}')
    title=$(echo "$tj" | jq -r '.title // null')
    pr=$(echo "$tj" | jq -r '.plan_ref // ""')
    branch=null; ppath=null
    if [[ -n "$pr" ]]; then
      br=$(echo "$pr" | grep -oP 'branch=\K\S+' || true)
      pp=$(echo "$pr" | grep -oP 'plan=\K\S+' || true)
      [[ -n "$br" ]] && branch="$br"
      [[ -n "$pp" ]] && ppath="$pp"
    fi
    launch=$(echo "$launch" | jq -c --arg b "$brand" --arg e "$ext" --argjson s "$sl" --arg t "${title:-}" --arg br "${branch:-null}" --arg p "${ppath:-null}" --argjson dr "$dr" '. + [{"brand":$b, "external_id":$e, "slot":$s, "title":$t, "branch":$br, "plan_path":$p, "dry_run":$dr}]')
  done
done

jq -n --argjson launch "$launch" --argjson skipped "$skipped" '{launch: $launch, skipped: $skipped}'
