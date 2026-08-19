#!/usr/bin/env bash
# Laeuft als late-command IM INSTALLER (nicht im Zielsystem) und setzt den
# Hostnamen des frisch installierten Systems anhand der MAC-Adresse.
#
# Warum ueberhaupt: es gibt genau ein ISO fuer alle drei Workstations. Ohne
# diesen Schritt hiessen alle drei gleich, und k3s wuerde die Nodes beim Join
# nicht auseinanderhalten.
#
# Aufruf: assign-identity.sh /target
#
# Mapping-Datei /cdrom/nocloud/node-map, eine Zeile je Node:
#   aa:bb:cc:dd:ee:ff  ws-node-1
# Kommentare (#) und Leerzeilen werden ignoriert, Gross-/Kleinschreibung der
# MAC ist egal.
#
# Kein Treffer -> Fallback ws-<letzte-3-MAC-Oktette>. Der Node bekommt also
# IMMER einen eindeutigen Namen, auch wenn die MAC-Tabelle unvollstaendig ist.
set -uo pipefail

TARGET="${1:-/target}"
# Beide Pfade sind ueberschreibbar, damit die Zuordnungslogik testbar ist,
# ohne ein ISO zu booten (tests/spec/workstation-cluster-iso/).
NODE_MAP="${NODE_MAP:-/cdrom/nocloud/node-map}"
LOG="${ASSIGN_IDENTITY_LOG:-/var/log/assign-identity.log}"

log() { echo "[assign-identity] $*" | tee -a "$LOG" >&2; }

# --- MACs der echten NICs einsammeln, bevorzugt die mit Default-Route -------
collect_macs() {
  local primary=""
  primary="$(ip -o route get 1.1.1.1 2>/dev/null | grep -o 'dev [^ ]*' | awk '{print $2}')"

  local ifaces=()
  [[ -n "$primary" && -e "/sys/class/net/${primary}/address" ]] && ifaces+=("$primary")
  local d
  for d in /sys/class/net/*; do
    local name="${d##*/}"
    [[ "$name" == "lo" ]] && continue
    # Virtuelle Interfaces (bridges, veth, docker) haben kein device-Symlink.
    [[ -e "${d}/device" ]] || continue
    [[ "$name" == "$primary" ]] && continue
    ifaces+=("$name")
  done

  local i
  for i in "${ifaces[@]:-}"; do
    [[ -r "/sys/class/net/${i}/address" ]] || continue
    tr 'A-Z' 'a-z' < "/sys/class/net/${i}/address"
  done
}

# ASSIGN_IDENTITY_MACS ist der Testhaken: gesetzt, ersetzt es die Abfrage von
# /sys/class/net (Leerzeichen- oder Zeilen-getrennte MAC-Liste).
if [[ -n "${ASSIGN_IDENTITY_MACS:-}" ]]; then
  mapfile -t MACS < <(echo "$ASSIGN_IDENTITY_MACS" | tr ' ' '\n' \
    | tr 'A-Z' 'a-z' | grep -v '^$')
else
  mapfile -t MACS < <(collect_macs)
fi
if [[ ${#MACS[@]} -eq 0 ]]; then
  log "WARN: keine physische NIC gefunden — Hostname bleibt beim Fallback aus user-data"
  exit 0
fi
log "gefundene MACs: ${MACS[*]}"

# --- Mapping nachschlagen ---------------------------------------------------
HOSTNAME_NEW=""
if [[ -r "$NODE_MAP" ]]; then
  for mac in "${MACS[@]}"; do
    # Erste Spalte = MAC, zweite = Hostname. CRLF-tolerant.
    match="$(tr -d '\r' < "$NODE_MAP" \
      | sed 's/#.*//' \
      | awk -v m="$mac" 'tolower($1) == m { print $2; exit }')"
    if [[ -n "$match" ]]; then
      HOSTNAME_NEW="$match"
      log "MAC ${mac} -> ${HOSTNAME_NEW} (aus node-map)"
      break
    fi
  done
else
  log "keine node-map unter ${NODE_MAP}"
fi

# --- Fallback: Name aus der MAC ableiten ------------------------------------
if [[ -z "$HOSTNAME_NEW" ]]; then
  suffix="$(echo "${MACS[0]}" | awk -F: '{print $4 $5 $6}')"
  HOSTNAME_NEW="ws-${suffix}"
  log "kein Mapping-Treffer — Fallback-Hostname ${HOSTNAME_NEW}"
fi

# Hostname-Hygiene: nur [a-z0-9-], kein fuehrender/abschliessender Bindestrich.
HOSTNAME_NEW="$(echo "$HOSTNAME_NEW" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' \
  | sed 's/^-*//; s/-*$//')"
if [[ -z "$HOSTNAME_NEW" ]]; then
  log "ERROR: Hostname nach Bereinigung leer — abgebrochen, Fallback bleibt"
  exit 0
fi

# --- Ins Zielsystem schreiben ----------------------------------------------
echo "$HOSTNAME_NEW" > "${TARGET}/etc/hostname"

# /etc/hosts: die vom Installer gesetzte 127.0.1.1-Zeile auf den neuen Namen
# umbiegen; fehlt sie, anhaengen.
if grep -q '^127\.0\.1\.1' "${TARGET}/etc/hosts" 2>/dev/null; then
  sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t${HOSTNAME_NEW}/" "${TARGET}/etc/hosts"
else
  printf '127.0.1.1\t%s\n' "$HOSTNAME_NEW" >> "${TARGET}/etc/hosts"
fi

# cloud-init setzt den Hostnamen beim ersten Boot sonst zurueck.
mkdir -p "${TARGET}/etc/cloud/cloud.cfg.d"
printf 'preserve_hostname: true\n' \
  > "${TARGET}/etc/cloud/cloud.cfg.d/99-preserve-hostname.cfg"

log "Hostname gesetzt: ${HOSTNAME_NEW}"
cp -f "$LOG" "${TARGET}/var/log/assign-identity.log" 2>/dev/null || true
exit 0
