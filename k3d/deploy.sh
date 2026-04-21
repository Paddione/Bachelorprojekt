#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Workspace MVP — Deployment ins k3d Cluster
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

echo "=== Workspace MVP — Deployment ==="
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
  -n workspace --dry-run=client -o yaml | kubectl apply -f -

  -n workspace --dry-run=client -o yaml | kubectl apply -f -

# ── Kustomize Manifeste anwenden ─────────────────────────────────────
echo "[3/5] Kubernetes-Manifeste anwenden..."
kubectl apply -k .

# ── Datenbanken abwarten ────────────────────────────────────────────
echo "[4/5] Warte auf Datenbanken..."
  kubectl rollout status deployment/$db -n workspace --timeout=120s
done

# ── Dienste abwarten ────────────────────────────────────────────────
echo "[5/5] Warte auf Dienste (kann 2-3 Minuten dauern)..."
  kubectl rollout status deployment/$svc -n workspace --timeout=300s 2>/dev/null || \
    echo "  WARNUNG: $svc noch nicht bereit — startet möglicherweise noch."
done

# Collabora lives in its own privileged namespace (office-stack). Deployed
# separately via `task workspace:office:deploy` or `kubectl apply -k office-stack`.
if kubectl get deployment collabora -n workspace-office >/dev/null 2>&1; then
  kubectl rollout status deployment/collabora -n workspace-office --timeout=300s 2>/dev/null || \
    echo "  WARNUNG: collabora (workspace-office) noch nicht bereit."
fi

echo ""
echo "=== Deployment abgeschlossen ==="
echo ""
echo "Dienste:"
echo "  Keycloak (SSO):       http://auth.localhost"
echo "  Nextcloud (Dateien):  http://files.localhost"
echo "  Talk HPB (Signaling): http://signaling.localhost"
echo "  Collabora (Office):   http://office.localhost"
echo ""
echo "Keycloak Admin-Konsole:"
echo "  URL:      http://auth.localhost/admin"
echo "  Benutzer: admin"
echo "  Passwort: devadmin"
echo ""
echo "Nach dem ersten Nextcloud-Start Plugins installieren:"
echo "  kubectl exec -n workspace deploy/nextcloud -- php occ app:install oidc_login"
echo "  kubectl exec -n workspace deploy/nextcloud -- php occ app:install spreed"
echo "  kubectl exec -n workspace deploy/nextcloud -- php occ app:install richdocuments"
echo ""
echo "Talk HPB konfigurieren:"
echo "  kubectl exec -n workspace deploy/nextcloud -- php occ config:app:set spreed stun_servers --value='[{\"server\":\"coturn:3478\"}]'"
echo "  kubectl exec -n workspace deploy/nextcloud -- php occ config:app:set spreed turn_servers --value='[{\"server\":\"coturn:3478\",\"secret\":\"devturnpassword1234\",\"protocols\":\"udp,tcp\"}]'"
echo "  kubectl exec -n workspace deploy/nextcloud -- php occ config:app:set spreed signaling_servers --value='{\"servers\":[{\"server\":\"http://signaling.localhost/standalone-signaling/\",\"verify\":false}],\"secret\":\"devsignalingsecret1234567890abcdef\"}'"
echo ""
echo "Collabora konfigurieren:"
echo "  kubectl exec -n workspace deploy/nextcloud -- php occ config:app:set richdocuments wopi_url --value='http://collabora.workspace-office.svc.cluster.local:9980'"
echo ""
echo "Pods prüfen:  kubectl get pods -n workspace"
echo "Logs anzeigen: kubectl logs -n workspace deploy/<service> -f"
