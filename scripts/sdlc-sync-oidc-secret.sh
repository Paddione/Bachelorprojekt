#!/usr/bin/env bash
# scripts/sdlc-sync-oidc-secret.sh — T002677
#
# Synchronisiert das OIDC-Client-Secret des `website`-Clients zwischen Pocket ID
# und den Kubernetes-Secrets des lokalen SDLC-Stacks.
#
# Warum das noetig ist: pocket-id-client-seed schreibt ein generiertes Secret nur
# beim ERSTMALIGEN Anlegen eines Clients in die K8s-Secrets zurueck ("secret
# unchanged" bei jedem weiteren Lauf). Der SDLC-Deploy appliziert aber
# k3d/secrets.yaml mit, das POCKET_ID_WEBSITE_SECRET auf einen festen Dev-Wert
# zuruecksetzt. Nach jedem Deploy kennt Pocket ID damit ein anderes Secret als
# die Console — der Token-Exchange scheitert mit invalid_client.
#
# In Prod tritt das nicht auf: dort liegt der Wert im SealedSecret und wurde
# einmalig aus dem Seed-Create uebernommen.
#
# Das Skript generiert ein frisches Secret ueber die Admin-API und schreibt es in
# beide Secrets, dann startet es die Console neu.
#
#   ./scripts/sdlc-sync-oidc-secret.sh [--context k3d-mentolder-dev] [--client website]
set -euo pipefail

CONTEXT="k3d-mentolder-dev"
NS="workspace"
CLIENT="website"
SECRET_KEY="POCKET_ID_WEBSITE_SECRET"

while [ $# -gt 0 ]; do
  case "$1" in
    --context) CONTEXT="$2"; shift 2 ;;
    --namespace) NS="$2"; shift 2 ;;
    --client) CLIENT="$2"; shift 2 ;;
    --secret-key) SECRET_KEY="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

API_KEY=$(kubectl --context "$CONTEXT" get secret -n "$NS" workspace-secrets \
  -o jsonpath='{.data.POCKET_ID_API_KEY}' | base64 -d)
if [ -z "$API_KEY" ]; then
  echo "FEHLER: POCKET_ID_API_KEY ist in workspace-secrets leer." >&2
  echo "  Bootstrap: docs/runbooks/pocket-id-bootstrap.md bzw. scripts/pocket-id-bootstrap.mjs" >&2
  exit 1
fi

echo "→ generiere neues Client-Secret fuer '${CLIENT}'"
# Der Aufruf laeuft in einem Pod im Cluster: pocket-id:1411 ist ein
# ClusterIP-Service und vom Host aus nicht erreichbar.
NEW_SECRET=$(kubectl --context "$CONTEXT" run "oidcsync-$$" -n "$NS" --rm -i --restart=Never \
  --image=curlimages/curl:8.21.0 --quiet --command -- \
  sh -c "curl -fsS -X POST -H 'X-API-KEY: ${API_KEY}' -H 'Content-Type: application/json' \
    http://pocket-id:1411/api/oidc/clients/${CLIENT}/secret" 2>/dev/null \
  | sed -E 's/.*"secret":"([^"]+)".*/\1/')

if [ -z "$NEW_SECRET" ] || [ ${#NEW_SECRET} -lt 8 ]; then
  echo "FEHLER: konnte kein Secret erzeugen (Antwort leer oder unerwartet)." >&2
  exit 1
fi
echo "  Secret erzeugt (${#NEW_SECRET} Zeichen)"

for s in workspace-secrets website-secrets; do
  if kubectl --context "$CONTEXT" get secret -n "$NS" "$s" >/dev/null 2>&1; then
    kubectl --context "$CONTEXT" patch secret -n "$NS" "$s" --type merge \
      -p "{\"stringData\":{\"${SECRET_KEY}\":\"${NEW_SECRET}\"}}" >/dev/null
    echo "  → ${s}/${SECRET_KEY} aktualisiert"
  fi
done

echo "→ starte sdlc-console neu (liest Secrets nur beim Start)"
kubectl --context "$CONTEXT" rollout restart deploy/sdlc-console -n "$NS" >/dev/null
kubectl --context "$CONTEXT" rollout status deploy/sdlc-console -n "$NS" --timeout=300s

echo "✓ OIDC-Client-Secret synchronisiert."
