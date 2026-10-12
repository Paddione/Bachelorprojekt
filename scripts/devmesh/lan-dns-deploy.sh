#!/usr/bin/env bash
# scripts/devmesh/lan-dns-deploy.sh — AdGuard (dev-local/lan-dns) sicher ausrollen [T016520]
#
# Usage: lan-dns-deploy.sh
#
# Ablauf: pre-check (Node-DNS auf jedem k3s-Host) -> firewall -> label (lan-dns=true
# fuer Inventar-Peers mit lan_dns, entfernt bei allen anderen) -> secret (Web-UI-
# Anmeldung adguard-admin, nur beim ersten Mal; braucht python3-bcrypt) -> apply -> rollout
# -> post-check (Node-DNS auf jedem Host, dig auf jede lan_dns-IP).
# Scheitert rollout oder post-check: rollback (kubectl delete -k) und erneute
# Node-DNS-Pruefung. Hintergrund: ein LoadBalancer auf Port 53 hat beim ersten
# Deploy die Aufloesung aller Nodes gekapert (T016520).
#
# Umgebung: DRY_RUN=1 (nur Schritte ausgeben), DEVMESH_INVENTORY, DEVMESH_SSH_USER,
# DEVMESH_SSH_KEY wie lan-dns-firewall.sh; DEVMESH_CONTEXT (Default devmesh).
# Exit 0 ausgerollt, 1 zurueckgenommen (Grund im Output), 2 Vorbedingung fehlt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"
CTX="${DEVMESH_CONTEXT:-devmesh}"
KUSTOMIZE_DIR="$REPO_ROOT/dev-local/lan-dns"
PROBE_NAME="registry-1.docker.io"
DRY="${DRY_RUN:-0}"

command -v yq >/dev/null 2>&1 || { echo "Vorbedingung fehlt: yq nicht im PATH" >&2; exit 2; }
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

mapfile -t HOSTS < <(yq -r '.peers[] | select((.k3s_role // "") != "") | .name + " " + .lan_ip + " " + ((.lan_dns // false) | tostring)' "$INVENTORY")
[[ ${#HOSTS[@]} -gt 0 ]] || { echo "Vorbedingung fehlt: kein k3s-Host im Inventar" >&2; exit 2; }
grep -q ' true$' <(printf '%s\n' "${HOSTS[@]}") || { echo "Vorbedingung fehlt: kein Peer mit lan_dns: true" >&2; exit 2; }

kc() { kubectl --context "$CTX" "$@"; }

# Node-DNS auf jedem k3s-Host. Rueckgabe 1, sobald ein Host nicht aufloest.
node_dns() {
  local step="$1" rc=0 name ip _
  for entry in "${HOSTS[@]}"; do
    read -r name ip _ <<< "$entry"
    if [[ "$DRY" == 1 ]]; then echo "$step: $name ($ip) getent hosts $PROBE_NAME"; continue; fi
    if ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "${SSH_USER}@${ip}" \
         "timeout 10 getent hosts $PROBE_NAME >/dev/null"; then
      echo "$step: ok    $name ($ip)"
    else
      echo "$step: FEHLT $name ($ip)"; rc=1
    fi
  done
  return $rc
}

rollback() {
  echo "rollback: $1"
  if [[ "$DRY" != 1 ]]; then
    kc delete -k "$KUSTOMIZE_DIR" --ignore-not-found --wait=true || true
    node_dns rollback-check || echo "rollback: Node-DNS weiterhin gestoert — manuell pruefen" >&2
  fi
  exit 1
}

node_dns pre-check || { echo "pre-check: Node-DNS schon vor dem Deploy gestoert, Abbruch" >&2; exit 2; }

echo "firewall: scripts/devmesh/lan-dns-firewall.sh"
[[ "$DRY" == 1 ]] || bash "$REPO_ROOT/scripts/devmesh/lan-dns-firewall.sh"

for entry in "${HOSTS[@]}"; do
  read -r name _ dns <<< "$entry"
  if [[ "$dns" == true ]]; then label="lan-dns=true"; else label="lan-dns-"; fi
  echo "label: $name $label"
  [[ "$DRY" == 1 ]] || kc label node "$name" "$label" --overwrite >/dev/null
done

# Web-UI-Anmeldung: Zufallspasswort und bcrypt-Hash, nur im Cluster. Ein
# vorhandenes Secret bleibt (Passwort aendert sich nicht bei jedem Deploy).
echo "secret: lan-dns/adguard-admin (anlegen, falls es fehlt)"
if [[ "$DRY" != 1 ]] && ! kc -n lan-dns get secret adguard-admin >/dev/null 2>&1; then
  python3 -c 'import bcrypt' 2>/dev/null \
    || { echo "Vorbedingung fehlt: python3-bcrypt (pip install bcrypt)" >&2; exit 2; }
  kc create namespace lan-dns --dry-run=client -o yaml | kc apply -f - >/dev/null
  pw="$(openssl rand -base64 24)"
  hash="$(PW="$pw" python3 -c 'import bcrypt,os;print(bcrypt.hashpw(os.environ["PW"].encode(),bcrypt.gensalt()).decode())')"
  kc -n lan-dns create secret generic adguard-admin \
    --from-literal=username=admin --from-literal=password="$pw" --from-literal=bcrypt="$hash" >/dev/null
  unset pw hash
fi

echo "apply: kubectl apply -k dev-local/lan-dns"
[[ "$DRY" == 1 ]] || kc apply -k "$KUSTOMIZE_DIR"

echo "rollout: daemonset/adguard"
if [[ "$DRY" != 1 ]] && ! kc -n lan-dns rollout status ds/adguard --timeout=180s; then
  rollback "Rollout nicht fertig"
fi

node_dns post-check || rollback "Node-DNS nach dem Rollout gestoert"
for entry in "${HOSTS[@]}"; do
  read -r name ip dns <<< "$entry"
  [[ "$dns" == true ]] || continue
  if [[ "$DRY" == 1 ]]; then echo "post-check: dig @$ip $PROBE_NAME"; continue; fi
  if [[ -n "$(dig +time=3 +tries=2 +short @"$ip" "$PROBE_NAME" 2>/dev/null)" ]]; then
    echo "post-check: ok    AdGuard $name ($ip)"
  else
    rollback "AdGuard auf $name ($ip) antwortet nicht"
  fi
done
[[ "$DRY" != 1 ]] || echo "rollback: bei Fehler in rollout/post-check kubectl delete -k dev-local/lan-dns"
echo "lan-dns ausgerollt"
