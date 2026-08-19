#!/usr/bin/env bash
# scripts/pxe/setup-pxe.sh
#
# Richtet einen PXE-Boot-Server fuer die Cluster-Workstations ein: die
# Maschinen booten uebers Netz und installieren unbeaufsichtigt, ohne
# USB-Medium.
#
# Warum PXE, wenn es den USB-Weg schon gibt: ein umgepacktes ISO ist nicht
# mehr signiert, und Maschinen mit aktivem Secure Boot verweigern den Start.
# Beim PXE-Weg werden Ubuntus signierte shim/grub/Kernel UNVERAENDERT
# durchgereicht; nur die Kernel-Parameter kommen von uns. Das laeuft auch
# mit eingeschaltetem Secure Boot.
#
# Der Server macht drei Dinge:
#   1. Proxy-DHCP (dnsmasq) — beantwortet NUR die Boot-Frage. Die IP-Vergabe
#      bleibt beim vorhandenen Router. Ein zweiter vollwertiger DHCP-Server
#      im selben Netz waere ein Ausfallrisiko fuer alles andere.
#   2. TFTP — liefert shim, grub und den Kernel.
#   3. HTTP — liefert das Ubuntu-ISO, die Autoinstall-Daten und die Helfer.
#
# Beispiel:
#   sudo bash scripts/pxe/setup-pxe.sh \
#     --ssh-key ~/.ssh/id_ed25519.pub \
#     --admin-password 'geheim' \
#     --node-map scripts/iso/node-map
#
# Beenden: sudo bash scripts/pxe/setup-pxe.sh --stop
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# --- Defaults ---------------------------------------------------------------
ROOT_DIR="${PXE_ROOT:-/srv/pxe}"
IFACE=""
SERVER_IP=""
HTTP_PORT="8099"
RELEASE="24.04"
SOURCE_ISO=""
CACHE_DIR="${HOME}/.cache/bachelorprojekt-iso"
SSH_KEY_FILE=""
SSH_KEY_LITERAL=""
NODE_MAP=""
ADMIN_USER="clusteradmin"
ADMIN_PASSWORD=""
LOCALE="de_DE.UTF-8"
KEYBOARD_LAYOUT="de"
TIMEZONE="Europe/Berlin"
HOSTNAME_FALLBACK="ws-node"
PACKAGE_UPGRADE="false"
SHUTDOWN_MODE="poweroff"
DISK_PATH=""
WIPE_DISKS=0
ACTION="start"
FOREGROUND=0

usage() {
  grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Flags:
  --ssh-key <datei|"ssh-ed25519 ...">  Public Key (Pflicht beim Start)
  --node-map <datei>       MAC->Hostname-Tabelle (empfohlen)
  --admin-password <pw>    Konsolen-Passwort; ohne es nur SSH-Key-Login
  --iface <name>           LAN-Interface (default: das der Default-Route)
  --server-ip <ip>         IP, unter der die Nodes den Server sehen
  --http-port <port>       default: 8099
  --root <verz>            Boot-Baum (default: /srv/pxe)
  --release <x.yy>         Ubuntu-Release (default: 24.04)
  --source-iso <datei>     vorhandenes ISO statt Download
  --locale / --keyboard / --timezone / --hostname-fallback
  --disk </dev/pfad>       Zielplatte festnageln (z. B. /dev/nvme0n1). Ohne
                           Angabe waehlt der Installer selbst — das ist der
                           Normalfall und robuster.
  --wipe-disks             LOESCHT vor der Installation alle Signaturen auf
                           allen eingebauten Platten (LVM, mdadm, alte
                           Partitionstabellen). Gegen "curtin bricht beim
                           Partitionieren ab" auf Maschinen mit Vorleben.
                           Betrifft JEDE nicht-wechselbare Platte der Zielmaschine,
                           nicht nur die Installationsziel-Platte.
  --shutdown <poweroff|reboot>  default: poweroff
                           poweroff ist Absicht: bootet die Maschine nach der
                           Installation neu und steht die Boot-Reihenfolge noch
                           auf Netzwerk, installiert sie sich endlos neu.
  --foreground             dnsmasq im Vordergrund (Debug)
  --stop                   Dienste beenden
  --status                 Zustand anzeigen
  -h, --help
EOF
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-key)           a="$2"; shift 2
                         if [[ -f "$a" ]]; then SSH_KEY_FILE="$a"; else SSH_KEY_LITERAL="$a"; fi ;;
    --node-map)          NODE_MAP="$2";          shift 2 ;;
    --admin-password)    ADMIN_PASSWORD="$2";    shift 2 ;;
    --iface)             IFACE="$2";             shift 2 ;;
    --server-ip)         SERVER_IP="$2";         shift 2 ;;
    --http-port)         HTTP_PORT="$2";         shift 2 ;;
    --root)              ROOT_DIR="$2";          shift 2 ;;
    --release)           RELEASE="$2";           shift 2 ;;
    --source-iso)        SOURCE_ISO="$2";        shift 2 ;;
    --cache-dir)         CACHE_DIR="$2";         shift 2 ;;
    --locale)            LOCALE="$2";            shift 2 ;;
    --keyboard)          KEYBOARD_LAYOUT="$2";   shift 2 ;;
    --timezone)          TIMEZONE="$2";          shift 2 ;;
    --hostname-fallback) HOSTNAME_FALLBACK="$2"; shift 2 ;;
    --package-upgrade)   PACKAGE_UPGRADE="true"; shift ;;
    --shutdown)          SHUTDOWN_MODE="$2";     shift 2 ;;
    --disk)              DISK_PATH="$2";         shift 2 ;;
    --wipe-disks)        WIPE_DISKS=1;           shift ;;
    --foreground)        FOREGROUND=1;           shift ;;
    --stop)              ACTION="stop";          shift ;;
    --status)            ACTION="status";        shift ;;
    -h|--help)           usage 0 ;;
    *) echo "Unbekanntes Flag: $1" >&2; usage 1 ;;
  esac
