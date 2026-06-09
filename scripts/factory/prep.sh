#!/usr/bin/env bash
# scripts/factory/prep.sh — Deterministic PREP step for the Software Factory dispatcher.
#
# Runs all guards, watchdog, and schedule.sh for both brands. Outputs a JSON object
# to stdout: { "launch": [...], "skipped": [...] } matching the PLAN_SCHEMA in
# dispatcher.js. Exit 0 even when nothing is scheduled (empty launch array).
#
# Usage:
#   FACTORY_DRY_RUN=true|false bash scripts/factory/prep.sh
#
# Env vars:
#   FACTORY_DAILY_DEPLOY_CAP  max pipelines per day per brand (default: 5)
#   FACTORY_GLOBAL_CAP         max concurrent pipelines across both brands (default: 3)
#   FACTORY_DRY_RUN            force dry_run on all launches (default: true)
#   GUARDS_REPO                path to repo for guard scripts (default: cwd)

set -euo pipefail

REPO="${GUARDS_REPO:-$(pwd)}"
DAILY_CAP="${FACTORY_DAILY_DEPLOY_CAP:-5}"
GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}"
DRY_RUN_POLICY="${FACTORY_DRY_RUN:-true}"
BRANDS=("mentolder" "korczewski")
LAUNCH_JSON=""
SKIPPED_JSON=""

# shellcheck source=/dev/null
source "${REPO}/scripts/factory/guards.sh"

for BRAND in "${BRANDS[@]}"; do
  # ── 0. Hard-guard gate ─────────────────────────────────────────────────
  KS=99; guard_killswitch_on "$BRAND" && KS=$? || KS=$?
  CAP=99; FACTORY_DAILY_DEPLOY_CAP="$DAILY_CAP" GUARDS_REPO="$REPO" guard_daily_cap_reached "$BRAND" && CAP=$? || CAP=$?

  if [[ "$KS" -eq 0 ]]; then
    SKIPPED_JSON="${SKIPPED_JSON}$(jq -nc --arg b "$BRAND" '{brand: $b, reason: "killswitch"}'),"
    echo "prep.sh: $BRAND — kill-switch ON, skipping" >&2
    continue
  fi
  if [[ "$CAP" -eq 0 ]]; then
    SKIPPED_JSON="${SKIPPED_JSON}$(jq -nc --arg b "$BRAND" '{brand: $b, reason: "daily_cap"}'),"
    echo "prep.sh: $BRAND — daily cap reached, skipping" >&2
    continue
  fi

  # ── 1. Watchdog sweep ──────────────────────────────────────────────────
  echo "prep.sh: $BRAND — running watchdog sweep" >&2
  BRAND="$BRAND" bash "${REPO}/scripts/factory/watchdog.sh" || true

  # ── 2. Schedule (poll backlog + claim slots) ───────────────────────────
  echo "prep.sh: $BRAND — running schedule.sh" >&2
  SCHEDULE_OUT=$(BRAND="$BRAND" FACTORY_GLOBAL_CAP="$GLOBAL_CAP" bash "${REPO}/scripts/factory/schedule.sh" 2>&1) || true
  echo "prep.sh: $BRAND — schedule.sh output: ${SCHEDULE_OUT}" >&2

  # Parse schedule.sh output — expects lines like: CLAIMED|<external_id>|<slot>
  while IFS='|' read -r status ext_id slot rest; do
    if [[ "$status" == "CLAIMED" && -n "${ext_id:-}" && -n "${slot:-}" ]]; then
      # ── Fetch ticket details ───────────────────────────────────────────
      TICKET_JSON=$(BRAND="$BRAND" bash "${REPO}/scripts/ticket.sh" get --id "$ext_id" 2>/dev/null || echo '{}')
      TITLE=$(echo "$TICKET_JSON" | jq -r '.title // empty' 2>/dev/null || echo '')
      PLAN_REF=$(echo "$TICKET_JSON" | jq -r '.plan_ref // empty' 2>/dev/null || echo '')
      BRANCH=""
      PLAN_PATH=""

      # Parse FACTORY-PLAN-REF comment from plan_ref
      if [[ -n "$PLAN_REF" ]]; then
        BRANCH=$(echo "$PLAN_REF" | grep -oP 'branch=\K\S+' 2>/dev/null || echo '')
        PLAN_PATH=$(echo "$PLAN_REF" | grep -oP 'plan=\K\S+' 2>/dev/null || echo '')
      fi

      # ── Dry-run-first guard ────────────────────────────────────────────
      FORCE_DRY=false
      DR=99; GUARDS_REPO="$REPO" guard_dryrun_ok "$ext_id" && DR=$? || DR=$?
      if [[ "$DR" -ne 0 ]]; then
        FORCE_DRY=true
        echo "prep.sh: $BRAND/$ext_id — dry-run-first guard: forcing dry_run=true" >&2
      fi

      # ── Session-coordination guard (T000510) ───────────────────────────
      AL=99; bash "${REPO}/scripts/agent-lock.sh" check ticket "$ext_id" && AL=$? || AL=$?
      if [[ "$AL" -eq 3 ]]; then
        # A live interactive session holds the claim → release slot, skip
        BRAND="$BRAND" bash "${REPO}/scripts/ticket.sh" release-slot --id "$ext_id" 2>/dev/null || true
        SKIPPED_JSON="${SKIPPED_JSON}$(jq -nc --arg b "$BRAND" '{brand: $b, reason: "claimed by live interactive session"}'),"
        echo "prep.sh: $BRAND/$ext_id — claimed by live interactive session, released slot $slot" >&2
        continue
      fi

      # ── Build launch object ────────────────────────────────────────────
      DRY_FLAG="$FORCE_DRY"
      if [[ "$DRY_RUN_POLICY" == "true" ]]; then
        DRY_FLAG="true"
      fi

      LAUNCH_OBJ=$(jq -nc \
        --arg brand "$BRAND" \
        --arg external_id "$ext_id" \
        --argjson slot "$slot" \
        --arg title "$TITLE" \
        --arg branch "${BRANCH:-null}" \
        --arg plan_path "${PLAN_PATH:-null}" \
        --argjson dry_run "$DRY_FLAG" \
        '{
          brand: $brand,
          external_id: $external_id,
          slot: $slot,
          title: $title,
          branch: (if $branch == "null" or $branch == "" then null else $branch end),
          plan_path: (if $plan_path == "null" or $plan_path == "" then null else $plan_path end),
          dry_run: $dry_run
        }')
      LAUNCH_JSON="${LAUNCH_JSON}${LAUNCH_OBJ},"
      echo "prep.sh: $BRAND/$ext_id — CLAIMED slot $slot (dry_run=$DRY_FLAG)" >&2
    fi
  done <<< "$SCHEDULE_OUT"
done

# ── Assemble final JSON ──────────────────────────────────────────────────
LAUNCH_ARR="[$(echo "$LAUNCH_JSON" | sed 's/,$//')]"
SKIPPED_ARR="[$(echo "$SKIPPED_JSON" | sed 's/,$//')]"

jq -nc \
  --argjson launch "$LAUNCH_ARR" \
  --argjson skipped "$SKIPPED_ARR" \
  '{ launch: $launch, skipped: $skipped }'

echo "prep.sh: done — ${#BRANDS[@]} brands, $(echo "$LAUNCH_ARR" | jq 'length') scheduled, $(echo "$SKIPPED_ARR" | jq 'length') skipped" >&2
