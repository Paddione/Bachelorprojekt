#!/usr/bin/env bash
# prep_tick.sh — run all PREP steps
set -euo pipefail

REPO=/home/patrick/Bachelorprojekt
cd "$REPO"

source "$REPO/scripts/factory/guards.sh"

skipped="[]"
launch="[]"

for brand in mentolder korczewski; do
    echo "--- brand=$brand ---"

    # Kill-switch
    if guard_killswitch_on "$brand" 2>/dev/null; then
        skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "killswitch active" '. + [{brand:$b, reason:$r}]')
        echo "SKIP ($brand): killswitch"
        continue
    fi
    echo "killswitch OK"

    # Daily cap
    if FACTORY_DAILY_DEPLOY_CAP=5 guard_daily_cap_reached "$brand" 2>/dev/null; then
        skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "daily cap reached" '. + [{brand:$b, reason:$r}]')
        echo "SKIP ($brand): daily cap"
        continue
    fi
    echo "daily cap OK"

    echo "GUARDS PASSED for $brand, running watchdog + schedule..."

    # Step 1: Watchdog
    BRAND="$brand" bash "$REPO/scripts/factory/watchdog.sh" 2>&1 || true

    # Step 2: Schedule
    schedule_json=$(BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh" 2>/dev/null) || {
        echo "schedule.sh failed for $brand"
        continue
    }

    echo "schedule result: $schedule_json"

    # Merge claimed items into launch
    while read -r item; do
        [[ -z "$item" ]] && continue
        ext_id=$(echo "$item" | jq -r '.external_id')
        slot=$(echo "$item" | jq -r '.slot')

        # Dry-run guard
        dry="false"
        if ! GUARDS_REPO="$REPO" guard_dryrun_ok "$ext_id" 2>/dev/null; then
            dry="true"
            echo "dry-run-first guard: forcing dry_run=true for $ext_id"
        fi

        # Session-coordination guard [T000510]
        if bash "$REPO/scripts/agent-lock.sh" check ticket "$ext_id" 2>/dev/null; then
            al=$?
            if [[ "$al" -eq 3 ]]; then
                echo "LIVE SESSION claims $ext_id -> release slot, skip"
                BRAND="$brand" bash "$REPO/scripts/ticket.sh" release-slot --id "$ext_id" 2>/dev/null || true
                skipped=$(echo "$skipped" | jq -c --arg b "$brand" --arg r "claimed by live interactive session" '. + [{brand:$b, reason:$r}]')
                continue
            fi
        fi

        # Fetch ticket details
        ticket_json=$(BRAND="$brand" bash "$REPO/scripts/ticket.sh" get --id "$ext_id" 2>/dev/null) || {
            echo "Cannot fetch details for $ext_id, adding without title/plan"
            launch=$(echo "$launch" | jq -c --arg b "$brand" --arg e "$ext_id" --argjson s "$slot" --arg dry "$dry" '. + [{brand:$b, external_id:$e, slot:$s, title:null, branch:null, plan_path:null, dry_run:$dry}]')
            continue
        }

        title=$(echo "$ticket_json" | jq -r '.title // empty')
        plan_ref=$(echo "$ticket_json" | jq -r '.plan_ref // empty')

        branch="null"
        plan_path="null"
        if [[ -n "$plan_ref" ]]; then
            branch=$(echo "$plan_ref" | grep -oP 'branch=\K[^\s,]+' || echo "null")
            plan_path=$(echo "$plan_ref" | grep -oP 'plan=\K[^\s,]+' || echo "null")
        fi

        launch=$(echo "$launch" | jq -c \
            --arg b "$brand" \
            --arg e "$ext_id" \
            --argjson s "$slot" \
            --arg t "${title:-null}" \
            --arg br "${branch:-null}" \
            --arg p "${plan_path:-null}" \
            --arg dry "$dry" \
            '. + [{brand:$b, external_id:$e, slot:$s, title:$t, branch:$br, plan_path:$p, dry_run:$dry}]')
    done < <(echo "$schedule_json" | jq -c '.[]')
done

echo '=== FINAL RESULT ==='
jq -n --argjson launch "$launch" --argjson skipped "$skipped" '{launch: $launch, skipped: $skipped}'
