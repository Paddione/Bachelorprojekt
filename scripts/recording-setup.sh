#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# recording-setup.sh
# Configures Nextcloud Talk to use the recording backend.
# Run after talk-recording pod is deployed and Nextcloud is ready.
# ENV: KUBE_CONTEXT (optional) — kubectl context; defaults to current context
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# Honour WORKSPACE_NAMESPACE (exported by env-resolve.sh / the Taskfile) so
# `task workspace:recording-setup ENV=korczewski` configures korczewski's
# Nextcloud, not mentolder's `workspace`.
NAMESPACE="${NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"

_kubectl() { kubectl ${KUBE_CONTEXT:+--context "$KUBE_CONTEXT"} "$@"; }
_occ() {
  _kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    sh -c "$1" 2>&1
}

echo "=== Talk Recording Backend Setup ==="

# Get the recording secret from the Kubernetes secret
RECORDING_SECRET=$(_kubectl get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.RECORDING_SECRET}' | base64 -d)

if [ -z "${RECORDING_SECRET}" ]; then
  echo "FEHLER: RECORDING_SECRET nicht gefunden."
  exit 1
fi

echo "  Konfiguriere Nextcloud Talk Recording..."

# Enable call recording
_occ "php occ config:app:set spreed call_recording --value=yes"

# Set recording_servers in the format Talk expects:
#   { "secret": "<shared>", "servers": [{ "server": "<url>", "secret": "<shared>" }] }
# getRecordingSecret() reads .secret, getRecordingServers() reads .servers
_occ "php occ config:app:set spreed recording_servers --value='{\"secret\":\"${RECORDING_SECRET}\",\"servers\":[{\"server\":\"http://talk-recording:1234\",\"secret\":\"${RECORDING_SECRET}\"}]}'"

echo ""
echo "=== Verifizierung ==="
_occ "php occ config:app:get spreed call_recording"
_occ "php occ config:app:get spreed recording_servers"

echo ""
echo "=== Recording Setup abgeschlossen ==="
echo "  Aufnahmen werden in Nextcloud Files unter Talk/{Raumname}/ gespeichert."
echo "  Im Talk-Call: Drei-Punkte-Menu > Aufnahme starten"
