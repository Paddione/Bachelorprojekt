#!/usr/bin/env bash
# scripts/sdlc/kubelet-cert-check.sh — T002999
# Prueft das Kubelet-Serving-Zertifikat jedes k3d-Nodes darauf, ob die
# InternalIP des Nodes im SAN des Zertifikats enthalten ist.
#
# Usage:
#   kubelet-cert-check.sh [--context <ctx>] [--repair] [--help]
#
# Exit 0 wenn jede Node-IP in ihrer SAN-Liste steht, sonst 1.
# Exit 2 wenn eine Vorbedingung fehlt (kubectl, docker, openssl, Kontext).
# --repair: loescht serving-kubelet.crt/.key im Container und startet ihn neu.
#           Nur fuer Nodes, die im Prueflauf als FAIL erkannt wurden.
set -euo pipefail

CTX="${CTX:-k3d-mentolder-dev}"
REPAIR=0

usage() {
  cat <<'EOF'
Usage: kubelet-cert-check.sh [--context <name>] [--repair] [--help]

  --context <name>  Kubernetes context (default: k3d-mentolder-dev)
  --repair          Repair mode: delete and regenerate the Kubelet serving
                    certificate on nodes where the SAN does not match the
                    node's InternalIP.
  --help            Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) CTX="${2:?missing --context value}"; shift 2 ;;
    --repair)  REPAIR=1; shift ;;
    --help)    usage; exit 0 ;;
    *)         echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# ── Vorbedingungen ──────────────────────────────────────────────────────────────

for tool in kubectl docker openssl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Vorbedingung fehlt: $tool nicht im PATH" >&2
    exit 2
  fi
done

if ! kubectl --context "$CTX" get nodes --request-timeout=10s >/dev/null 2>&1; then
  echo "Vorbedingung fehlt: Kontext $CTX nicht erreichbar" >&2
  exit 2
fi

# ── Prueflauf ───────────────────────────────────────────────────────────────────

declare -a FAILED_NODES=()
EXIT=0

# Node-Liste und InternalIP pro Node
while IFS=' ' read -r node_name node_ip; do
  # SAN aus dem Container-Zertifikat lesen: docker exec cat das crt,
  # host-seitig per openssl parsen (der k3s-Container hat kein openssl)
  san_text="$(docker exec "$node_name" cat /var/lib/rancher/k3s/agent/serving-kubelet.crt 2>/dev/null \
    | openssl x509 -noout -text 2>/dev/null || true)"

  if [[ -z "$san_text" ]]; then
    echo "FAIL $node_name Node-IP=$node_ip SAN=<nicht lesbar>  (reparierbar mit --repair)"
    FAILED_NODES+=("$node_name")
    EXIT=1
    continue
  fi

  # IPv4-SAN-IPs extrahieren (IPv6 ignorieren — der beobachtete Defekt betrifft
  # ausschliesslich die IPv4-Adresse)
  san_ips="$(echo "$san_text" | grep -oE 'IP Address:[0-9.]+' | sed 's/IP Address://' | tr '\n' ' ')"

  if echo " $san_ips " | grep -q " $node_ip "; then
    echo "OK   $node_name Node-IP=$node_ip SAN-IPs=$san_ips"
  else
    echo "FAIL $node_name Node-IP=$node_ip SAN-IPs=$san_ips  (reparierbar mit --repair)"
    FAILED_NODES+=("$node_name")
    EXIT=1
  fi
done < <(kubectl --context "$CTX" get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' 2>/dev/null)

# ── Reparatur ───────────────────────────────────────────────────────────────────

if [[ "$REPAIR" -eq 1 && ${#FAILED_NODES[@]} -gt 0 ]]; then
  echo "" >&2
  echo "kubelet-cert-check.sh: repariere ${#FAILED_NODES[@]} Node(s)..." >&2
  for node in "${FAILED_NODES[@]}"; do
    echo "  $node: loesche serving-kubelet.crt/.key und starte neu..." >&2
    # Reihenfolge ist bindend: erst die Dateien loeschen, DANN den Container
    # neu starten. Ein Neustart ohne vorheriges Loeschen schreibt die Datei
    # zwar neu (mtime aendert sich), stellt sie aber NICHT neu aus — der SAN
    # bleibt alt. Dies ist der eigentliche Kern des Fixes (T002999).
    docker exec "$node" sh -c \
      'rm -f /var/lib/rancher/k3s/agent/serving-kubelet.crt \
             /var/lib/rancher/k3s/agent/serving-kubelet.key' 2>/dev/null || true
    docker restart "$node" >/dev/null 2>&1 || true
  done

  # Warte auf Erreichbarkeit des Kontexts nach den Neustarts
  echo "  warte auf Erreichbarkeit des Kontexts $CTX..." >&2
  for i in $(seq 1 60); do
    if kubectl --context "$CTX" get nodes --request-timeout=5s >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  echo "" >&2

  # Wiederhole Prueflauf — Exit-Code des zweiten Laufs ist der Exit-Code
  # des gesamten Aufrufs.
  exec bash "$0" --context "$CTX"
fi

exit "$EXIT"
