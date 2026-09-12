#!/usr/bin/env bash
# Destructive operator action; it refuses to run until the acceptance gate passes.
set -euo pipefail

CLUSTER="${K3D_CLUSTER:-mentolder-dev}"
HOST="${K3D_HOST:-patrick@10.0.33.1}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! bash "${REPO}/scripts/devmesh/acceptance.sh"; then
  echo "k3d-teardown: Abnahme-Gate nicht bestanden — Cluster ${CLUSTER} bleibt stehen" >&2
  exit 1
fi

ssh -o BatchMode=yes "$HOST" "k3d cluster delete ${CLUSTER}"
kubectl config delete-context "k3d-${CLUSTER}" >/dev/null 2>&1 || true
if ssh -o BatchMode=yes "$HOST" "k3d cluster list" | grep -qw "${CLUSTER}"; then
  echo "k3d-teardown: ${CLUSTER} existiert nach dem Abbau noch" >&2
  exit 1
fi
echo "k3d-teardown: ${CLUSTER} abgebaut"
