#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# talk-hpb-setup.sh
# Points the Nextcloud Talk app at the spreed-signaling HPB, the coturn TURN
# server and its STUN port. Without this, Talk falls back to the internal
# signaling backend, which in Nextcloud 33 / Talk ≥21 fails to initialise on
# mobile and behind strict NAT ("Konferenz loggt sich nicht komplett ein").
#
# The secrets are read from the `workspace/workspace-secrets` Secret so dev
# and prod use whatever is currently in the cluster — no literals in this
# script. SIGNALING_SECRET and TURN_SECRET here MUST match what
# spreed-signaling and coturn themselves are started with (see k3d/talk-hpb.yaml
# and k3d/coturn-stack/coturn.yaml — they render their configs from the same
# Secret via envsubst init containers).
#
# Idempotent: re-running the script just overwrites the three app config keys.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"

echo "=== Nextcloud Talk HPB Setup ==="

# ── Resolve target domain ─────────────────────────────────────────────
# domain-config is rendered per-overlay (dev: *.localhost, prod: *.${PROD_DOMAIN}).
SIGNALING_HOST=$(kubectl get configmap domain-config -n "${NAMESPACE}" \
  -o jsonpath='{.data.SIGNALING_DOMAIN}' 2>/dev/null || true)
if [ -z "${SIGNALING_HOST}" ]; then
  echo "FEHLER: domain-config/SIGNALING_DOMAIN nicht gefunden in Namespace ${NAMESPACE}."
  exit 1
fi

# Derive TURN hostname from the Nextcloud domain (turn.<base>).
# NC_DOMAIN is already in the form files.<base>, so strip the leading files.
NC_HOST=$(kubectl get configmap domain-config -n "${NAMESPACE}" \
  -o jsonpath='{.data.NC_DOMAIN}' 2>/dev/null || true)
TURN_HOST="turn.${NC_HOST#files.}"

# Pick a scheme for the HPB URL. localhost dev is HTTP, everything else HTTPS.
case "${SIGNALING_HOST}" in
  *.localhost) SIGNALING_URL="http://${SIGNALING_HOST}/" ; SIGNALING_VERIFY="false" ;;
  *)           SIGNALING_URL="https://${SIGNALING_HOST}/" ; SIGNALING_VERIFY="true"  ;;
esac

# ── Resolve secrets from workspace-secrets ────────────────────────────
SIGNALING_SECRET=$(kubectl get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.SIGNALING_SECRET}' 2>/dev/null | base64 -d 2>/dev/null || true)
TURN_SECRET=$(kubectl get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.TURN_SECRET}' 2>/dev/null | base64 -d 2>/dev/null || true)

if [ -z "${SIGNALING_SECRET}" ] || [ "${SIGNALING_SECRET}" = "MANAGED_EXTERNALLY" ]; then
  echo "FEHLER: SIGNALING_SECRET in workspace-secrets fehlt oder ist noch MANAGED_EXTERNALLY."
  echo "       Erst 'task workspace:prod:deploy' laufen lassen (seeds real secrets)."
  exit 1
fi
if [ -z "${TURN_SECRET}" ] || [ "${TURN_SECRET}" = "MANAGED_EXTERNALLY" ]; then
  echo "FEHLER: TURN_SECRET in workspace-secrets fehlt oder ist noch MANAGED_EXTERNALLY."
  exit 1
fi

# ── Build JSON payloads ───────────────────────────────────────────────
# jq constructs valid JSON regardless of special characters in the secrets.
SIGNALING_JSON=$(jq -cn \
  --arg url "${SIGNALING_URL}" \
  --arg secret "${SIGNALING_SECRET}" \
  --argjson verify "${SIGNALING_VERIFY}" \
  '{servers:[{server:$url, verify:$verify}], secret:$secret, hideWarning:true}')

STUN_JSON=$(jq -cn \
  --arg server "${TURN_HOST}:3478" \
  '[{server:$server}]')

TURN_JSON=$(jq -cn \
  --arg server "${TURN_HOST}:3478" \
  --arg secret "${TURN_SECRET}" \
  '[{server:$server, secret:$secret, protocols:"udp,tcp"}]')

# ── Apply to Nextcloud via occ ────────────────────────────────────────
_occ() {
  kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    su -s /bin/bash www-data -c "$*"
}

echo "  Konfiguriere spreed signaling_servers  → ${SIGNALING_URL}"
_occ "php occ config:app:set spreed signaling_servers --value='${SIGNALING_JSON}'" > /dev/null

echo "  Konfiguriere spreed stun_servers       → ${TURN_HOST}:3478"
_occ "php occ config:app:set spreed stun_servers --value='${STUN_JSON}'" > /dev/null

echo "  Konfiguriere spreed turn_servers       → ${TURN_HOST}:3478 (udp,tcp)"
_occ "php occ config:app:set spreed turn_servers --value='${TURN_JSON}'" > /dev/null

# ── Verification ──────────────────────────────────────────────────────
echo ""
echo "=== Verifizierung ==="
_occ "php occ config:app:get spreed signaling_servers" || true
_occ "php occ config:app:get spreed stun_servers" || true
_occ "php occ config:app:get spreed turn_servers" || true

echo ""
echo "=== Talk HPB Setup abgeschlossen ==="
echo "  Öffne ${NC_HOST}/apps/spreed und starte einen Testcall."
echo "  Fehlerquelle #1: TURN-UDP-Port 3478 auf ${TURN_HOST} offen?"
