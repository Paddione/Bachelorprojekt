#!/usr/bin/env bash
# verify-ticket-id.sh — Port-Forward-Read-Integrity-Guard
# Prüft vor jedem Write, ob eine gelesene external_id existiert.
# Aufruf: scripts/verify-ticket-id.sh <external_id> [brand]
# Exit 0 = OK (Ticket existiert), Exit 1 = NICHT gefunden, Exit 2 = Fehler
set -euo pipefail

EXT_ID="${1:?Usage: verify-ticket-id.sh <external_id> [brand]}"
BRAND="${2:-mentolder}"

NS="workspace"
CTX="fleet"

# 1. Pod holen
POD=$(kubectl get pod -n "$NS" --context "$CTX" -l app=shared-db \
  --field-selector status.phase=Running -o name 2>/dev/null | head -1)
if [[ -z "$POD" ]]; then
  echo "verify-ticket-id: ERROR — kein shared-db Pod" >&2
  exit 2
fi

# 2. Prüfen ob Ticket existiert (zweite Quelle)
UUID=$(kubectl exec "$POD" -n "$NS" --context "$CTX" -c postgres -- \
  psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
  -v eid="$EXT_ID" -v brand="$BRAND" \
  -c "SELECT uuid::text FROM tickets.tickets WHERE external_id = :'eid' LIMIT 1;" 2>/dev/null)

if [[ -z "$UUID" ]]; then
  echo "verify-ticket-id: REJECTED — Ticket $EXT_ID ($BRAND) nicht gefunden" >&2
  exit 1
fi

echo "verify-ticket-id: OK — $EXT_ID → $UUID"
exit 0
