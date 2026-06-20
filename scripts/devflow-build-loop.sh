#!/usr/bin/env bash
# devflow-build-loop.sh — Local self-correcting build loop (optional, vor push)
# Aus dev-flow-execute Schritt 2.5 extrahiert (Chore T001007).
# Default MAX_LOOP=3, überschreibbar via FACTORY_BUILD_LOOP_MAX.
set -u

TICKET_ID="${1:-}"
MAX_LOOP="${FACTORY_BUILD_LOOP_MAX:-3}"
ITER=0
PREV_HASH=""
RESULT_FILE=$(mktemp)

# shellcheck disable=SC1091
source scripts/factory/build-loop.sh
# shellcheck disable=SC1091
source scripts/factory/classify-failure.sh
# shellcheck disable=SC1091
source scripts/factory/classify-paths.sh

while [[ $ITER -lt $MAX_LOOP ]]; do
  task test:changed > "$RESULT_FILE" 2>&1 || true
  CLASS=$(classify_failure "$RESULT_FILE")
  HASH=$(build_loop_sig_hash "$RESULT_FILE")
  TOUCHED=$(git diff --name-only origin/main...HEAD | tr '\n' ',')

  DECIDE=$(build_loop_decide "$ITER" "$MAX_LOOP" "$PREV_HASH" "$CLASS" "$TOUCHED" "$HASH")
  DECIDE_ACTION=$(echo "$DECIDE" | sed -n '1p')
  DECIDE_HASH=$(echo "$DECIDE" | sed -n '2p')

  case "$DECIDE_ACTION" in
    continue)
      ./scripts/ticket.sh phase "$TICKET_ID" implement loop --driver devflow \
        --detail "iter $((ITER+1))/$MAX_LOOP class=$CLASS" 2>/dev/null || true
      ITER=$((ITER + 1))
      PREV_HASH="$DECIDE_HASH"
      ;;
    abort:no-progress|abort:max-iterations|abort:escalate-gate)
      ./scripts/ticket.sh add-comment --id "$TICKET_ID" \
        --body "Build-Loop aborted: $DECIDE_ACTION (class=$CLASS)" 2>/dev/null || true
      rm -f "$RESULT_FILE"
      exit 1
      ;;
  esac
done
rm -f "$RESULT_FILE"
