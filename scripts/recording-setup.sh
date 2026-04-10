#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# recording-setup.sh
# Configures Nextcloud Talk to use the recording backend.
# Run after talk-recording pod is deployed and Nextcloud is ready.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"

echo "=== Talk Recording Backend Setup ==="

# Get the recording secret from the Kubernetes secret
RECORDING_SECRET=$(kubectl get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.RECORDING_SECRET}' | base64 -d)

if [ -z "${RECORDING_SECRET}" ]; then
  echo "FEHLER: RECORDING_SECRET nicht gefunden."
  exit 1
fi

echo "  Konfiguriere Nextcloud Talk Recording..."

# Enable call recording
kubectl exec -n "${NAMESPACE}" deploy/nextcloud -- \
  su -s /bin/bash www-data -c \
  "php occ config:app:set spreed call_recording --value=yes" 2>&1

# Set recording server
kubectl exec -n "${NAMESPACE}" deploy/nextcloud -- \
  su -s /bin/bash www-data -c \
  "php occ config:app:set spreed recording_servers --value='[{\"server\":\"http://talk-recording:1234\",\"secret\":\"${RECORDING_SECRET}\"}]'" 2>&1

echo ""
echo "=== Verifizierung ==="
kubectl exec -n "${NAMESPACE}" deploy/nextcloud -- \
  su -s /bin/bash www-data -c \
  "php occ config:app:get spreed call_recording" 2>&1
kubectl exec -n "${NAMESPACE}" deploy/nextcloud -- \
  su -s /bin/bash www-data -c \
  "php occ config:app:get spreed recording_servers" 2>&1

echo ""
echo "=== Recording Setup abgeschlossen ==="
echo "  Aufnahmen werden in Nextcloud Files unter Talk/{Raumname}/ gespeichert."
echo "  Im Talk-Call: Drei-Punkte-Menu > Aufnahme starten"
