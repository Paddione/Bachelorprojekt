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
  "postgres:16-alpine@sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb"
  "pgvector/pgvector:0.8.0-pg16@sha256:a132765ec351c65111b5b675928a3a0515a466a40f97277329db8b8209ad8bc9"
  "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2"
  "alpine/k8s:1.34.0@sha256:b5f6edfeac5279f3e182d938d1ffecb62f7c980756ac4b6b66d7f0d566782f77"
  "busybox:1.38.0@sha256:fd8d9aa63ba2f0982b5304e1ee8d3b90a210bc1ffb5314d980eb6962f1a9715d"
  "curlimages/curl:8.7.1@sha256:25d29daeb9b14b89e2fa8cc17c70e4b188bca1466086907c2d9a4b56b59d8e21"
  "nats:2.10-alpine@sha256:b83efabe3e7def1e0a4a31ec6e078999bb17c80363f881df35edc70fcb6bb927"
  "livekit/livekit-server:v1.11.0@sha256:100b9a870616d02f5e3795b34e0b593b5054a26f8131a94fd3fa322ed3154b16"
  "livekit/egress:v1.9.0@sha256:d62f515668d56df24082ec722a7a78134bc14ff331a2c0402ac90e8fe0fe0067"
  "livekit/ingress:v1.5.0@sha256:2e1d3fcf10bfaebddaea74dc8b965410cda6377ed154451361b86ab3a9ee9f99"
  "filebrowser/filebrowser:v2.63.5@sha256:aefb0c20de10ef8b617995ca5522479ad40d41e6386bd01946a345c6026ff31c"
  "axllent/mailpit:v1.29@sha256:757f22b56c1da03570afdb3d259effe5091018008a81bbedc8158cee7e16fdbc"
  "binwiederhier/ntfy:v2.24.0@sha256:f8a9b104313b87cc24ae4f775f39e6328205b57dff6ede3eaf098a91e5d79f59"
  "ghcr.io/pocket-id/pocket-id:v2.9.0@sha256:a2a38a96699d7483d65b5849b015d954f294938306a03a9c0699bc5b79554e86"
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
  report=$(trivy image --severity HIGH,CRITICAL --ignore-unfixed --format json "$img" 2>/dev/null || true)
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
