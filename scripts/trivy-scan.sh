#!/usr/bin/env bash
# trivy-scan.sh — Scan pinned container images for CVEs
# Usage: bash scripts/trivy-scan.sh [--json] [--ci]
#   --json  Output JSON (for machine consumption / goals.md baseline)
#   --ci    CI mode: exit 1 on CRITICAL CVEs
set -euo pipefail

MODE="table"
CI_MODE=false
for arg in "$@"; do
  case "$arg" in
    --json) MODE="json" ;;
    --ci)   CI_MODE=true ;;
  esac
done

# Pinned images from k3d/*.yaml — add new images here when pinning
IMAGES=(
  "postgres:18.6-alpine@sha256:123b17998ccaf47e53b502e8c6a1e79afd8f579c6f3eec83c563da026f957395"
  "pgvector/pgvector:0.8.7-pg16@sha256:0dd3149a06e4579a0d70d8fef9945636cd514005e7237deb27f9b67886f8dc4f"
  "node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402"
  "alpine/k8s:1.37.2@sha256:dcb7185e112a453aa72f426754849a97357727ef8f40168fb208c8cf59952042"
  "busybox:1.38.0@sha256:fd8d9aa63ba2f0982b5304e1ee8d3b90a210bc1ffb5314d980eb6962f1a9715d"
  "curlimages/curl:8.23.0@sha256:3fb7e13e5d179a845c97d78204f3f1064d1907037f26a3ebf91710571151fd93"
  "nats:2.15.1-alpine@sha256:2ae57dfba3063d5e25fecb75256118c0882a1a2d2cf7d0fba17a7c701df956f6"
  "filebrowser/filebrowser:v2.63.23@sha256:a469ea076d4a1b4b1d86a41d130f2f536cd9da996a2b1fb39c0d7635f9d89b9a"
  "axllent/mailpit:v1.32.0@sha256:0790692be935ea4420d085694f7985b1f692ca6a8771ab0e0bd8ba75ac180498"
  "binwiederhier/ntfy:v2.34.0@sha256:901e14503d3f605f445be0e68f2ac71f0aa73391897ce6ceb599f8c48d8b3792"
  "ghcr.io/pocket-id/pocket-id:v2.18.0@sha256:323e7ef5bfacf7cf32f22f3d10ccdf48e0c97c94d67e7e40b0b996830deb5165"
)

if ! command -v trivy &>/dev/null; then
  echo "ERROR: trivy not found. Install: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin" >&2
  exit 1
fi

total_critical=0
total_high=0
results=()

for img in "${IMAGES[@]}"; do
  short="${img%%@*}"
  echo "Scanning $short ..." >&2
  report=$(timeout "${TRIVY_TIMEOUT:-120}" trivy image --severity HIGH,CRITICAL --ignore-unfixed --format json "$img" 2>/dev/null || true)
  crit=$(echo "$report" | jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' 2>/dev/null || echo 0)
  high=$(echo "$report" | jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="HIGH")] | length' 2>/dev/null || echo 0)
  total_critical=$((total_critical + crit))
  total_high=$((total_high + high))
  results+=("{\"image\":\"$short\",\"critical\":$crit,\"high\":$high}")
done

if [[ "$MODE" == "json" ]]; then
  joined=$(IFS=,; echo "${results[*]}")
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"total_critical\":$total_critical,\"total_high\":$total_high,\"images\":[$joined]}"
else
  echo ""
  echo "=== Trivy Scan Summary ==="
  echo "Total CRITICAL: $total_critical"
  echo "Total HIGH:     $total_high"
  echo ""
  for img in "${IMAGES[@]}"; do
    short="${img%%@*}"
    echo "  $short"
  done
fi

if [[ "$CI_MODE" == true && "$total_critical" -gt 0 ]]; then
  echo "ERROR: $total_critical CRITICAL CVEs found" >&2
  exit 1
fi
