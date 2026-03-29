#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Homeoffice MVP — Deployment ins k3d Cluster
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

echo "=== Homeoffice MVP — Deployment ==="
echo ""

# ── Namespace anlegen ────────────────────────────────────────────────
echo "[1/5] Namespace erstellen..."
kubectl apply -f namespace.yaml

# ── ConfigMaps aus Projektdateien erstellen ──────────────────────────
# Kustomize darf keine Dateien außerhalb des Basis-Verzeichnisses
# referenzieren, daher werden diese ConfigMaps hier per kubectl erstellt.
echo "[2/5] ConfigMaps aus Projektdateien erstellen..."

kubectl create configmap keycloak-import-script \
  --from-file="import-entrypoint.sh=$PROJECT_ROOT/scripts/import-entrypoint.sh" \
  -n homeoffice --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap mattermost-proxy-config \
  --from-file="default.conf=$PROJECT_ROOT/mattermost/userinfo-proxy.conf" \
  -n homeoffice --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap jitsi-adapter-code \
  --from-file="adapter.ts=$PROJECT_ROOT/jitsi-keycloak-adapter/adapter.ts" \
  -n homeoffice --dry-run=client -o yaml | kubectl apply -f -

# ── Kustomize Manifeste anwenden ─────────────────────────────────────
echo "[3/5] Kubernetes-Manifeste anwenden..."
kubectl apply -k .

# ── Datenbanken abwarten ────────────────────────────────────────────
echo "[4/5] Warte auf Datenbanken..."
for db in keycloak-db mattermost-db nextcloud-db; do
  kubectl rollout status deployment/$db -n homeoffice --timeout=120s
done

# ── Dienste abwarten ────────────────────────────────────────────────
echo "[5/5] Warte auf Dienste (kann 2-3 Minuten dauern)..."
for svc in keycloak mattermost nextcloud prosody jitsi-web; do
  kubectl rollout status deployment/$svc -n homeoffice --timeout=300s 2>/dev/null || \
    echo "  WARNUNG: $svc noch nicht bereit — startet möglicherweise noch."
done

echo ""
echo "=== Deployment abgeschlossen ==="
echo ""
echo "Dienste:"
echo "  Keycloak (SSO):      http://auth.localhost"
echo "  Mattermost (Chat):   http://chat.localhost"
echo "  Nextcloud (Dateien): http://files.localhost"
echo "  Jitsi (Video):       http://meet.localhost"
echo ""
echo "Keycloak Admin-Konsole:"
echo "  URL:      http://auth.localhost/admin"
echo "  Benutzer: admin"
echo "  Passwort: devadmin"
echo ""
echo "Nach dem ersten Nextcloud-Start OIDC-Plugin installieren:"
echo "  kubectl exec -n homeoffice deploy/nextcloud -- php occ app:install oidc_login"
echo ""
echo "Pods prüfen:  kubectl get pods -n homeoffice"
echo "Logs anzeigen: kubectl logs -n homeoffice deploy/<service> -f"
