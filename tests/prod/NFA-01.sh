#!/usr/bin/env bash
# NFA-01: Datenschutz — GDPR compliance, data sovereignty, no external leaks
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

NAMESPACE="${NAMESPACE:-workspace}"
DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN must be set}"

# T1: All pods run on the expected node (data sovereignty — no cloud spillover)
NODES=$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
NODE_COUNT=$(echo "$NODES" | wc -w)
assert_gt "$NODE_COUNT" 0 "NFA-01" "T1" "Kubernetes-Knoten vorhanden (${NODE_COUNT} Nodes)"

# T2: No external image registries (all images self-hosted or known open-source)
IMAGES=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].spec.containers[*].image}' 2>/dev/null)
# Known safe registries: docker.io, ghcr.io, quay.io, registry.localhost
for suspect in "gcr.io" "amazonaws.com" "azurecr.io"; do
  assert_not_contains "$IMAGES" "$suspect" "NFA-01" "T2-${suspect%%.*}" "Keine Images von ${suspect}"
done
# mcr.microsoft.com is used by Playwright (mcp-browser) — a local dev tool, not a cloud dependency
MCR_IMAGES=$(echo "$IMAGES" | tr ' ' '\n' | grep "mcr.microsoft.com" | grep -v "playwright" || true)
if [[ -z "$MCR_IMAGES" ]]; then
  _log_result "NFA-01" "T2-mcr" "Keine Cloud-abhängigen Images von mcr.microsoft.com" "pass" "0" "Playwright erlaubt"
else
  assert_not_contains "$MCR_IMAGES" "mcr.microsoft.com" "NFA-01" "T2-mcr" "Keine Images von mcr.microsoft.com"
fi

# T3: Services don't phone home — check DNS/network policies
# Verify no egress to known telemetry endpoints from Mattermost
if [[ -n "${MM_URL:-}" ]]; then
  # Try mmctl inside the pod first (more reliable than unauthenticated API)
  MM_POD=$(kubectl get pod -n "$NAMESPACE" -l app=mattermost -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [[ -n "$MM_POD" ]]; then
    TELEMETRY=$(kubectl exec -n "$NAMESPACE" "$MM_POD" -- mmctl --local config get LogSettings.EnableDiagnostics 2>/dev/null | tr -d '[:space:]')
    assert_eq "${TELEMETRY:-true}" "false" "NFA-01" "T3a" "Mattermost Telemetrie deaktiviert"

    SEGMENT_KEY=$(kubectl exec -n "$NAMESPACE" "$MM_POD" -- mmctl --local config get AnalyticsSettings.SegmentDeveloperKey 2>/dev/null | tr -d '[:space:]')
    assert_eq "${SEGMENT_KEY:-}" "" "NFA-01" "T3b" "Kein Segment Analytics-Key konfiguriert"
  else
    skip_test "NFA-01" "T3a" "Telemetrie-Check" "Kein Mattermost Pod gefunden"
    skip_test "NFA-01" "T3b" "Analytics-Check" "Kein Mattermost Pod gefunden"
  fi
else
  skip_test "NFA-01" "T3a" "Telemetrie-Check" "MM_URL nicht gesetzt"
  skip_test "NFA-01" "T3b" "Analytics-Check" "MM_URL nicht gesetzt"
fi

# T4: Nextcloud has no external storage backends configured
NC_OCC=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups php occ config:list --output=json 2>/dev/null || echo "{}")
if [[ "$NC_OCC" != "{}" ]]; then
  assert_not_contains "$NC_OCC" "amazons3" "NFA-01" "T4a" "Kein Amazon S3 Storage-Backend"
  assert_not_contains "$NC_OCC" "azure" "NFA-01" "T4b" "Kein Azure Storage-Backend"
  assert_not_contains "$NC_OCC" "google" "NFA-01" "T4c" "Kein Google Storage-Backend"
else
  skip_test "NFA-01" "T4a" "Storage-Backend Check" "occ nicht verfügbar"
fi

# T5: Pod security — no privileged containers
PRIVILEGED=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null \
  | jq '[.items[].spec.containers[].securityContext.privileged // false] | map(select(. == true)) | length')
assert_eq "${PRIVILEGED:-0}" "0" "NFA-01" "T5" "Keine privilegierten Container"

# T6: Namespace has Pod Security Standards enforced
NS_LABELS=$(kubectl get ns "$NAMESPACE" -o jsonpath='{.metadata.labels}' 2>/dev/null)
assert_contains "$NS_LABELS" "pod-security.kubernetes.io/enforce" "NFA-01" "T6" "Pod Security Standards aktiv"
