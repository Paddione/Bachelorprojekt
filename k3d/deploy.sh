#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Workspace MVP — Deployment ins k3d Cluster
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Workspace MVP — Deployment ==="
echo ""

# ── Namespace anlegen ────────────────────────────────────────────────
echo "[1/4] Namespace erstellen..."
kubectl apply -f namespace.yaml

# ── Kustomize Manifeste anwenden ─────────────────────────────────────
echo "[2/4] Kubernetes-Manifeste anwenden..."
kubectl apply -k .

# ── Datenbanken abwarten ────────────────────────────────────────────
echo "[3/4] Warte auf Datenbanken..."
kubectl rollout status deployment/shared-db -n workspace --timeout=120s

# ── Dienste abwarten ────────────────────────────────────────────────
echo "[4/4] Warte auf Dienste (kann 2-3 Minuten dauern)..."
for svc in pocket-id nextcloud vaultwarden tracking; do
  kubectl rollout status "deployment/$svc" -n workspace --timeout=300s 2>/dev/null || \
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
echo "  Pocket ID (SSO):      http://auth.localhost"
echo "  Nextcloud (Dateien):  http://files.localhost"
echo "  Talk HPB (Signaling): http://signaling.localhost"
echo "  Collabora (Office):   http://office.localhost"
echo ""
echo "Pocket ID Admin-UI:"
echo "  URL: http://auth.localhost/settings/admin"
echo "  (Passkey-first — Login-Code via 'kubectl logs -n workspace deploy/pocket-id')"
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
