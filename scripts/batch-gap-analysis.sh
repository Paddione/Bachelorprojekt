#!/usr/bin/env bash
# Fetches all status=planning tickets as a JSON array.
# Usage: bash scripts/batch-gap-analysis.sh [ENV]
# Output: JSON array to stdout, e.g. [{"external_id":"T000601","title":"...","description":"..."}]
set -euo pipefail

ENV="${1:-${ENV:-dev}}"
CTX="${TICKET_CTX:-fleet}"
NS="${TICKET_NS:-workspace}"

pod=$(kubectl get pod -n "$NS" --context "$CTX" \
  -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)

if [[ -z "$pod" ]]; then
  echo "ERROR: no shared-db pod found (ns=$NS ctx=$CTX)" >&2
  exit 1
fi

kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
  psql -U website -d website -qtA -v ON_ERROR_STOP=1 <<'EOF'
SELECT COALESCE(
  json_agg(row_to_json(t) ORDER BY t.created_at),
  '[]'::json
)
FROM (
  SELECT external_id, uuid, title, description, brand, priority, severity
  FROM tickets.tickets
  WHERE status = 'planning'
) t;
EOF
