#!/usr/bin/env bash
# scripts/devmesh/preflight.sh — devmesh-Host vor der k3s-Installation pruefen [T900117]
#
# Usage:
#   preflight.sh <host>                  vom Dev-Client: Host aus devmesh/inventory.yaml per SSH
#   preflight.sh --local [--peers a,b]   auf dem Host selbst (so ruft der Client-Modus es remote auf)
#
# Prueft: RAM >= 15 GiB, Swap aus, Zeitsynchronisation, freie k3s-Ports (6443, 2379, 2380,
# 10250, 80, 443 tcp; 51820 udp), Rotationsflag der Platte unter /var/lib/rancher und die
# Erreichbarkeit der anderen Server auf 6443 und 2379. Weitere Listener meldet es als INFO,
# weil ufw sie nach der Installation sperrt.
#
# Umgebung: DEVMESH_INVENTORY, DEVMESH_SSH_USER, DEVMESH_SSH_KEY,
#           DEVMESH_ETCD_PATH (Default /var/lib/rancher)
# Exit 0 geeignet, 1 mindestens ein Befund, 2 Vorbedingung fehlt (Werkzeug, SSH, Inventar).
set -euo pipefail

K3S_TCP_PORTS=(6443 2379 2380 10250 80 443)
K3S_UDP_PORTS=(51820)
MIN_MEM_BYTES=$((15 * 1024 * 1024 * 1024))
FAIL=0

need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }
ok()   { echo "OK   $*"; }
bad()  { echo "FAIL $*"; FAIL=1; }
info() { echo "INFO $*"; }

client_mode() {
  local host="$1" repo inventory ssh_user ssh_key lan peers rc=0
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  inventory="${DEVMESH_INVENTORY:-$repo/devmesh/inventory.yaml}"
  ssh_user="${DEVMESH_SSH_USER:-patrick}"
  ssh_key="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"
  need yq
  need ssh
  [[ -f "$inventory" ]] || { echo "Vorbedingung fehlt: Inventar $inventory" >&2; exit 2; }
  lan="$(HOST="$host" yq -r '.peers[] | select(.name == strenv(HOST)) | .lan_ip // ""' "$inventory")"
  [[ -n "$lan" ]] || { echo "FAIL Host '$host' nicht im Inventar oder ohne lan_ip"; exit 1; }
  peers="$(HOST="$host" yq -r '[.peers[] | select((.k3s_role == "server-init" or .k3s_role == "server-join") and .name != strenv(HOST)) | .lan_ip] | join(",")' "$inventory")"
  ssh -i "$ssh_key" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "${ssh_user}@${lan}" "sudo -n bash -s -- --local --peers '${peers}'" < "${BASH_SOURCE[0]}" || rc=$?
  if (( rc == 255 )); then echo "Vorbedingung fehlt: SSH zu ${ssh_user}@${lan}" >&2; exit 2; fi
  exit "$rc"
}

# Eine Zeile "<port> <adresse> <prozess>" je Listener; $1 = t (tcp) oder u (udp).
listeners() {
  ss "-H${1}lnp" | awk '{
    n = split($4, a, ":"); port = a[n]
    addr = substr($4, 1, length($4) - length(port) - 1)
    proc = "unbekannt"
    if (match($0, /users:\(\("[^"]*"/)) proc = substr($0, RSTART + 9, RLENGTH - 10)
    print port, addr, proc
  }'
}

check_port() {
  local list="$1" port="$2" proto="$3" owner
  owner="$(printf '%s\n' "$list" | awk -v p="$port" '$1 == p {print $3; exit}')"
  if [[ -z "$owner" ]]; then ok "Port $port/$proto frei"; else bad "Port $port/$proto belegt von $owner"; fi
}

local_mode() {
  local peers="$1" etcd_path="${DEVMESH_ETCD_PATH:-/var/lib/rancher}"
  local t mem swaps tcp udp p port addr proc target src disks name rota ip err rc
  export LC_ALL=C
  for t in ss lsblk findmnt free swapon timedatectl timeout awk; do need "$t"; done

  mem="$(free -b | awk '$1 == "Mem:" {print $2}')"
  [[ "$mem" =~ ^[0-9]+$ ]] || { echo "Vorbedingung fehlt: free -b liefert keine Mem-Zeile" >&2; exit 2; }
  if (( mem >= MIN_MEM_BYTES )); then ok "RAM $((mem / 1024 / 1024 / 1024)) GiB"
  else bad "RAM $((mem / 1024 / 1024 / 1024)) GiB, verlangt >= 15 GiB"; fi

  swaps="$(swapon --show=NAME --noheadings)"
  if [[ -z "$swaps" ]]; then ok "Swap aus"; else bad "Swap aktiv: ${swaps//$'\n'/ }"; fi

  if [[ "$(timedatectl show -p NTPSynchronized --value)" == yes ]]; then ok "Zeit synchronisiert (NTP)"
  else bad "Zeitsynchronisation nicht aktiv (timedatectl NTPSynchronized != yes)"; fi

  tcp="$(listeners t)"
  udp="$(listeners u)"
  for p in "${K3S_TCP_PORTS[@]}"; do check_port "$tcp" "$p" tcp; done
  for p in "${K3S_UDP_PORTS[@]}"; do check_port "$udp" "$p" udp; done
  while read -r port addr proc; do
    if [[ -z "$port" ]]; then continue; fi
    case " 22 ${K3S_TCP_PORTS[*]} " in *" $port "*) continue ;; esac
    case "$addr" in 127.*|"[::1]") continue ;; esac
    info "Port $port/tcp belegt von $proc auf $addr (kein k3s-Port; nach ufw-Aktivierung nur mit eigener Regel erreichbar)"
  done <<<"$tcp"

  target="$etcd_path"
  while [[ ! -e "$target" ]]; do target="$(dirname "$target")"; done
  src="$(findmnt -n -o SOURCE --target "$target")"
  src="${src%%\[*}"
  disks="$(lsblk -n -s -r -o NAME,TYPE,ROTA "$src" | awk '$2 == "disk" {print $1, $3}')"
  if [[ -z "$disks" ]]; then
    bad "Platte unter $target nicht ermittelbar (Quelle ${src:-leer})"
  else
    while read -r name rota; do
      if [[ "$rota" == 1 ]]; then bad "etcd-Platte $name ist rotierend (ROTA=1) unter $target"
      else ok "etcd-Platte $name nicht rotierend"; fi
    done <<<"$disks"
  fi

  for ip in ${peers//,/ }; do
    for p in 6443 2379; do
      rc=0
      err="$(timeout 3 bash -c "exec 3<>/dev/tcp/${ip}/${p}" 2>&1)" || rc=$?
      if (( rc == 0 )); then ok "$ip:$p offen"
      elif (( rc == 124 )); then bad "$ip:$p keine Antwort in 3s (Router oder Firewall filtert)"
      elif [[ "$err" == *"Connection refused"* ]]; then ok "$ip:$p erreichbar (Port noch geschlossen)"
      else bad "$ip:$p nicht erreichbar: ${err:-Exit $rc}"; fi
    done
  done

  exit "$FAIL"
}

case "${1:-}" in
  --local)
    peers=""
    if [[ "${2:-}" == --peers ]]; then peers="${3:-}"; fi
    local_mode "$peers"
    ;;
  ""|-h|--help)
    echo "Usage: preflight.sh <host> | preflight.sh --local [--peers ip,ip]" >&2
    exit 1
    ;;
  *) client_mode "$1" ;;
esac
