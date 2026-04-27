#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# whiteboard-setup.sh
# Installs and configures the Nextcloud Whiteboard app so it agrees with the
# whiteboard collaboration backend on the shared JWT secret.
#
# Without this the whiteboard client surfaces:
#   "Problem mit Authentifizierungskonfiguration — Das JWT-Geheimnis kann
#    falsch konfiguriert sein"
#
# Safe to re-run: each step is idempotent.
#
# Environment:
#   NAMESPACE  - Kubernetes namespace (default: workspace)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
CONTEXT="${CONTEXT:-}"
SCHEME="${SCHEME:-}"

KUBECTL="kubectl ${CONTEXT:+--context ${CONTEXT}}"

nc_occ() {
  $KUBECTL exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    sh -c "$*"
}

echo "=== Nextcloud Whiteboard Setup ==="

# ── Read the JWT secret from the k8s Secret the backend uses ──────────────
JWT_SECRET=$($KUBECTL get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.WHITEBOARD_JWT_SECRET}' 2>/dev/null | base64 -d || true)

if [ -z "${JWT_SECRET}" ]; then
  echo "FEHLER: WHITEBOARD_JWT_SECRET im Secret 'workspace-secrets' nicht gefunden."
  exit 1
fi

# Sanity check: the running backend must use the same value. If someone rotated
# the Secret without restarting the Deployment, the live pod would still use
# the old value and we'd paper over the drift here.
BACKEND_SECRET=$($KUBECTL exec -n "${NAMESPACE}" deploy/whiteboard -- \
  sh -c 'printf %s "$JWT_SECRET_KEY"' 2>/dev/null || true)

if [ -z "${BACKEND_SECRET}" ]; then
  echo "FEHLER: whiteboard-Backend liefert kein JWT_SECRET_KEY (Pod nicht bereit?)."
  exit 1
fi

if [ "${JWT_SECRET}" != "${BACKEND_SECRET}" ]; then
  echo "FEHLER: WHITEBOARD_JWT_SECRET im k8s Secret stimmt nicht mit dem laufenden"
  echo "       whiteboard-Pod überein. Pod neu starten:"
  echo "       ${KUBECTL} rollout restart -n ${NAMESPACE} deploy/whiteboard"
  exit 1
fi

# ── Derive public URL from the whiteboard Ingress ─────────────────────────
# The Ingress is authoritative: it's the URL the user's browser actually hits.
# (Config can be stale/unset on prod overlays.)
INGRESS_JSON=$($KUBECTL get ingress -n "${NAMESPACE}" -o json 2>/dev/null)
# Prefer TLS-backed rules: stale *.localhost dev ingresses also match the
# "whiteboard" backend and would win over prod ones by insertion order.
read -r INGRESS_HOST INGRESS_TLS < <(printf '%s' "${INGRESS_JSON}" | \
  jq -r '
    [.items[] as $i
      | $i.spec.rules[]?
      | select(.http.paths[]?.backend.service.name == "whiteboard")
      | .host as $h
      | {host: $h,
         hasTLS: ($i.spec.tls // [] | map(.hosts[]?) | index($h) != null)}]
    | sort_by(if .hasTLS then 0 else 1 end)
    | first // empty
    | "\(.host) \(.hasTLS)"
  ')

if [ -z "${INGRESS_HOST}" ]; then
  echo "FEHLER: Keine Ingress-Regel mit backend service 'whiteboard' im Namespace"
  echo "       ${NAMESPACE} gefunden. Ist der Ingress deployed?"
  exit 1
fi

if [ -z "${SCHEME}" ]; then
  if [ "${INGRESS_TLS}" = "true" ]; then
    SCHEME="https"
  else
    SCHEME="http"
  fi
fi

COLLAB_URL="${SCHEME}://${INGRESS_HOST}"

echo "  Backend URL: ${COLLAB_URL}"
echo "  JWT secret:  ${#JWT_SECRET} Zeichen (aus workspace-secrets)"

# ── Install + enable the whiteboard app (idempotent) ──────────────────────
if nc_occ "php occ app:list --output=json" 2>/dev/null \
     | grep -q '"whiteboard"'; then
  echo "  whiteboard-App bereits vorhanden"
else
  echo "  Installiere whiteboard-App..."
  nc_occ "php occ app:install whiteboard" 2>&1 || \
    nc_occ "php occ app:enable whiteboard" 2>&1
fi
nc_occ "php occ app:enable whiteboard" >/dev/null 2>&1 || true

# ── Write config values ───────────────────────────────────────────────────
# occ accepts --value="..."; single-quote around the shell value to keep
# special characters intact inside the heredoc-like bash -c payload.
nc_occ "php occ config:app:set whiteboard collabBackendUrl --value='${COLLAB_URL}'" >/dev/null
nc_occ "php occ config:app:set whiteboard jwt_secret_key   --value='${JWT_SECRET}'" >/dev/null

# ── Verify ────────────────────────────────────────────────────────────────
echo ""
echo "=== Verifizierung ==="
GOT_URL=$(nc_occ "php occ config:app:get whiteboard collabBackendUrl" 2>/dev/null || echo "")
GOT_JWT=$(nc_occ "php occ config:app:get whiteboard jwt_secret_key"   2>/dev/null || echo "")

echo "  collabBackendUrl: ${GOT_URL}"
if [ "${GOT_JWT}" = "${JWT_SECRET}" ]; then
  echo "  jwt_secret_key:   OK (stimmt mit Backend überein)"
else
  echo "  jwt_secret_key:   FEHLER — stimmt nicht überein!"
  exit 1
fi

echo ""
echo "=== Whiteboard Setup abgeschlossen ==="
echo "  Nextcloud → Whiteboard → neues Board erstellen."