done

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*" >&2; }

PIDFILE_DNSMASQ="${ROOT_DIR}/.dnsmasq.pid"
PIDFILE_HTTP="${ROOT_DIR}/.http.pid"

# --- stop / status ----------------------------------------------------------
stop_services() {
  local stopped=0
  for pf in "$PIDFILE_DNSMASQ" "$PIDFILE_HTTP"; do
    [[ -f "$pf" ]] || continue
    local pid; pid="$(cat "$pf" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      stopped=1
      info "beendet: PID ${pid} (${pf##*/})"
    fi
    rm -f "$pf"
  done
  [[ "$stopped" -eq 1 ]] || info "nichts zu beenden"
}

show_status() {
  local any=0
  for pf in "$PIDFILE_DNSMASQ" "$PIDFILE_HTTP"; do
    if [[ -f "$pf" ]]; then
      local pid; pid="$(cat "$pf" 2>/dev/null || true)"
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo "laeuft: ${pf##*/} PID ${pid}"
        any=1
      else
        echo "tot (PID-Datei verwaist): ${pf##*/}"
      fi
    fi
  done
  [[ "$any" -eq 1 ]] || echo "kein PXE-Dienst aktiv"
  echo
  echo "Boot-Baum: ${ROOT_DIR}"
  [[ -d "$ROOT_DIR" ]] && du -sh "$ROOT_DIR" 2>/dev/null || echo "  (nicht vorhanden)"
}

case "$ACTION" in
  stop)   stop_services; exit 0 ;;
  status) show_status;   exit 0 ;;
esac

# --- Argumente pruefen (vor dem Werkzeug-Check) -----------------------------
if [[ -n "$SSH_KEY_FILE" ]]; then
  SSH_PUBLIC_KEY="$(tr -d '\r\n' < "$SSH_KEY_FILE")"
elif [[ -n "$SSH_KEY_LITERAL" ]]; then
  SSH_PUBLIC_KEY="$SSH_KEY_LITERAL"
else
  die "--ssh-key fehlt. Ohne Public Key waere der Node nach dem Reboot nicht erreichbar."
fi
[[ "$SSH_PUBLIC_KEY" =~ ^(ssh-(rsa|ed25519)|ecdsa-sha2-) ]] \
  || die "--ssh-key sieht nicht wie ein Public Key aus: ${SSH_PUBLIC_KEY:0:40}..."
[[ "$SSH_PUBLIC_KEY" == *PRIVATE* ]] && die "--ssh-key zeigt auf einen PRIVATEN Schluessel."

