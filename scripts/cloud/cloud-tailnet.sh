#!/usr/bin/env bash
# scripts/cloud/cloud-tailnet.sh — Tailnet-Zugang und Cluster-Port-Forwards fuer Cloud-Sessions (cloud-tailnet-access)
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
MOCK_NO_TUN="${MOCK_NO_TUN:-0}"
DEV_CTX="devmesh"
DEV_NS="workspace"
PORTS="18235:18235 13001:13001 13005:13005"

cmd="${1:-status}"
shift || true

case "$cmd" in
  up)
    if [ -z "${TS_AUTHKEY:-}" ]; then
      echo "Fehler: TS_AUTHKEY ist nicht gesetzt oder leer." >&2
      exit 2
    fi

    key_file="/dev/shm/.ts_key_$$"
    touch "$key_file"
    chmod 600 "$key_file"
    printf '%s' "$TS_AUTHKEY" > "$key_file"
    trap 'rm -f "$key_file"' EXIT

    tun_flag=""
    if [ "$MOCK_NO_TUN" = "1" ] || [ ! -e /dev/net/tun ]; then
      tun_flag="--tun=userspace-networking"
    fi

    if [ "$DRY_RUN" = "1" ]; then
      echo "[DRY-RUN] tailscaled $tun_flag"
      echo "[DRY-RUN] tailscale up --auth-key=file:$key_file --advertise-tags=tag:cloud --hostname=claude-cloud $tun_flag"
      rm -f "$key_file"
      trap - EXIT
    else
      if ! pgrep tailscaled >/dev/null 2>&1; then
        tailscaled $tun_flag >/tmp/tailscaled.log 2>&1 &
        sleep 2
      fi
      tailscale up --auth-key="file:$key_file" --advertise-tags=tag:cloud --hostname=claude-cloud $tun_flag
      rm -f "$key_file"
      trap - EXIT
    fi

    if [ -n "${DEVMESH_KUBECONFIG_B64:-}" ]; then
      mkdir -p ~/.kube
      printf '%s' "$DEVMESH_KUBECONFIG_B64" | base64 -d > ~/.kube/config
      chmod 600 ~/.kube/config
    fi
    ;;

  forward)
    if [ "$DRY_RUN" = "1" ]; then
      echo "[DRY-RUN] kubectl --context $DEV_CTX -n $DEV_NS port-forward svc/llm-services $PORTS (Ports: 18235 13001 13005)"
    else
      while true; do
        kubectl --context "$DEV_CTX" -n "$DEV_NS" port-forward svc/llm-services 18235:18235 13001:13001 13005:13005 || true
        sleep 2
      done
    fi
    ;;

  status)
    echo "Cloud-Tailnet Status:"
    echo "  Kontext: $DEV_CTX"
    echo "  Namespace: $DEV_NS"
    echo "  Dienste/Ports: svc/llm-services (18235, 13001, 13005)"
    if [ "$DRY_RUN" = "1" ]; then
      echo "  Tailscale: (dry-run)"
      echo "  Forwards: aktiv fuer Ports 18235, 13001, 13005"
    else
      if command -v tailscale >/dev/null 2>&1; then
        tailscale status 2>&1 || true
      fi
    fi
    ;;

  kubeconfig)
    # Erzeugt aus dem Secret cloud-session-token eine eigenstaendige Kubeconfig
    server_ip="${1:-100.64.0.1}" # Tailscale-IP des devmesh-API-Knotens
    token=$(kubectl --context "$DEV_CTX" -n "$DEV_NS" get secret cloud-session-token -o jsonpath='{.data.token}' | base64 -d 2>/dev/null || echo "DUMMY_TOKEN")
    ca=$(kubectl --context "$DEV_CTX" -n "$DEV_NS" get secret cloud-session-token -o jsonpath='{.data.ca\.crt}' 2>/dev/null || echo "")

    cat <<EOF
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: ${ca}
    server: https://${server_ip}:6443
  name: devmesh
contexts:
- context:
    cluster: devmesh
    namespace: ${DEV_NS}
    user: cloud-session
  name: devmesh
current-context: devmesh
users:
- name: cloud-session
  user:
    token: ${token}
EOF
    ;;

  *)
    echo "Usage: $0 {up|forward|status|kubeconfig}" >&2
    exit 1
    ;;
esac
