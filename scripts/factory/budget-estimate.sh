#!/usr/bin/env bash
# scripts/factory/budget-estimate.sh <ticket_id> <brand>
# Pre-run token and cost estimate for a ticket based on effort and configured providers.
# Outputs JSON: {"estimate_usd":..., "tokens_est":..., "provider":..., "model_id":...}
# Writes estimates to tickets.factory_run_budget.
set -euo pipefail
LC_ALL=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TICKET_ID="${1:?ticket_id required}"
BRAND="${2:?brand required (mentolder|korczewski)}"

# Resolve brand environment via env-resolve.sh
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=/dev/null
source "scripts/env-resolve.sh" "$BRAND"

export FACTORY_NS="$WORKSPACE_NAMESPACE"
export FACTORY_CTX="$ENV_CONTEXT"

# Source the factory lib
# shellcheck source=/dev/null
source "scripts/factory/lib.sh"
export BRAND="$BRAND"
factory_resolve

# 1. Fetch ticket details (UUID + effort)
TICKET_INFO=$(factory_psql -v ticket_id="$TICKET_ID" <<'SQL'
SELECT id || '|' || COALESCE(NULLIF(effort, ''), 'mittel')
FROM tickets.tickets
WHERE id::text = :'ticket_id' OR external_id = :'ticket_id'
LIMIT 1;
SQL
)

if [[ -z "$TICKET_INFO" ]]; then
  echo "ERROR: Ticket not found: $TICKET_ID" >&2
  exit 1
fi

TICKET_UUID=$(echo "$TICKET_INFO" | cut -d'|' -f1)
EFFORT=$(echo "$TICKET_INFO" | cut -d'|' -f2)

# Set effort multiplier
case "$EFFORT" in
  klein|simple)
    NUM=1
    DEN=2
    ;;
  gross|complex|large)
    NUM=2
    DEN=1
    ;;
  *)
    NUM=1
    DEN=1
    ;;
esac

# 2. Get active provider/model configurations for each phase
PHASES_CONFIG=$(factory_psql <<'SQL'
WITH phases (phase, src, tier) AS (
  VALUES 
    ('scout', 'factory-scout', 'haiku'),
    ('design', 'factory-plan', 'sonnet'),
    ('plan', 'factory-plan', 'sonnet'),
    ('implement', 'factory-implement', 'sonnet'),
    ('verify', 'factory-review', 'opus'),
    ('deploy', 'factory-implement', 'opus')
),
resolved AS (
  SELECT p.phase, p.tier,
    (
      SELECT c.provider || '|' || c.model_id
      FROM tickets.provider_config c
      WHERE (c.source = p.src OR c.source = '*') AND c.tier = p.tier AND c.enabled = true
      ORDER BY (c.source = p.src) DESC, c.priority ASC
      LIMIT 1
    ) as config
  FROM phases p
)
SELECT phase || '|' || COALESCE(config, CASE 
  WHEN tier = 'opus' THEN 'lmstudio|qwen3.6-14b-a3b-fablevibes'
  WHEN tier = 'sonnet' THEN 'lmstudio|qwen3.6-14b-a3b-fablevibes'
  ELSE 'lmstudio|qwen3.6-14b-a3b-fablevibes'
END) FROM resolved;
SQL
)

TOTAL_TOKENS_EST=0
TOTAL_COST_EST="0.000000"
MAIN_PROVIDER="lmstudio"
MAIN_MODEL_ID="qwen3.6-14b-a3b-fablevibes"

SQL_CMDS="BEGIN;"

while read -r line; do
  [[ -z "$line" ]] && continue
  
  PHASE=$(echo "$line" | cut -d'|' -f1)
  PROVIDER=$(echo "$line" | cut -d'|' -f2)
  MODEL_ID=$(echo "$line" | cut -d'|' -f3)
  
  # Determine base tokens for phase
  case "$PHASE" in
    scout)     BASE=15000 ;;
    design)    BASE=15000 ;;
    plan)      BASE=15000 ;;
    implement) BASE=50000 ;;
    verify)    BASE=20000 ;;
    deploy)    BASE=20000 ;;
    *)         BASE=15000 ;;
  esac
  
  # Apply effort multiplier
  (( TOKENS = (BASE * NUM) / DEN ))
  (( TOKENS_IN = TOKENS / 2 ))
  (( TOKENS_OUT = TOKENS - TOKENS_IN ))
  
  # Pricing rates per Mtok
  PRICE_IN="0.00"
  PRICE_OUT="0.00"
  
  if [[ "$PROVIDER" == *"lmstudio"* || "$PROVIDER" == *"local"* || "$PROVIDER" == *"fablevibes"* ]]; then
    PRICE_IN="0.00"
    PRICE_OUT="0.00"
  elif [[ "$PROVIDER" == *"deepseek"* ]]; then
    PRICE_IN="0.27"
    PRICE_OUT="1.10"
  elif [[ "$PROVIDER" == *"anthropic"* ]]; then
    PRICE_IN="3.00"
    PRICE_OUT="15.00"
  fi
  
  # Calculate cost
  COST_USD_EST=$(awk -v tin="$TOKENS_IN" -v pin="$PRICE_IN" -v tout="$TOKENS_OUT" -v pout="$PRICE_OUT" 'BEGIN { printf "%.6f", (tin * pin + tout * pout) / 1000000 }')
  
  # Accumulate totals
  (( TOTAL_TOKENS_EST += TOKENS ))
  TOTAL_COST_EST=$(awk -v tot="$TOTAL_COST_EST" -v cur="$COST_USD_EST" 'BEGIN { printf "%.6f", tot + cur }')
  
  if [[ "$PHASE" == "implement" ]]; then
    MAIN_PROVIDER="$PROVIDER"
    MAIN_MODEL_ID="$MODEL_ID"
  fi
  
  SQL_CMDS="$SQL_CMDS
INSERT INTO tickets.factory_run_budget (ticket_id, provider, model_id, phase, tokens_in_est, tokens_out_est, cost_usd_est)
VALUES ('$TICKET_UUID', '$PROVIDER', '$MODEL_ID', '$PHASE', $TOKENS_IN, $TOKENS_OUT, $COST_USD_EST);"
  
done <<< "$PHASES_CONFIG"

SQL_CMDS="$SQL_CMDS
COMMIT;"

# Write estimates to DB
echo "$SQL_CMDS" | factory_psql >/dev/null

# Print JSON output
printf '{"estimate_usd":%s,"tokens_est":%d,"provider":"%s","model_id":"%s"}\n' \
  "$TOTAL_COST_EST" "$TOTAL_TOKENS_EST" "$MAIN_PROVIDER" "$MAIN_MODEL_ID"
