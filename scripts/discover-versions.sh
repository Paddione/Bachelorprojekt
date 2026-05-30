#!/usr/bin/env bash
# scripts/discover-versions.sh
# Query upstream for latest stable component versions and optionally pin them
# in environments/versions.yaml.
#
# Usage:
#   bash scripts/discover-versions.sh                         # dry run
#   bash scripts/discover-versions.sh --update               # write versions.yaml
#   bash scripts/discover-versions.sh --update --commit      # write + git commit
#   bash scripts/discover-versions.sh --versions-file <path> # override output path
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSIONS_FILE="${SCRIPT_DIR}/../environments/versions.yaml"
UPDATE=false
COMMIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update)        UPDATE=true; shift ;;
    --commit)        UPDATE=true; COMMIT=true; shift ;;
    --versions-file) VERSIONS_FILE="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# Ensure helm repos are registered (idempotent)
helm repo add longhorn       https://charts.longhorn.io                      2>/dev/null || true
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets   2>/dev/null || true
helm repo add jetstack       https://charts.jetstack.io                      2>/dev/null || true
helm repo update >/dev/null 2>&1 || true

# Discover versions from upstream
K3S=$(curl -sf "https://api.github.com/repos/k3s-io/k3s/releases/latest" | jq -r '.tag_name')
FLUX=$(curl -sf "https://api.github.com/repos/fluxcd/flux2/releases/latest" | jq -r '.tag_name')
SEALED_SECRETS=$(helm search repo sealed-secrets/sealed-secrets -o json | jq -r '.[0].version')
CERT_MANAGER=$(helm search repo jetstack/cert-manager -o json | jq -r '.[0].version')
LONGHORN=$(helm search repo longhorn/longhorn -o json | jq -r '.[0].version')

# Validate — fail fast if any lookup returned empty or "null"
for varname in K3S FLUX SEALED_SECRETS CERT_MANAGER LONGHORN; do
  val="${!varname}"
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "ERROR: Failed to discover version for $varname" >&2
    exit 1
  fi
done

echo "Discovered versions:"
echo "k3s: $K3S"
echo "flux: $FLUX"
echo "sealed_secrets_chart: $SEALED_SECRETS"
echo "cert_manager: $CERT_MANAGER"
echo "longhorn_chart: $LONGHORN"

if [[ "$UPDATE" == "false" ]]; then
  echo ""
  echo "Dry run — pass --update to write to $VERSIONS_FILE"
  exit 0
fi

cat > "$VERSIONS_FILE" << EOF
# Managed by scripts/discover-versions.sh — do not edit manually
k3s: $K3S
flux: $FLUX
sealed_secrets_chart: $SEALED_SECRETS
cert_manager: $CERT_MANAGER
longhorn_chart: $LONGHORN
EOF

echo "Updated $VERSIONS_FILE"

if [[ "$COMMIT" == "false" ]]; then
  exit 0
fi

DATE=$(date +%Y-%m-%d)
git add "$VERSIONS_FILE"
git commit -m "chore: bump component versions to $DATE"
echo "Committed."
