#!/usr/bin/env bash
# Count failed last runs and overdue first schedules in the selected namespace.
# Suspended jobs and not-yet-due first schedules are not failures; unknown stays '-'.
set -o pipefail
NAMESPACE="${1:-workspace}"
CTX="${HG_OPS_CTX:-fleet}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
kubectl get cronjobs -n "$NAMESPACE" --context "$CTX" -o json 2>/dev/null |
  python3 "$SCRIPT_DIR/cronjob-failures.py" 2>/dev/null || echo '-'