case "$SHUTDOWN_MODE" in poweroff|reboot) ;; *) die "--shutdown: poweroff oder reboot" ;; esac
if [[ -n "$DISK_PATH" ]]; then
  [[ "$DISK_PATH" == /dev/* ]] || die "--disk erwartet einen Geraetepfad wie /dev/nvme0n1, nicht: $DISK_PATH"
fi
[[ "$HTTP_PORT" =~ ^[0-9]+$ ]] || die "--http-port ist keine Zahl: $HTTP_PORT"
if [[ -n "$NODE_MAP" ]]; then
  [[ -f "$NODE_MAP" ]] || die "--node-map nicht gefunden: $NODE_MAP"
fi

K3S_VERSION="$(awk -F': *' '/^k3s:/ {print $2; exit}' \
  "${PROJECT_DIR}/environments/versions.yaml" 2>/dev/null || true)"
[[ -n "$K3S_VERSION" ]] || die "k3s-Version nicht aus environments/versions.yaml lesbar"

# --- Werkzeuge --------------------------------------------------------------
missing=()
for t in xorriso curl envsubst openssl python3 ip awk sed; do
  command -v "$t" >/dev/null 2>&1 || missing+=("$t")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: fehlende Werkzeuge: ${missing[*]}" >&2
  echo "  sudo apt install -y xorriso curl gettext-base openssl python3 iproute2" >&2
  exit 1
fi
if ! command -v dnsmasq >/dev/null 2>&1; then
  die "dnsmasq fehlt — sudo apt install -y dnsmasq"
fi

[[ $EUID -eq 0 ]] || die "als root ausfuehren (sudo): TFTP und Proxy-DHCP brauchen Port 69 und 67"

# --- Netzwerk ermitteln -----------------------------------------------------
if [[ -z "$IFACE" ]]; then
  IFACE="$(ip -o route show default | awk '{print $5; exit}')"
fi
[[ -n "$IFACE" ]] || die "LAN-Interface nicht ermittelbar — --iface angeben"
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP="$(ip -4 -o addr show dev "$IFACE" | awk '{print $4}' | cut -d/ -f1 | head -1)"
fi
[[ -n "$SERVER_IP" ]] || die "Server-IP auf ${IFACE} nicht ermittelbar — --server-ip angeben"

BASE_URL="http://${SERVER_IP}:${HTTP_PORT}"
info "Interface ${IFACE}, Server ${SERVER_IP}, HTTP ${BASE_URL}"

# Ein zweiter DHCP-Server im Netz waere ein Betriebsrisiko. Proxy-DHCP
# antwortet nur mit Boot-Infos — aber nur, wenn ueberhaupt schon einer da ist.
if ! ip -o route show default | grep -q .; then
  die "keine Default-Route — ohne bestehendes Netz ist Proxy-DHCP sinnlos"
fi

# --- Passwort-Hash ----------------------------------------------------------
if [[ -n "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD_HASH="$(openssl passwd -6 "$ADMIN_PASSWORD")"
else
  ADMIN_PASSWORD_HASH='!'
  echo "WARN: kein --admin-password — Konsolen-Login gesperrt, nur SSH-Key." >&2
fi

# --- Quell-ISO --------------------------------------------------------------
mkdir -p "$CACHE_DIR"
if [[ -z "$SOURCE_ISO" ]]; then
  BASE_ISO_URL="https://releases.ubuntu.com/${RELEASE}"
  info "Ermittle aktuelles Point-Release fuer Ubuntu ${RELEASE}"
  SUMS="$(curl -fsSL "${BASE_ISO_URL}/SHA256SUMS")" \
    || die "SHA256SUMS von ${BASE_ISO_URL} nicht abrufbar"
  ISO_NAME="$(echo "$SUMS" | awk '{print $2}' | tr -d '*' \
    | grep -E '^ubuntu-.*-live-server-amd64\.iso$' | sort -V | tail -1)"
  [[ -n "$ISO_NAME" ]] || die "kein live-server-amd64-ISO in ${BASE_ISO_URL}/SHA256SUMS"
  SOURCE_ISO="${CACHE_DIR}/${ISO_NAME}"
  EXPECTED_SHA="$(echo "$SUMS" | grep -F "$ISO_NAME" | awk '{print $1}' | head -1)"
  if [[ -f "$SOURCE_ISO" ]] \
     && echo "${EXPECTED_SHA}  ${SOURCE_ISO}" | sha256sum -c --status 2>/dev/null; then
    info "Quell-ISO aus dem Cache: ${SOURCE_ISO}"
  else
    info "Lade ${ISO_NAME} (~3 GB)"
    curl -fL --progress-bar -o "${SOURCE_ISO}.part" "${BASE_ISO_URL}/${ISO_NAME}"
    mv "${SOURCE_ISO}.part" "$SOURCE_ISO"
    echo "${EXPECTED_SHA}  ${SOURCE_ISO}" | sha256sum -c - >&2 \
      || die "SHA256 des heruntergeladenen ISO stimmt nicht"
  fi
else
  [[ -f "$SOURCE_ISO" ]] || die "--source-iso nicht gefunden: $SOURCE_ISO"
fi
ISO_BASENAME="$(basename "$SOURCE_ISO")"

# --- Boot-Baum aufbauen -----------------------------------------------------
TFTP_DIR="${ROOT_DIR}/tftp"
HTTP_DIR="${ROOT_DIR}/http"
mkdir -p "${TFTP_DIR}/grub" "${TFTP_DIR}/EFI/ubuntu" "${TFTP_DIR}/casper" \
         "${HTTP_DIR}/nocloud" "${HTTP_DIR}/assets"

info "Extrahiere Boot-Dateien aus ${ISO_BASENAME}"
TMP_X="$(mktemp -d)"
trap 'rm -rf "$TMP_X"' EXIT
xorriso -osirrox on -indev "$SOURCE_ISO" \
  -extract /EFI "${TMP_X}/EFI" \
  -extract /casper/vmlinuz "${TMP_X}/vmlinuz" \
  -extract /casper/initrd "${TMP_X}/initrd" >/dev/null 2>&1 \
  || die "Extraktion aus dem ISO fehlgeschlagen"

# shim bleibt UNVERAENDERT — das ist der ganze Punkt: es ist von Microsoft
# signiert und passiert Secure Boot.
install -m 0644 "${TMP_X}/EFI/boot/bootx64.efi" "${TFTP_DIR}/bootx64.efi"

# grub braucht dagegen die NETBOOT-Variante. Das grubx64.efi aus dem ISO hat
# einen lokalen $prefix einkompiliert und sucht seine Konfiguration deshalb
# auf einem Laufwerk statt im Netz: gemessen am Netzwerkmitschnitt fragte es
# nach dem eigenen Laden KEINE weitere Datei mehr an und landete in der
# GRUB-Kommandozeile. grubnetx64.efi.signed ist dieselbe Binary mit
# netzwerkbezogenem Prefix — ebenfalls von Canonical signiert.
GRUBNET_SRC="/usr/lib/grub/x86_64-efi-signed/grubnetx64.efi.signed"
if [[ ! -f "$GRUBNET_SRC" ]]; then
  info "Hole grubnetx64.efi.signed aus dem Paket grub-efi-amd64-signed"
  GRUBNET_TMP="$(mktemp -d)"
  ( cd "$GRUBNET_TMP" && apt-get download grub-efi-amd64-signed >/dev/null 2>&1 \
    && dpkg-deb -x ./*.deb x ) \
    || die "grub-efi-amd64-signed nicht beziehbar — 'sudo apt install grub-efi-amd64-signed' und erneut versuchen"
  GRUBNET_SRC="${GRUBNET_TMP}/x/usr/lib/grub/x86_64-efi-signed/grubnetx64.efi.signed"
  [[ -f "$GRUBNET_SRC" ]] \
    || die "grubnetx64.efi.signed steckt nicht im Paket — Ubuntu-Version pruefen"
fi
install -m 0644 "$GRUBNET_SRC" "${TFTP_DIR}/grubx64.efi"
[[ -f "${TMP_X}/EFI/boot/mmx64.efi" ]] \
  && install -m 0644 "${TMP_X}/EFI/boot/mmx64.efi" "${TFTP_DIR}/mmx64.efi"
install -m 0644 "${TMP_X}/vmlinuz" "${TFTP_DIR}/casper/vmlinuz"
install -m 0644 "${TMP_X}/initrd"  "${TFTP_DIR}/casper/initrd"

# Denselben Boot-Baum zusaetzlich per HTTP anbieten. Grund: Proxy-DHCP setzt
# einen freien Port 67 voraus — unter WSL mit mirrored networking haelt den
# der Windows-eigene DHCP, und daran ist von Linux aus nichts zu aendern.
# UEFI-HTTP-Boot braucht keinerlei DHCP-Eingriff: die URL wird an der Maschine
# im Firmware-Setup eingetragen. Die Dateien sind dieselben und signiert.
mkdir -p "${HTTP_DIR}/boot/casper" "${HTTP_DIR}/boot/grub" "${HTTP_DIR}/boot/EFI/ubuntu"
install -m 0644 "${TMP_X}/EFI/boot/bootx64.efi" "${HTTP_DIR}/boot/bootx64.efi"
install -m 0644 "${TFTP_DIR}/grubx64.efi"       "${HTTP_DIR}/boot/grubx64.efi"
[[ -f "${TMP_X}/EFI/boot/mmx64.efi" ]] \
  && install -m 0644 "${TMP_X}/EFI/boot/mmx64.efi" "${HTTP_DIR}/boot/mmx64.efi"
install -m 0644 "${TMP_X}/vmlinuz" "${HTTP_DIR}/boot/casper/vmlinuz"
install -m 0644 "${TMP_X}/initrd"  "${HTTP_DIR}/boot/casper/initrd"

# Das ISO selbst per HTTP: casper laedt es ueber den url=-Parameter. Hardlink
# statt Kopie, sonst liegen 3,2 GB zweimal auf der Platte.
if [[ ! -e "${HTTP_DIR}/${ISO_BASENAME}" ]]; then
  ln "$SOURCE_ISO" "${HTTP_DIR}/${ISO_BASENAME}" 2>/dev/null \
    || cp "$SOURCE_ISO" "${HTTP_DIR}/${ISO_BASENAME}"
fi

# --- GRUB-Konfiguration -----------------------------------------------------
# Das Semikolon MUSS als \; in der Datei landen, sonst schneidet GRUB die
# Kernelzeile dort ab und der Installer findet seine Datenquelle nicht.
cat > "${TFTP_DIR}/grub/grub.cfg" <<EOF
set default=0
set timeout=5

menuentry "Cluster-Node — unbeaufsichtigt installieren" {
  echo "Lade Kernel..."
  linux /casper/vmlinuz ip=dhcp url=${BASE_URL}/${ISO_BASENAME} autoinstall ds=nocloud-net\\;s=${BASE_URL}/nocloud/ cloud-config-url=/dev/null ---
  echo "Lade initrd..."
  initrd /casper/initrd
}

menuentry "Lokale Platte booten" {
  exit 1
}
EOF
# Die signierten grub-Builds suchen die Konfiguration je nach Herkunft unter
# /grub/ oder /EFI/ubuntu/ — beide Orte bedienen, das kostet nichts.
cp "${TFTP_DIR}/grub/grub.cfg" "${TFTP_DIR}/EFI/ubuntu/grub.cfg"

# Fuer den HTTP-Boot-Weg braucht es eine eigene Variante: dort loest grub
# absolute Pfade ab der SERVER-Wurzel auf, nicht ab dem Verzeichnis, aus dem
# es geladen wurde. /casper/vmlinuz zeigte damit ins Leere — die Dateien
# liegen unter /boot/casper/.
sed 's|/casper/|/boot/casper/|g' "${TFTP_DIR}/grub/grub.cfg" \
  > "${HTTP_DIR}/boot/grub/grub.cfg"
cp "${HTTP_DIR}/boot/grub/grub.cfg" "${HTTP_DIR}/boot/EFI/ubuntu/grub.cfg"

grep -qF 'ds=nocloud-net\;s=' "${TFTP_DIR}/grub/grub.cfg" \
  || die "grub.cfg enthaelt kein maskiertes Semikolon — der Installer wuerde interaktiv nachfragen"

# --- Autoinstall-Daten ------------------------------------------------------
info "Rendere user-data"
export PXE_LOCALE="$LOCALE" \
       PXE_KEYBOARD_LAYOUT="$KEYBOARD_LAYOUT" \
       PXE_TIMEZONE="$TIMEZONE" \
       PXE_HOSTNAME_FALLBACK="$HOSTNAME_FALLBACK" \
       PXE_ADMIN_USER="$ADMIN_USER" \
       PXE_ADMIN_PASSWORD_HASH="$ADMIN_PASSWORD_HASH" \
       PXE_SSH_ALLOW_PW="$([[ -n "$ADMIN_PASSWORD" ]] && echo true || echo false)" \
       PXE_SSH_PUBLIC_KEY="$SSH_PUBLIC_KEY" \
       PXE_PACKAGE_UPGRADE="$PACKAGE_UPGRADE" \
       PXE_SHUTDOWN_MODE="$SHUTDOWN_MODE" \
       PXE_BASE_URL="$BASE_URL"

# early-commands laufen VOR der Storage-Erkennung. Genau dort muessen alte
# Signaturen weg: curtin bricht beim Partitionieren ab, wenn ein LVM- oder
# mdadm-Superblock die Platte noch belegt ("Device or resource busy"). Das
# Symptom ist ein Abbruch in stage-partitioning, lange nach der Plattenwahl.
#
# Bewusst hinter einem Flag: das loescht die Platten der Zielmaschine
# vollstaendig und ohne Rueckfrage.
if [[ "$WIPE_DISKS" -eq 1 ]]; then
  export PXE_EARLY_COMMANDS='
  early-commands:
    # Reihenfolge ist wesentlich: erst alles loesen, was die Geraete haelt,
    # dann die Signaturen entfernen. Umgekehrt scheitert wipefs mit EBUSY.
    - swapoff -a || true
    - |
      command -v vgchange >/dev/null 2>&1 && vgchange -an || true
    - |
      command -v mdadm >/dev/null 2>&1 && mdadm --stop --scan || true
    - |
      for d in /sys/block/*; do
        n=$(basename "$d")
        case "$n" in loop*|sr*|ram*|fd*|dm-*|md*) continue ;; esac
        # Wechselmedien auslassen: der Installer selbst kann davon kommen.
        [ "$(cat "$d/removable" 2>/dev/null)" = "1" ] && continue
        echo "wipe: /dev/$n"
        wipefs --all --force "/dev/$n" || true
        command -v sgdisk >/dev/null 2>&1 && sgdisk --zap-all "/dev/$n" || true
      done'
  info "WARNUNG: --wipe-disks aktiv — alle eingebauten Platten der Zielmaschine werden geloescht"
else
  export PXE_EARLY_COMMANDS=""
fi

# Der match-Block wird nur eingefuegt, wenn eine Platte ausdruecklich genannt
# wurde. Ohne --disk bleibt die Stelle leer und subiquity waehlt selbst.
if [[ -n "$DISK_PATH" ]]; then
  export PXE_DISK_MATCH="
      match:
        path: ${DISK_PATH}"
  info "Zielplatte festgelegt: ${DISK_PATH}"
else
  export PXE_DISK_MATCH=""
fi

envsubst '${PXE_LOCALE} ${PXE_KEYBOARD_LAYOUT} ${PXE_TIMEZONE} ${PXE_HOSTNAME_FALLBACK} ${PXE_ADMIN_USER} ${PXE_ADMIN_PASSWORD_HASH} ${PXE_SSH_ALLOW_PW} ${PXE_SSH_PUBLIC_KEY} ${PXE_PACKAGE_UPGRADE} ${PXE_SHUTDOWN_MODE} ${PXE_BASE_URL} ${PXE_DISK_MATCH} ${PXE_EARLY_COMMANDS}' \
  < "${SCRIPT_DIR}/autoinstall/user-data-net.tmpl" > "${HTTP_DIR}/nocloud/user-data"

# instance-id muss vorhanden sein; ohne sie haelt cloud-init den Seed fuer
# unvollstaendig und faellt auf interaktiv zurueck.
printf 'instance-id: cluster-node\nlocal-hostname: %s\n' "$HOSTNAME_FALLBACK" \
  > "${HTTP_DIR}/nocloud/meta-data"
: > "${HTTP_DIR}/nocloud/vendor-data"

# Helfer aus dem USB-Weg wiederverwenden — sie sind dort getestet.
install -m 0644 "${PROJECT_DIR}/scripts/iso/autoinstall/assign-identity.sh" \
  "${HTTP_DIR}/assets/assign-identity.sh"
sed "s|__K3S_VERSION__|${K3S_VERSION}|g" \
  "${PROJECT_DIR}/scripts/iso/autoinstall/k3s-join.sh" > "${HTTP_DIR}/assets/k3s-join.sh"
chmod 0644 "${HTTP_DIR}/assets/k3s-join.sh"

if [[ -n "$NODE_MAP" ]]; then
  install -m 0644 "$NODE_MAP" "${HTTP_DIR}/assets/node-map"
  info "node-map: $(grep -cvE '^\s*(#|$)' "$NODE_MAP") Eintraege"
else
  printf '# leer — Hostnamen werden aus der MAC abgeleitet (ws-<mac-suffix>)\n' \
    > "${HTTP_DIR}/assets/node-map"
  echo "WARN: keine --node-map — die Nodes heissen ws-<mac-suffix>." >&2
fi

# --- dnsmasq-Konfiguration --------------------------------------------------
DNSMASQ_CONF="${ROOT_DIR}/dnsmasq.conf"
cat > "$DNSMASQ_CONF" <<EOF
# Generiert von scripts/pxe/setup-pxe.sh — Aenderungen gehen beim naechsten
# Lauf verloren.

# KEIN DNS: Port 0 schaltet den DNS-Teil ab. dnsmasq ist hier ausschliesslich
# Proxy-DHCP und TFTP-Server; ein zweiter DNS im Netz waere unerwuenscht.
port=0

interface=${IFACE}
# bind-dynamic statt bind-interfaces: ein DHCP-Server bindet sonst den
# Wildcard-Socket 0.0.0.0:67, um Broadcasts zu sehen. Unter WSL mit
# networkingMode=mirrored teilt sich Linux den Netzwerkstack mit Windows, und
# dort haelt der Hyper-V-eigene DHCP (auf der vEthernet-Adresse) Port 67
# bereits — der Start scheiterte mit "Address already in use".
# bind-dynamic bindet nur an die Adressen des genannten Interfaces.
bind-dynamic

# Proxy-DHCP: beantwortet nur die Boot-Frage, vergibt KEINE Adressen. Der
# vorhandene Router bleibt fuer DHCP zustaendig. Ein zweiter vollwertiger
# DHCP-Server wuerde im selben Netz mit ihm konkurrieren.
dhcp-range=${SERVER_IP},proxy

# Client-Architektur unterscheiden: dieselbe Boot-Frage bekommt je nach
# Firmware eine andere Antwort. Ohne die Fallunterscheidung bekaeme ein
# UEFI-Client die BIOS-Datei und braeche mit einer nichtssagenden Meldung ab.
dhcp-match=set:efi-x86_64,option:client-arch,7
dhcp-match=set:efi-bc,option:client-arch,9
dhcp-boot=tag:efi-x86_64,bootx64.efi,,${SERVER_IP}
dhcp-boot=tag:efi-bc,bootx64.efi,,${SERVER_IP}

enable-tftp
tftp-root=${TFTP_DIR}
# Die Blockgroessen-Aushandlung (RFC 2348) bleibt AN — sie ist Standard und
# der Grund, warum die ~80 MB grosse initrd in ertraeglicher Zeit ankommt.
# tftp-no-blocksize wuerde sie abschalten; die Option gehoert hier NICHT hin.
log-dhcp
EOF

# --- Dienste starten --------------------------------------------------------
stop_services

info "Starte HTTP-Server auf ${SERVER_IP}:${HTTP_PORT}"
# setsid plus alle drei Deskriptoren umleiten: ohne das bleibt der Server ein
# Kind dieser Shell und haelt sie am Leben — das Skript kehrte dann nie zurueck,
# obwohl der Dienst laengst lief.
setsid python3 -m http.server "$HTTP_PORT" --bind 0.0.0.0 --directory "$HTTP_DIR" \
  < /dev/null > "${ROOT_DIR}/http.log" 2>&1 &
echo $! > "$PIDFILE_HTTP"
disown 2>/dev/null || true

sleep 1
curl -fsS -o /dev/null "${BASE_URL}/nocloud/user-data" \
  || die "HTTP-Server antwortet nicht auf ${BASE_URL}/nocloud/user-data (siehe ${ROOT_DIR}/http.log)"
info "HTTP laeuft"

if [[ "$FOREGROUND" -eq 1 ]]; then
  info "dnsmasq im Vordergrund — Abbruch mit Strg-C"
  exec dnsmasq --conf-file="$DNSMASQ_CONF" --no-daemon --log-queries
fi

# Port 67 vorher pruefen und die Ursache benennen. Ein belegter Port ist hier
# der Regelfall, nicht die Ausnahme: unter WSL mit networkingMode=mirrored
# haelt ihn der Windows-eigene DHCP. dnsmasqs eigene Meldung
# ("failed to bind DHCP server socket") nennt weder den Halter noch den
# Ausweg, und PXE ist ohne Proxy-DHCP nicht automatisch tot — der
# HTTP-Boot-Weg funktioniert weiter.
DHCP_OK=0
if python3 - <<'PY' 2>/dev/null
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(("0.0.0.0", 67))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
then
  info "Starte dnsmasq (Proxy-DHCP + TFTP)"
  if dnsmasq --conf-file="$DNSMASQ_CONF" --pid-file="$PIDFILE_DNSMASQ" 2>&1; then
    sleep 1
    if kill -0 "$(cat "$PIDFILE_DNSMASQ" 2>/dev/null || echo 0)" 2>/dev/null; then
      DHCP_OK=1
    else
      echo "WARN: dnsmasq lief an und ist wieder weg — mit --foreground nachsehen." >&2
    fi
  else
    echo "WARN: dnsmasq startete nicht — mit --foreground nachsehen." >&2
  fi
else
  # Das abschliessende "|| true" ist noetig, nicht kosmetisch: schlaegt
  # command -v fehl (unter sudo fehlt der Windows-PATH), erbt die Zuweisung
  # dessen Exit-Status 1 und set -e beendet das Skript mitten in der
  # Fehlermeldung — der Lauf brach dann kommentarlos ab.
  PORT67_HOLDER="$( { command -v netstat.exe >/dev/null 2>&1 \
    && netstat.exe -ano -p UDP 2>/dev/null | tr -d '\r' \
       | awk '$2 ~ /:67$/ {print $2" (Windows-PID "$NF")"}' | head -1; } || true )"
  cat >&2 <<EOF

WARN: UDP-Port 67 ist belegt${PORT67_HOLDER:+ von ${PORT67_HOLDER}} — Proxy-DHCP faellt aus.
      Unter WSL (networkingMode=mirrored) teilt Linux den Netzwerkstack mit
      Windows; dort haelt der Hyper-V-DHCP den Port. Von Linux aus ist daran
      nichts zu aendern.

      Es bleibt der HTTP-Boot-Weg (siehe unten) — der braucht kein DHCP.
      Wer den automatischen Netzwerk-Boot will, stoppt in einer Windows-Shell
      mit Administratorrechten den Dienst und startet dieses Skript neu:
          Stop-Service SharedAccess
      Rueckgaengig:  Start-Service SharedAccess
      Achtung: das schaltet die gemeinsame Internetverbindung ab und kann
      Docker Desktop und Hyper-V-VMs betreffen.
EOF
fi

cat >&2 <<EOF

Boot-Server laeuft.
  Interface:   ${IFACE} (${SERVER_IP})
  HTTP:        ${BASE_URL}
  Proxy-DHCP:  $([[ "$DHCP_OK" -eq 1 ]] && echo "aktiv (TFTP ${TFTP_DIR})" || echo "AUS — Port 67 belegt, siehe oben")
  Boot-Baum:   $(du -sh "$ROOT_DIR" 2>/dev/null | awk '{print $1}')
  Admin:       ${ADMIN_USER} (Passwort-Login: $([[ -n "$ADMIN_PASSWORD" ]] && echo an || echo gesperrt))
  k3s-Join:    /usr/local/sbin/k3s-join.sh (${K3S_VERSION})

Secure Boot kann in beiden Faellen anbleiben: shim, grub und Kernel sind
Ubuntus Originale und signiert. Genau das ist der Unterschied zum
umgepackten USB-Stick.

EOF

if [[ "$DHCP_OK" -eq 1 ]]; then
  cat >&2 <<EOF
Weg A — automatischer Netzwerk-Boot (Proxy-DHCP laeuft):
  An der Workstation im Bootmenue "Network Boot" / "PXE over IPv4" waehlen.
  Mehr ist nicht noetig.

EOF
fi

cat >&2 <<EOF
Weg B — UEFI-HTTP-Boot (ohne DHCP-Eingriff):
  Im UEFI-Setup der Workstation "HTTP Boot" aktivieren und als Boot-URL
  eintragen:

      ${BASE_URL}/boot/bootx64.efi

  Der Eintrag heisst je nach Hersteller "HTTP Boot URI", "Boot from URL"
  oder liegt unter "Network Stack Configuration".

WICHTIG: nach der Installation faehrt die Maschine herunter (--shutdown
${SHUTDOWN_MODE}). Steht die Boot-Reihenfolge noch auf Netzwerk, wuerde sie
sich sonst endlos neu installieren.

Beenden:  sudo bash scripts/pxe/setup-pxe.sh --stop
Zustand:  sudo bash scripts/pxe/setup-pxe.sh --status
Log:      ${ROOT_DIR}/http.log
EOF
