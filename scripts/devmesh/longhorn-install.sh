#!/usr/bin/env bash
# scripts/devmesh/longhorn-install.sh — T900181 (SP-2/Storage, ADR-008)
# Installiert Longhorn (Version aus environments/versions.yaml, SSOT-Key
# longhorn_chart) auf Kontext devmesh, entfernt das local-path-Default-Flag
# und registriert die Knoten-Disks. Ersetzt k3d/dev-cluster/longhorn-install.sh
# (v1.7.2, toter Kontext) — Datei wurde mit diesem Change entfernt.
#
# Usage:
#   longhorn-install.sh [--dry-run] [--help] [context]
#
# Exit 0  installiert (oder dry-run-Plan ausgegeben)
# Exit 1  kubectl/rollout schlug fehl
# Exit 2  Vorbedingung fehlt: kubectl, Kubeconfig-Kontext, versions.yaml
#
# Overrides: LONGHORN_VERSION (Default aus versions.yaml), DRY_RUN=1.
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSIONS="${REPO_ROOT}/environments/versions.yaml"

usage() {
  sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *) CTX_ARG="$1"; shift ;;
  esac
done

CTX="${CTX_ARG:-devmesh}"
VERSION="v$(grep -E '^longhorn_chart:' "$VERSIONS" | awk '{print $2}')"

[[ -n "$VERSION" && "$VERSION" != "v" ]] || { echo "longhorn_chart missing in $VERSIONS" >&2; exit 2; }
command -v kubectl >/dev/null 2>&1 || { echo "kubectl not found" >&2; exit 2; }

PLAN="install Longhorn ${VERSION} on context ${CTX}; remove local-path default flag; register node disks"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN plan: ${PLAN}"
  echo "DRY_RUN: kubectl --context ${CTX} apply -f https://raw.githubusercontent.com/longhorn/longhorn/${VERSION}/deploy/longhorn.yaml"
  echo "DRY_RUN: kubectl --context ${CTX} -n longhorn-system rollout status deploy/longhorn-driver-deployer --timeout=600s"
  echo "DRY_RUN: kubectl --context ${CTX} patch storageclass local-path -p {is-default-class=false}"
  exit 0
fi

kubectl --context "$CTX" apply \
  -f "https://raw.githubusercontent.com/longhorn/longhorn/${VERSION}/deploy/longhorn.yaml"

kubectl --context "$CTX" -n longhorn-system rollout status deploy/longhorn-driver-deployer --timeout=600s

kubectl --context "$CTX" patch storageclass local-path \
  -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'

DEFAULTS="$(kubectl --context "$CTX" get storageclass -o jsonpath='{range .items[?(@.metadata.annotations.storageclass\.kubernetes\.io/is-default-class=="true")]}{.metadata.name}{"\n"}{end}')"
[[ "$DEFAULTS" == "longhorn" ]] || { echo "expected exactly the longhorn default StorageClass, got: ${DEFAULTS:-<none>}" >&2; exit 1; }

echo "Longhorn ${VERSION} installed on ${CTX} and set as default StorageClass"
