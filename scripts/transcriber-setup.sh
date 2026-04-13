#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# transcriber-setup.sh
# Legt den transcriber-bot-Nextcloud-User für den talk-transcriber-Pod an.
# Idempotent: bei bereits existierendem User kein Fehler.
# ENV: KUBE_CONTEXT (optional) — kubectl context; defaults to current context
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"

_kubectl() { kubectl ${KUBE_CONTEXT:+--context "$KUBE_CONTEXT"} "$@"; }

_occ() {
  _kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    su -s /bin/bash www-data -c "$1" 2>&1
}

echo "=== Transcriber-Bot Setup ==="

# Get the transcriber-bot password from the Kubernetes secret
TRANSCRIBER_PASS=$(_kubectl get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.TRANSCRIBER_BOT_PASSWORD}' | base64 -d)

if [ -z "${TRANSCRIBER_PASS}" ]; then
  echo "FEHLER: TRANSCRIBER_BOT_PASSWORD nicht gefunden." >&2
  exit 1
fi

echo "  Erstelle Nextcloud-User transcriber-bot..."

# User anlegen (|| true = idempotent)
# shellcheck disable=SC2086
_kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
  bash -c "export OC_PASS='${TRANSCRIBER_PASS}' && \
    su -s /bin/bash www-data -c \
    'php occ user:add --display-name=\"Live-Transkription\" \
     --password-from-env transcriber-bot 2>/dev/null || true'"

echo ""
echo "=== Verifizierung ==="
_occ "php occ user:info transcriber-bot" | grep -E "user_id|display"

echo ""
echo "=== Transcriber Setup abgeschlossen ==="
echo "  transcriber-bot User ist in Nextcloud registriert."
echo "  Der talk-transcriber-Pod tritt automatisch aktiven Calls bei."
