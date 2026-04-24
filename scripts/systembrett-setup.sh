#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# systembrett-setup.sh
# Uploads the Systembrett Whiteboard template into Nextcloud admin's
# Coaching/ folder and triggers a files:scan so Nextcloud indexes it.
#
# Safe to re-run: file is overwritten, scan is idempotent.
#
# Environment:
#   KUBE_CONTEXT — kubectl context; defaults to current context
#   NAMESPACE    — defaults to "workspace"
#   TEMPLATE_SRC — path to systembrett.whiteboard
#                  (defaults to website/public/systembrett/systembrett.whiteboard
#                   relative to the repo root)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_SRC="${TEMPLATE_SRC:-${REPO_ROOT}/website/public/systembrett/systembrett.whiteboard}"

NC_USER="admin"
NC_FOLDER="Coaching"
NC_FILENAME="systembrett.whiteboard"
NC_LEGACY_FILENAME="systembrett-template.whiteboard"

_kubectl() { kubectl ${KUBE_CONTEXT:+--context "$KUBE_CONTEXT"} "$@"; }
_occ() {
  _kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    sh -c "$1" 2>&1
}

echo "=== Systembrett Template Setup ==="

if [ ! -f "${TEMPLATE_SRC}" ]; then
  echo "FEHLER: Template '${TEMPLATE_SRC}' nicht gefunden." >&2
  echo "       Zuerst ausführen: node scripts/systembrett-generate.mjs" >&2
  exit 1
fi

NC_POD=$(_kubectl get pod -n "${NAMESPACE}" -l app=nextcloud \
  -o jsonpath='{.items[0].metadata.name}')

if [ -z "${NC_POD}" ]; then
  echo "FEHLER: Kein Nextcloud-Pod gefunden (app=nextcloud im Namespace ${NAMESPACE})." >&2
  exit 1
fi

NC_FOLDER_PATH="/var/www/html/data/${NC_USER}/files/${NC_FOLDER}"
NC_FILE_PATH="${NC_FOLDER_PATH}/${NC_FILENAME}"

echo "  Ziel-Pod:   ${NC_POD}"
echo "  Ziel-Pfad:  ${NC_FILE_PATH}"

_occ "mkdir -p '${NC_FOLDER_PATH}' && chown -R www-data:www-data '${NC_FOLDER_PATH}'"

# Drop legacy filename if present so coaches don't see two copies.
_occ "rm -f '${NC_FOLDER_PATH}/${NC_LEGACY_FILENAME}'"

_kubectl cp "${TEMPLATE_SRC}" \
  "${NAMESPACE}/${NC_POD}:${NC_FILE_PATH}" -c nextcloud

_occ "chown www-data:www-data '${NC_FILE_PATH}' && chmod 644 '${NC_FILE_PATH}'"

_occ "php occ files:scan --path='${NC_USER}/files/${NC_FOLDER}'"

echo ""
echo "=== Systembrett Setup abgeschlossen ==="
echo "  Coaches finden die Vorlage unter:"
echo "    Files → ${NC_FOLDER}/${NC_FILENAME}"
echo "  Pro Sitzung duplizieren und im Talk-Call teilen."
