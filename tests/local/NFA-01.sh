#!/usr/bin/env bash
# NFA-01: Datenschutz — GDPR compliance, telemetry, data sovereignty (k3d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: No external cloud image registries
IMAGES=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].spec.containers[*].image}' 2>/dev/null)
for suspect in "gcr.io" "amazonaws.com" "azurecr.io" "mcr.microsoft.com"; do
  assert_not_contains "$IMAGES" "$suspect" "NFA-01" "T1-${suspect%%.*}" "Keine Images von ${suspect}"
done

# T3: Nextcloud has no external storage backends
NC_OCC=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ config:list --output=json 2>/dev/null || echo "{}")
if [[ "$NC_OCC" != "{}" ]]; then
  assert_not_contains "$NC_OCC" "amazons3" "NFA-01" "T3a" "Kein Amazon S3 Storage-Backend"
  assert_not_contains "$NC_OCC" "azure" "NFA-01" "T3b" "Kein Azure Storage-Backend"
else
  skip_test "NFA-01" "T3a" "Storage-Backend Check" "occ nicht verfügbar"
fi

# T4: No privileged containers
PRIVILEGED=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null \
  | jq '[.items[].spec.containers[] | select(.securityContext.privileged // false == true)] | length')
assert_eq "${PRIVILEGED:-0}" "0" "NFA-01" "T4" "Keine privilegierten Container"

# T5: Namespace has Pod Security Standards enforced
NS_LABELS=$(kubectl get ns "$NAMESPACE" -o jsonpath='{.metadata.labels}' 2>/dev/null)
assert_contains "$NS_LABELS" "pod-security.kubernetes.io/enforce" "NFA-01" "T5" "Pod Security Standards aktiv"
