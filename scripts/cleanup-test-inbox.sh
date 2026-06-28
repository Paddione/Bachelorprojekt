#!/usr/bin/env bash
# scripts/cleanup-test-inbox.sh
#
# Einmaliger Cleanup: Löscht alle is_test_data=true Zeilen aus dem
# Produktions-Postfach (inbox_items), die durch E2E-Tests vor dem
# Prod-Guard-Fix entstanden sind.
#
# Idempotent: Zweiter Lauf löscht 0 Zeilen.
#
# Aufruf:
#   task db:cleanup-test-inbox                  # aktiver kubectl-Kontext
#   task db:cleanup-test-inbox ENV=mentolder    # fleet → workspace
#   task db:cleanup-test-inbox ENV=korczewski   # fleet → workspace-korczewski
set -euo pipefail

NAMESPACE="${WORKSPACE_NAMESPACE:-workspace}"

echo "▶ Cleanup is_test_data=true in inbox_items (namespace: ${NAMESPACE}) …"

kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  psql -U postgres -d website -c \
  "DELETE FROM bachelorprojekt.inbox_items WHERE is_test_data = true;" 2>/dev/null

echo "✓ Cleanup abgeschlossen."