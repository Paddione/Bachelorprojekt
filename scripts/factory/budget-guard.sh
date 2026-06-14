#!/usr/bin/env bash
# scripts/factory/budget-guard.sh <brand>
# Check if daily budget limit has been reached.
# Exit 0 if budget is OK, Exit 1 if limit is reached or DB is unreachable.
set -euo pipefail
LC_ALL=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BRAND="${1:?brand required (mentolder|korczewski)}"

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

# 1. Fetch current daily limit from factory_control (fail-closed if DB down)
LIMIT=$(factory_psql -v brand="$BRAND" <<'SQL'
SELECT value FROM tickets.factory_control
WHERE key = 'budget-limit-daily-usd' AND (brand = :'brand' OR brand = '*' OR brand IS NULL OR brand = '')
ORDER BY (brand = :'brand') DESC
LIMIT 1;
SQL
)

# If no limit is configured, it is unlimited (Exit 0)
if [[ -z "$LIMIT" ]]; then
  echo "No daily budget limit configured. Proceeding..."
  exit 0
fi

# 2. Fetch total actual USD cost for today
USED=$(factory_psql <<'SQL'
SELECT COALESCE(SUM(cost_usd_act), 0.0)
FROM tickets.factory_run_budget
WHERE run_date = CURRENT_DATE;
SQL
)

# Compare used against limit
if awk -v used="$USED" -v limit="$LIMIT" 'BEGIN { exit (used >= limit ? 0 : 1) }'; then
  echo "Daily budget limit exceeded! Used: $USED USD, Limit: $LIMIT USD" >&2
  exit 1
fi

echo "Budget OK. Used: $USED USD, Limit: $LIMIT USD"
exit 0
