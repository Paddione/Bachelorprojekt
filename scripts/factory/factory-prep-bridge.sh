#!/usr/bin/env bash
# factory-prep-bridge.sh — Dispatcher PREP step bridge (single-approval batch)
# Runs all deterministic PREP steps and outputs JSON to stdout.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"

log() { echo "[PREP] $*" >&2; }

# Readiness guard (T: factory-interactive-worker) — provides check_ticket_readiness
# shellcheck source=scripts/factory/readiness-check.sh
source "$HERE/readiness-check.sh"

launch='[]'
skipped='[]'

for brand in mentolder korczewski; do
  log "=== Brand: $brand ==="

  # --- Step 0: HARD-GUARD GATE ---
  skip_brand=false
  skip_reason=""

  # Kill-switch global
  g=$(BRAND="$brand" bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch 2>/dev/null || echo "READ_FAILED")
  # Kill-switch per-brand
  b=$(BRAND="$brand" bash "$REPO/scripts/ticket.sh" factory-control get --key killswitch --brand "$brand" 2>/dev/null || echo "READ_FAILED")

  if [[ "$g" == "READ_FAILED" || "$b" == "READ_FAILED" ]]; then
    log "Kill-switch read FAILED (g=$g b=$b) → fail-closed skip"
    skip_brand=true; skip_reason="killswitch_read_error"
  elif printf '%s\n%s\n' "$g" "$b" | grep -qiE '^[[:space:]]*(on|true|1)[[:space:]]*$'; then
    log "Kill-switch ON (g=$g b=$b) → skip"
    skip_brand=true; skip_reason="killswitch"
  else
    log "Kill-switch OFF (g=$g b=$b)"
  fi

  # Daily-cap
  if [[ "$skip_brand" == "false" ]]; then
    cap="${FACTORY_DAILY_DEPLOY_CAP:-5}"
    count=$(BRAND="$brand" bash "$REPO/scripts/ticket.sh" factory-control get --key daily_deploy_count --brand "$brand" 2>/dev/null || echo "READ_FAILED")
    if [[ "$count" == "READ_FAILED" ]]; then
      log "Daily-cap read FAILED → fail-closed skip"
      skip_brand=true; skip_reason="daily_cap_read_error"
    else
      count=$(echo "$count" | tr -d '[:space:]')
      [[ "$count" =~ ^[0-9]+$ ]] || count=0
      if (( count >= cap )); then
        log "Daily cap reached ($count >= $cap) → skip"
        skip_brand=true; skip_reason="daily_cap"
      else
        log "Daily cap OK ($count < $cap)"
      fi
    fi
  fi

  if [[ "$skip_brand" == "true" ]]; then
    skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "$skip_reason" '. + [{"brand":$b,"reason":$r}]')
    continue
  fi

  # --- Step 1: Watchdog ---
  log "Running watchdog..."
  BRAND="$brand" bash "$REPO/scripts/factory/watchdog.sh" 2>&1 | log
  log "Watchdog done."

  # --- Step 2: Schedule ---
  log "Running schedule..."
  claimed=$(BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh" 2>/dev/null || echo '[]')
  log "Schedule result: $claimed"

  # Process each claimed ticket
  for row in $(echo "$claimed" | jq -c '.[]' 2>/dev/null || true); do
    [[ -z "$row" ]] && continue
    ext_id=$(echo "$row" | jq -r '.external_id')
    slot=$(echo "$row" | jq -r '.slot')

    # --- Dry-run-first guard ---
    dr=false
    if GUARDS_REPO="$REPO" bash "$REPO/scripts/factory/guards.sh" 2>/dev/null; then
      # Can't source properly in Bash tool; call ticket.sh directly
      if BRAND="$brand" bash "$REPO/scripts/ticket.sh" dryrun-check --id "$ext_id" >/dev/null 2>&1; then
        dr=false
      else
        log "dryrun-check failed for $ext_id → forcing dry_run=true"
        dr=true
      fi
    else
      log "guards.sh not loadable, using ticket.sh dryrun-check for $ext_id"
      if BRAND="$brand" bash "$REPO/scripts/ticket.sh" dryrun-check --id "$ext_id" >/dev/null 2>&1; then
        dr=false
      else
        log "dryrun-check failed for $ext_id → forcing dry_run=true"
        dr=true
      fi
    fi

    # --- Session-coordination guard (T000510) ---
    bash "$REPO/scripts/agent-lock.sh" check ticket "$ext_id" 2>/dev/null; al=$?
    if [[ "$al" -eq 3 ]]; then
      log "Ticket $ext_id claimed by live interactive session → releasing slot"
      BRAND="$brand" bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" >/dev/null 2>&1 || true
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "claimed by live interactive session" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi

    # --- Fetch ticket details ---
    ticket_json=$(BRAND="$brand" bash "$REPO/scripts/ticket.sh" get --id "$ext_id" 2>/dev/null || echo '{}')
    title=$(echo "$ticket_json" | jq -r '.title // null')
    plan_ref=$(echo "$ticket_json" | jq -r '.plan_ref // ""')

    branch=null
    plan_path=null
    if [[ -n "$plan_ref" ]]; then
      # Parse FACTORY-PLAN-REF comment for branch=<value> and plan=<value>
      if echo "$plan_ref" | grep -q 'branch='; then
        branch=$(echo "$plan_ref" | grep -oP 'branch=\K\S+' || echo null)
      fi
      if echo "$plan_ref" | grep -q 'plan='; then
        plan_path=$(echo "$plan_ref" | grep -oP 'plan=\K\S+' || echo null)
      fi
    fi

    # --- Readiness guard: branch + plan must exist on origin ---
    if [[ "$branch" == "null" || -z "$branch" || "$plan_path" == "null" || -z "$plan_path" ]]; then
      log "SKIP reason=not_ready ticket=$ext_id (no branch/plan — not yet planned)"
      BRAND="$brand" bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" >/dev/null 2>&1 || true
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "not_ready" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi
    if ! check_ticket_readiness "$branch" "$plan_path" >/dev/null 2>&1; then
      log "SKIP reason=not_ready ticket=$ext_id (branch/plan not on origin)"
      BRAND="$brand" bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" >/dev/null 2>&1 || true
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "not_ready" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi

    # Pre-create the worktree at the same path pipeline.js will use, branched
    # from origin/<branch> (not origin/main) so the plan file is materialized
    # on disk before the launched `claude -p` session runs its safety-check.
    # Without this, the LLM refuses to invoke Workflow because
    # $plan_path doesn't exist in the main checkout (only on the feature branch),
    # the prompt override is correctly flagged as manipulation, and the pipeline
    # exits immediately — leaving the slot held, watchdog reset, cycle repeats.
    wt_path=null
    wt_slug=$(echo "${branch}" | sed -E 's#^(feature|fix|chore)/##')
    wt_path="${REPO}/.worktrees/${wt_slug}-reuse"
    if ! bash "$REPO/scripts/worktree-create.sh" "${branch}" "${wt_path}" "origin/${branch}" >/dev/null 2>&1; then
      log "SKIP reason=worktree_failed ticket=$ext_id (pre-create at ${wt_path} failed)"
      BRAND="$brand" bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" >/dev/null 2>&1 || true
      skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "worktree_failed" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi
    log "pre-created worktree for $ext_id at ${wt_path}"

    launch=$(echo "$launch" | jq -c \
      --arg b "$brand" \
      --arg e "$ext_id" \
      --argjson s "$slot" \
      --arg t "$title" \
      --arg br "${branch:-null}" \
      --arg p "${plan_path:-null}" \
      --arg w "${wt_path}" \
      --argjson dr "$dr" \
      '. + [{"brand":$b, "external_id":$e, "slot":$s, "title":$t, "branch":$br, "plan_path":$p, "worktree_path":$w, "dry_run":$dr}]')
  done
done

# Output final result
jq -n --argjson launch "$launch" --argjson skipped "$skipped" '{launch: $launch, skipped: $skipped}'