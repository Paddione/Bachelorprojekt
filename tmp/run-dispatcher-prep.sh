#!/usr/bin/env bash
set -euo pipefail

REPO="/home/patrick/Bachelorprojekt"
RESULTS_FILE="/home/patrick/Bachelorprojekt/tmp/dispatcher-results.json"

cd "$REPO"

# Initialize results
LAUNCH_JSON="[]"
SKIPPED_JSON="[]"

run_guards() {
    local brand="$1"
    local ks_exit cap_exit

    # Step 0a: killswitch guard
    set +e
    source scripts/factory/guards.sh
    GUARDS_REPO="$REPO" guard_killswitch_on "$brand"
    ks_exit=$?
    set -e
    echo "  killswitch exit: $ks_exit"

    # Step 0b: daily cap guard
    set +e
    FACTORY_DAILY_DEPLOY_CAP=5 GUARDS_REPO="$REPO" guard_daily_cap_reached "$brand"
    cap_exit=$?
    set -e
    echo "  daily_cap exit: $cap_exit"

    if [ "$ks_exit" -eq 0 ]; then
        echo "GUARD_TRIPPED:killswitch"
        return 0
    fi
    if [ "$cap_exit" -eq 0 ]; then
        echo "GUARD_TRIPPED:daily_cap"
        return 0
    fi
    echo "GUARD_OK"
    return 0
}

process_brand() {
    local brand="$1"
    echo "=== Processing brand: $brand ==="

    # Step 0: Guards
    local guard_out
    guard_out=$(run_guards "$brand" 2>&1)
    echo "$guard_out"

    if echo "$guard_out" | grep -q "GUARD_TRIPPED"; then
        local reason
        if echo "$guard_out" | grep -q "killswitch"; then
            reason="killswitch"
        else
            reason="daily_cap"
        fi
        echo "  >> SKIPPED: $reason for $brand"
        SKIPPED_JSON=$(echo "$SKIPPED_JSON" | jq --arg b "$brand" --arg r "$reason" '. + [{"brand": $b, "reason": $r}]')
        return 0
    fi

    # Step 1: Watchdog sweep
    echo "  >> Running watchdog sweep..."
    set +e
    BRAND="$brand" bash scripts/factory/watchdog.sh 2>&1
    echo "  watchdog exit: $?"
    set -e

    # Step 2: Schedule
    echo "  >> Running schedule..."
    set +e
    schedule_out=$(BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh 2>&1)
    echo "$schedule_out"
    set -e

    # Parse claimed external_ids from schedule output
    # schedule.sh outputs JSON with claimed objects
    local claimed_ids
    claimed_ids=$(echo "$schedule_out" | grep -oP '"external_id"\s*:\s*"[^"]*"' | sed 's/"external_id"\s*:\s*"\(.*\)"/\1/' || true)
    if [ -z "$claimed_ids" ]; then
        echo "  >> No tickets claimed for $brand"
        return 0
    fi

    # Process each claimed ID
    while read -r ext_id; do
        [ -z "$ext_id" ] && continue
        echo "  >> Processing claimed ticket: $ext_id"

        # Get slot info from schedule output
        local slot
        slot=$(echo "$schedule_out" | grep -oP '"slot"\s*:\s*\d+' | head -1 | grep -oP '\d+' || echo "0")
        # Actually search for the specific external_id's slot
        slot=$(echo "$schedule_out" | python3 -c "import sys,json; data=json.load(sys.stdin); items=[i for i in (data if isinstance(data,list) else data.get('claimed',data.get('tickets',data.get('slots',[])))) if i.get('external_id')=='$ext_id']; print(items[0].get('slot','')) if items else print('')" 2>/dev/null || echo "")

        # Step: dry-run-first guard
        local dry_run=false
        set +e
        GUARDS_REPO="$REPO" guard_dryrun_ok "$ext_id"
        local dr_exit=$?
        set -e
        if [ "$dr_exit" -ne 0 ]; then
            dry_run=true
            echo "  >> DRY-RUN-FIRST guard: not yet dry-run, forcing dry_run=true"
        fi

        # Step: session-coordination guard
        set +e
        bash scripts/agent-lock.sh check ticket "$ext_id"
        local al_exit=$?
        set -e
        if [ "$al_exit" -eq 3 ]; then
            echo "  >> SESSION-COORDINATION: claimed by live session, releasing slot"
            set +e
            BRAND="$brand" bash scripts/ticket.sh release-slot --id "$ext_id" 2>&1
            set -e
            SKIPPED_JSON=$(echo "$SKIPPED_JSON" | jq --arg b "$brand" --arg r "claimed by live interactive session" '. + [{"brand": $b, "reason": $r}]')
            continue
        fi

        # Fetch ticket details
        set +e
        ticket_json=$(BRAND="$brand" bash scripts/ticket.sh get --id "$ext_id" 2>/dev/null || echo '{}')
        set -e

        local title plan_ref branch plan_path
        title=$(echo "$ticket_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('title','') or '')" 2>/dev/null || echo "")
        plan_ref=$(echo "$ticket_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('plan_ref','') or '')" 2>/dev/null || echo "")

        branch=""
        plan_path=""
        if [ -n "$plan_ref" ]; then
            # Parse FACTORY-PLAN-REF comment
            branch=$(echo "$plan_ref" | grep -oP 'branch=\K[^\s,;]+' || echo "")
            plan_path=$(echo "$plan_ref" | grep -oP 'plan=\K[^\s,;]+' || echo "")
        fi

        # Add to launch JSON
        local entry
        entry=$(jq -n \
            --arg brand "$brand" \
            --arg external_id "$ext_id" \
            --arg slot "$slot" \
            --arg title "$title" \
            --arg branch "$branch" \
            --arg plan_path "$plan_path" \
            --argjson dry_run "$dry_run" \
            '{"brand": $brand, "external_id": $external_id, "slot": ($slot | tonumber), "title": $title, "branch": ($branch // null), "plan_path": ($plan_path // null), "dry_run": $dry_run}')
        LAUNCH_JSON=$(echo "$LAUNCH_JSON" | jq --argjson e "$entry" '. + [$e]')
        echo "  >> Added to launch: $ext_id (slot=$slot)"

    done <<< "$claimed_ids"
}

# Process both brands
process_brand "mentolder"
process_brand "korczewski"

# Build final output
jq -n \
    --argjson launch "$LAUNCH_JSON" \
    --argjson skipped "$SKIPPED_JSON" \
    '{"launch": $launch, "skipped": $skipped}' > "$RESULTS_FILE"

echo ""
echo "=== FINAL RESULT ==="
cat "$RESULTS_FILE"
