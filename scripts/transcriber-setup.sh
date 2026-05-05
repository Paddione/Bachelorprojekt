#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# transcriber-setup.sh
# Legt den transcriber-bot-Nextcloud-User für den talk-transcriber-Pod an.
# Idempotent: bei bereits existierendem User wird nur das Passwort aktualisiert.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# Honour WORKSPACE_NAMESPACE (exported by env-resolve.sh / the Taskfile) so
# `task workspace:transcriber-setup ENV=korczewski` registers the bot in
# workspace-korczewski instead of mentolder's `workspace`.
NAMESPACE="${NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}"

# Hilfsfunktion für occ-Kommandos im Nextcloud-Container
_occ() {
  _kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    sh -c "$1"
}

_kubectl() {
  local ctx_args=()
  [[ -n "${KUBE_CONTEXT:-}" ]] && ctx_args=(--context "$KUBE_CONTEXT")
  kubectl "${ctx_args[@]}" "$@"
}

echo "=== Transcriber-Bot Setup ==="

# Passwort aus Secret laden
TRANSCRIBER_PASS=$(_kubectl get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.TRANSCRIBER_BOT_PASSWORD}' | base64 -d)

if [ -z "${TRANSCRIBER_PASS}" ]; then
  echo "FEHLER: TRANSCRIBER_BOT_PASSWORD fehlt im Secret workspace-secrets."
  exit 1
fi

echo "  Erstelle Nextcloud-User transcriber-bot..."

# User anlegen (|| true = idempotent)
# shellcheck disable=SC2086
_kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
  sh -c "export OC_PASS='${TRANSCRIBER_PASS}' && \
    php occ user:add --display-name='Live-Transkription' \
     --password-from-env transcriber-bot 2>/dev/null || true"

echo "  Registriere Talk-Bot..."

TRANSCRIBER_SECRET=$(_kubectl get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.TRANSCRIBER_SECRET}' | base64 -d)

# Bot global registrieren (--feature=webhook: empfängt Call-Ereignisse)
# Idempotent via || true (bzw. überschreibt falls vorhanden)
_occ "php occ talk:bot:install \
  --feature=webhook \
  --feature=response \
  'Live-Transkription' \
  '${TRANSCRIBER_SECRET}' \
  'http://talk-transcriber:8000/webhook' \
  'Automatische Live-Transkription für alle Räume' || true"

echo "  Aktiviere Call-Transkription in spreed..."
_occ "php occ config:app:set spreed call_transcription_enabled --value=yes"

echo "  Füge 'nextcloud' zu trusted_domains hinzu (für in-cluster Polling)..."
_occ "php occ config:system:set trusted_domains 5 --value=nextcloud"

echo ""
echo "=== Verifizierung ==="
_occ "php occ user:info transcriber-bot" | grep -E "user_id|display"

echo ""
echo "=== Transcriber Setup abgeschlossen ==="
echo "  transcriber-bot User ist in Nextcloud registriert."
echo "  Der talk-transcriber-Pod tritt automatisch aktiven Calls bei."
