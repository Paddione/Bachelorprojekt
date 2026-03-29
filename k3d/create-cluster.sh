#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Homeoffice MVP — k3d Development Cluster erstellen
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

CLUSTER_NAME="${1:-homeoffice-dev}"
DOMAINS="auth.localhost chat.localhost files.localhost meet.localhost"

echo "=== Homeoffice MVP — k3d Development Cluster ==="
echo ""

# ── Voraussetzungen prüfen ─────────────────────────────────────────
for cmd in k3d kubectl docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "FEHLER: '$cmd' ist nicht installiert."
    exit 1
  fi
done

if ! docker info &>/dev/null 2>&1; then
  echo "FEHLER: Docker läuft nicht."
  exit 1
fi

# ── Cluster-Existenz prüfen ─────────────────────────────────────────
if k3d cluster list 2>/dev/null | grep -q "$CLUSTER_NAME"; then
  echo "Cluster '$CLUSTER_NAME' existiert bereits."
  echo "Löschen mit: k3d cluster delete $CLUSTER_NAME"
  exit 1
fi

# ── DNS-Auflösung prüfen ────────────────────────────────────────────
echo "Prüfe DNS-Auflösung für *.localhost..."
DNS_OK=true
for domain in $DOMAINS; do
  if ! getent hosts "$domain" &>/dev/null 2>&1; then
    DNS_OK=false
    break
  fi
done

if [ "$DNS_OK" = false ]; then
  echo ""
  echo "WARNUNG: *.localhost-Domains werden nicht aufgelöst."
  echo "Bitte zu /etc/hosts hinzufügen:"
  echo ""
  echo "  127.0.0.1 $DOMAINS"
  echo ""
  read -p "Trotzdem fortfahren? [j/N] " -n 1 -r
  echo
  [[ $REPLY =~ ^[jJyY]$ ]] || exit 1
fi

# ── k3d Cluster erstellen ───────────────────────────────────────────
echo ""
echo "Erstelle k3d Cluster '$CLUSTER_NAME'..."
k3d cluster create "$CLUSTER_NAME" \
  -p "80:80@loadbalancer" \
  -p "443:443@loadbalancer" \
  --agents 2 \
  --wait

echo ""
echo "Cluster '$CLUSTER_NAME' erfolgreich erstellt."
echo "kubectl context: k3d-$CLUSTER_NAME"
echo ""
echo "Nächster Schritt: cd k3d && ./deploy.sh"
