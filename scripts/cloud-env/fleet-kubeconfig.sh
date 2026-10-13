#!/usr/bin/env bash
# scripts/cloud-env/fleet-kubeconfig.sh - Kubeconfig fuer die Cloud-Umgebung "mentolder-prod" erzeugen
#
# Stellt ein kurzlebiges Token fuer den ServiceAccount cloud-env-fleet-admin aus
# (scripts/cloud-env/rbac-fleet.yaml, TokenRequest) und schreibt eine eigene Kubeconfig mit Context
# "fleet". Die normale Kubeconfig bleibt unberuehrt. Das Token steht NUR in der Datei, nicht auf der Konsole.
#
# Aufruf (WSL):
#   bash scripts/cloud-env/fleet-kubeconfig.sh
#   base64 -w0 ~/.kube/fleet-cloud.yaml      # -> Variable FLEET_KUBECONFIG_B64 der Cloud-Umgebung
#
# Notfall ohne funktionierenden Kontext "fleet" (Aufruf auf einem fleet-Control-Plane-Node per SSH):
#   KUBECTL="sudo k3s kubectl" bash fleet-kubeconfig.sh
#
# Variablen: SOURCE_CONTEXT (default fleet), KUBECTL (default "kubectl --context $SOURCE_CONTEXT"),
#            TOKEN_DURATION (default 24h, der API-Server kann es begrenzen),
#            FLEET_API (default https://204.168.244.104:6443), KUBECONFIG_TARGET (default ~/.kube/fleet-cloud.yaml)
set -euo pipefail

SOURCE_CONTEXT="${SOURCE_CONTEXT:-fleet}"
FLEET_API="${FLEET_API:-https://204.168.244.104:6443}"
TARGET="${KUBECONFIG_TARGET:-$HOME/.kube/fleet-cloud.yaml}"
SA="cloud-env-fleet-admin"
TOKEN_DURATION="${TOKEN_DURATION:-24h}"
KUBECTL="${KUBECTL:-kubectl --context $SOURCE_CONTEXT}"

# shellcheck disable=SC2086  # KUBECTL darf mehrere Woerter haben ("sudo k3s kubectl")
k() { $KUBECTL -n kube-system "$@"; }

token="$(k create token "$SA" --duration="$TOKEN_DURATION")"
ca="$(k get configmap kube-root-ca.crt -o jsonpath='{.data.ca\.crt}' | base64 -w0)"
[[ -n "$token" && -n "$ca" ]] || { echo "Token oder CA leer - rbac-fleet.yaml angewendet?" >&2; exit 1; }

mkdir -p "$(dirname "$TARGET")"
(umask 077 && cat >"$TARGET" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: fleet
    cluster:
      server: ${FLEET_API}
      certificate-authority-data: ${ca}
users:
  - name: cloud-env-fleet-admin
    user:
      token: ${token}
contexts:
  - name: fleet
    context:
      cluster: fleet
      user: cloud-env-fleet-admin
current-context: fleet
EOF
)

# Gegenprobe mit der neuen Datei (prueft auch, dass die Server-IP im API-Zertifikat steht)
KUBECONFIG="$TARGET" kubectl --context fleet auth whoami 2>/dev/null \
  || KUBECONFIG="$TARGET" kubectl --context fleet get ns kube-system >/dev/null
echo "Kubeconfig geschrieben: $TARGET (Rechte 600), Token gueltig ${TOKEN_DURATION}. Base64: base64 -w0 $TARGET"
