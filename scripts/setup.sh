#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup.sh — Homeoffice MVP: Setup, Check, Quickstart, Firewall, SMB
# ═══════════════════════════════════════════════════════════════════
#
# Hauptmodi:
#   ./scripts/setup.sh              # Interaktiv: fragt bei Problemen
#   ./scripts/setup.sh --check      # Nur prüfen, nichts ändern
#   ./scripts/setup.sh --fix        # Probleme automatisch beheben
#   ./scripts/setup.sh --quickstart # Alles: Deps, .env, Secrets, Start
#
# Sub-Befehle:
#   ./scripts/setup.sh firewall setup|remove|status
#   sudo ./scripts/setup.sh smb [--check]
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${COMPOSE_DIR}/.env"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"

# ── Farben ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; WARN=0; FAIL=0
FIX_MODE=false
CHECK_ONLY=false
QUICKSTART=false

# ── Hilfsfunktionen ─────────────────────────────────────────────────
ok()   { echo -e "  ${GREEN}✓${NC} $*"; ((PASS++)) || true; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; ((WARN++)) || true; }
fail() { echo -e "  ${RED}✗${NC} $*"; ((FAIL++)) || true; }
info() { echo -e "  ${BLUE}→${NC} $*"; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}▶ $*${NC}"
  echo -e "${CYAN}$(printf '─%.0s' $(seq 1 $((${#1}+2))))${NC}"
}
ask() {
  $CHECK_ONLY && return 1
  echo -en "  ${YELLOW}▶${NC} $* [j/N] "
  read -r answer
  [[ "${answer,,}" == "j" ]]
}
sed_inplace() {
  if [[ "$OSTYPE" == "darwin"* ]]; then sed -i '' "$@"; else sed -i "$@"; fi
}
gen_secret() { openssl rand -base64 32 | tr -d '/+=' | head -c 32; }

# ═════════════════════════════════════════════════════════════════════
#  SUB-BEFEHL: firewall
# ═════════════════════════════════════════════════════════════════════
FIREWALL_RULES=(
  "80/tcp|Homeoffice MVP HTTP"
  "443/tcp|Homeoffice MVP HTTPS"
  "10000/udp|Homeoffice MVP Jitsi JVB"
)

firewall_require_root() {
  if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Fehler: Root-Rechte erforderlich.${NC}" >&2
    echo "  sudo $0 firewall $*" >&2
    exit 1
  fi
}

firewall_require_ufw() {
  if ! command -v ufw &>/dev/null; then
    echo -e "${RED}Fehler: ufw ist nicht installiert.${NC}" >&2
    echo "  sudo apt install ufw" >&2
    exit 1
  fi
}

firewall_setup() {
  firewall_require_root "$@"
  firewall_require_ufw
  echo "Firewall-Regeln anlegen ..."
  for entry in "${FIREWALL_RULES[@]}"; do
    local port="${entry%%|*}" comment="${entry##*|}"
    if ufw status | grep -q "$port.*ALLOW"; then
      echo -e "  ${GREEN}✓${NC} $port bereits erlaubt"
    else
      ufw allow "$port" comment "$comment"
      echo -e "  ${YELLOW}+${NC} $port erlaubt ($comment)"
    fi
  done
  if ! ufw status | grep -q "Status: active"; then
    echo ""
    echo "UFW ist inaktiv — aktiviere ..."
    ufw --force enable
  fi
  echo ""
  echo "Fertig. Aktueller Status:"
  ufw status verbose
}

firewall_remove() {
  firewall_require_root "$@"
  firewall_require_ufw
  echo "Firewall-Regeln entfernen ..."
  for entry in "${FIREWALL_RULES[@]}"; do
    local port="${entry%%|*}" comment="${entry##*|}"
    if ufw status | grep -q "$port.*ALLOW"; then
      ufw delete allow "$port"
      echo -e "  ${YELLOW}-${NC} $port entfernt ($comment)"
    else
      echo -e "  ${GREEN}✓${NC} $port war nicht vorhanden"
    fi
  done
  echo ""
  ufw status verbose
}

firewall_status() {
  if ! command -v ufw &>/dev/null; then
    echo "ufw nicht installiert — überspringe"
    return 0
  fi
  echo "Homeoffice MVP Firewall-Regeln:"
  echo ""
  for entry in "${FIREWALL_RULES[@]}"; do
    local port="${entry%%|*}" comment="${entry##*|}"
    if ufw status 2>/dev/null | grep -q "$port.*ALLOW" || \
       sudo ufw status 2>/dev/null | grep -q "$port.*ALLOW"; then
      echo -e "  ${GREEN}✓${NC} $port  erlaubt  ($comment)"
    else
      echo -e "  ${RED}✗${NC} $port  NICHT erlaubt  ($comment)"
    fi
  done
}

# ═════════════════════════════════════════════════════════════════════
#  SUB-BEFEHL: smb
# ═════════════════════════════════════════════════════════════════════
smb_setup() {
  local smb_check_only=false
  for a in "$@"; do [[ "$a" == "--check" ]] && smb_check_only=true; done

  # Root prüfen
  if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Fehler: Root-Rechte erforderlich.${NC}" >&2
    echo "  sudo $0 smb $*" >&2
    exit 1
  fi

  # .env laden
  header "SMB-Konfiguration aus .env"
  if [[ ! -f "$ENV_FILE" ]]; then
    fail ".env nicht gefunden: $ENV_FILE"
    exit 1
  fi

  local SMB_HOST SMB_SHARE SMB_USER SMB_PASS SMB_PORT SMB_DOMAIN SMB_REMOTE_PATH
  SMB_HOST=$(grep -E '^SMB_HOST=' "$ENV_FILE" | cut -d= -f2- | xargs)
  SMB_SHARE=$(grep -E '^SMB_SHARE=' "$ENV_FILE" | cut -d= -f2- | xargs)
  SMB_USER=$(grep -E '^SMB_USER=' "$ENV_FILE" | cut -d= -f2- | xargs)
  SMB_PASS=$(grep -E '^SMB_PASS=' "$ENV_FILE" | cut -d= -f2- | xargs)
  SMB_PORT=$(grep -E '^SMB_PORT=' "$ENV_FILE" | cut -d= -f2- | xargs)
  SMB_DOMAIN=$(grep -E '^SMB_DOMAIN=' "$ENV_FILE" | cut -d= -f2- | xargs)
  SMB_REMOTE_PATH=$(grep -E '^SMB_REMOTE_PATH=' "$ENV_FILE" | cut -d= -f2- | xargs)

  local MISSING=()
  [[ -z "${SMB_HOST:-}" ]]  && MISSING+=("SMB_HOST")
  [[ -z "${SMB_SHARE:-}" ]] && MISSING+=("SMB_SHARE")
  [[ -z "${SMB_USER:-}" ]]  && MISSING+=("SMB_USER")
  [[ -z "${SMB_PASS:-}" ]]  && MISSING+=("SMB_PASS")

  if [[ ${#MISSING[@]} -gt 0 ]]; then
    fail "Fehlende SMB-Variablen in .env: ${MISSING[*]}"
    exit 1
  fi

  ok "SMB_HOST    = $SMB_HOST"
  ok "SMB_SHARE   = $SMB_SHARE"
  ok "SMB_USER    = $SMB_USER"
  ok "SMB_PORT    = ${SMB_PORT:-445}"
  ok "SMB_DOMAIN  = ${SMB_DOMAIN:-WORKGROUP}"
  info "SMB_PASS    = ******** (geladen)"

  # Share bereits vorhanden?
  header "SMB-Share prüfen"
  local SHARE_EXISTS=false

  if testparm -s 2>/dev/null | grep -q "^\[${SMB_SHARE}\]"; then
    ok "Share [${SMB_SHARE}] in smb.conf gefunden"
    SHARE_EXISTS=true
  else
    warn "Share [${SMB_SHARE}] nicht in smb.conf konfiguriert"
  fi

  if command -v smbclient &>/dev/null; then
    if smbclient -L "//${SMB_HOST}" -U "${SMB_USER}%${SMB_PASS}" -p "${SMB_PORT:-445}" 2>/dev/null \
       | grep -qi "${SMB_SHARE}"; then
      ok "Share [${SMB_SHARE}] auf ${SMB_HOST} erreichbar"
      SHARE_EXISTS=true
    else
      warn "Share [${SMB_SHARE}] auf ${SMB_HOST} nicht erreichbar"
    fi
  else
    info "smbclient nicht installiert — überspringe Netzwerktest"
  fi

  if $SHARE_EXISTS; then
    ok "SMB-Share existiert bereits — nichts zu tun"
    info "Mounten: sudo mount -t cifs //${SMB_HOST}/${SMB_SHARE} /mnt/${SMB_SHARE} -o username=${SMB_USER}"
    exit 0
  fi

  # Verfügbare Laufwerke
  header "Verfügbare Laufwerke"
  echo ""
  echo -e "  ${BOLD}Alle erkannten Block-Geräte:${NC}"
  echo ""

  parse_lsblk_field() {
    echo "$1" | grep -oP "${2}=\"[^\"]*\"" | sed "s/${2}=\"//;s/\"$//"
  }

  local ROOT_DISKS=()
  while IFS= read -r line; do
    local disk_name disk_type
    disk_name=$(parse_lsblk_field "$line" "NAME")
    disk_type=$(parse_lsblk_field "$line" "TYPE")
    [[ "$disk_type" != "disk" ]] && continue
    local has_mount
    has_mount=$(lsblk -n -o MOUNTPOINT "/dev/${disk_name}" 2>/dev/null | grep -v '^$' | head -1 || true)
    [[ -n "$has_mount" ]] && ROOT_DISKS+=("$disk_name")
  done < <(lsblk -P -o NAME,TYPE 2>/dev/null)
  info "Systemlaufwerke erkannt: ${ROOT_DISKS[*]} (werden geschützt)"

  declare -A CHOICES CHOICE_TRAN
  local IDX=0

  echo -e "  ${BOLD}Nr  Gerät              Größe   Typ    FS         Transport  Modell${NC}"
  echo -e "  ${CYAN}──  ─────────────────  ──────  ─────  ─────────  ─────────  ──────────────────${NC}"

  while IFS= read -r line; do
    local D_NAME D_SIZE D_TYPE D_FSTYPE D_MOUNTPOINT D_TRAN D_MODEL
    D_NAME=$(parse_lsblk_field "$line" "NAME")
    D_SIZE=$(parse_lsblk_field "$line" "SIZE")
    D_TYPE=$(parse_lsblk_field "$line" "TYPE")
    D_FSTYPE=$(parse_lsblk_field "$line" "FSTYPE")
    D_MOUNTPOINT=$(parse_lsblk_field "$line" "MOUNTPOINT")
    D_TRAN=$(parse_lsblk_field "$line" "TRAN")
    D_MODEL=$(parse_lsblk_field "$line" "MODEL")

    [[ "$D_TYPE" == "loop" || "$D_TYPE" == "lvm" ]] && continue
    [[ -n "$D_MOUNTPOINT" ]] && continue

    local BASE_DISK
    BASE_DISK=$(lsblk -n -o PKNAME "/dev/${D_NAME}" 2>/dev/null | head -1 | xargs)
    [[ -z "$BASE_DISK" ]] && BASE_DISK="$D_NAME"
    local SKIP=false
    for rd in "${ROOT_DISKS[@]}"; do
      [[ "$BASE_DISK" == "$rd" || "$D_NAME" == "$rd" ]] && SKIP=true && break
    done
    $SKIP && continue

    if [[ "$D_TYPE" == "disk" || "$D_TYPE" == "part" ]]; then
      ((IDX++)) || true
      CHOICES[$IDX]="/dev/${D_NAME}"

      local TRAN="${D_TRAN}"
      if [[ -z "$TRAN" && "$D_TYPE" == "part" ]]; then
        local PARENT
        PARENT=$(lsblk -n -o PKNAME "/dev/${D_NAME}" 2>/dev/null | head -1 | xargs)
        [[ -n "$PARENT" ]] && TRAN=$(lsblk -n -o TRAN "/dev/${PARENT}" 2>/dev/null | head -1 | xargs)
      fi
      CHOICE_TRAN[$IDX]="$TRAN"

      local TRAN_LABEL="${TRAN:-—}"
      [[ "$TRAN" == "usb" ]]  && TRAN_LABEL="${GREEN}USB${NC}"
      [[ "$TRAN" == "nvme" ]] && TRAN_LABEL="${BLUE}NVMe${NC}"
      [[ "$TRAN" == "sata" ]] && TRAN_LABEL="${YELLOW}SATA${NC}"

      local MODEL
      MODEL=$(echo "${D_MODEL}" | sed 's/\\x20/ /g')

      printf "  %-3s %-18s %-7s %-6s %-10s %-9b  %s\n" \
        "$IDX" "/dev/${D_NAME}" "$D_SIZE" "$D_TYPE" \
        "${D_FSTYPE:----}" "$TRAN_LABEL" "${MODEL:----}"
    fi
  done < <(lsblk -P -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,TRAN,MODEL 2>/dev/null)

  echo ""

  if [[ $IDX -eq 0 ]]; then
    fail "Keine verfügbaren (ungemounteten) Laufwerke gefunden"
    exit 1
  fi

  if $smb_check_only; then
    info "Check-Modus: $IDX verfügbare(s) Laufwerk(e) gefunden"
    info "Starte ohne --check um ein Laufwerk auszuwählen"
    exit 0
  fi

  # Laufwerk auswählen
  header "Laufwerk auswählen"
  echo -en "  ${YELLOW}▶${NC} Welches Laufwerk für den Share [${SMB_SHARE}]? [1-${IDX}] "
  read -r CHOICE

  if [[ -z "${CHOICES[$CHOICE]+_}" ]]; then
    fail "Ungültige Auswahl: $CHOICE"
    exit 1
  fi

  local SELECTED_DEV="${CHOICES[$CHOICE]}"
  ok "Ausgewählt: ${SELECTED_DEV}"
  local SELECTED_TYPE SELECTED_SIZE
  SELECTED_TYPE=$(lsblk -n -o TYPE "$SELECTED_DEV" 2>/dev/null)
  SELECTED_SIZE=$(lsblk -n -o SIZE "$SELECTED_DEV" 2>/dev/null | xargs)

  # Dateisystem wählen
  header "Dateisystem wählen"
  echo -e "  ${BOLD}Verfügbare Dateisysteme:${NC}"
  echo ""
  echo -e "  ${GREEN}1${NC}  ext4   — Standard Linux-FS, stabil"
  echo -e "  ${GREEN}2${NC}  xfs    — Performant bei großen Dateien"
  echo -e "  ${GREEN}3${NC}  btrfs  — Snapshots & Kompression"
  echo -e "  ${GREEN}4${NC}  ntfs   — Windows-kompatibel"
  echo -e "  ${GREEN}5${NC}  exfat  — Plattformübergreifend"
  echo ""
  echo -en "  ${YELLOW}▶${NC} Welches Dateisystem? [1-5, Standard=1/ext4] "
  read -r FS_CHOICE

  local FS_TYPE MKFS_CMD
  case "${FS_CHOICE:-1}" in
    1) FS_TYPE="ext4";  MKFS_CMD="mkfs.ext4 -F" ;;
    2) FS_TYPE="xfs";   MKFS_CMD="mkfs.xfs -f" ;;
    3) FS_TYPE="btrfs"; MKFS_CMD="mkfs.btrfs -f" ;;
    4) FS_TYPE="ntfs";  MKFS_CMD="mkfs.ntfs -Q" ;;
    5) FS_TYPE="exfat"; MKFS_CMD="mkfs.exfat" ;;
    *) fail "Ungültige Auswahl: $FS_CHOICE"; exit 1 ;;
  esac
  ok "Dateisystem: ${FS_TYPE}"

  local MKFS_BIN
  MKFS_BIN=$(echo "$MKFS_CMD" | awk '{print $1}')
  if ! command -v "$MKFS_BIN" &>/dev/null; then
    fail "${MKFS_BIN} nicht installiert"
    case "$FS_TYPE" in
      ntfs)  info "sudo apt install ntfs-3g" ;;
      exfat) info "sudo apt install exfatprogs" ;;
      btrfs) info "sudo apt install btrfs-progs" ;;
      xfs)   info "sudo apt install xfsprogs" ;;
      *)     info "sudo apt install e2fsprogs" ;;
    esac
    exit 1
  fi

  # Partitionierung (falls ganzes Disk)
  local TARGET_PART="$SELECTED_DEV"
  if [[ "$SELECTED_TYPE" == "disk" ]]; then
    header "Partitionierung"
    warn "Ganzes Laufwerk gewählt: ${SELECTED_DEV} (${SELECTED_SIZE})"
    warn "Alle Daten auf diesem Laufwerk werden gelöscht!"
    echo ""
    if ! ask "Laufwerk ${SELECTED_DEV} partitionieren? ALLE DATEN GEHEN VERLOREN!"; then
      fail "Abgebrochen"; exit 1
    fi
    info "Partitioniere ${SELECTED_DEV}..."
    parted -s "$SELECTED_DEV" mklabel gpt
    parted -s "$SELECTED_DEV" mkpart primary 0% 100%
    partprobe "$SELECTED_DEV"
    sleep 1
    if [[ "$SELECTED_DEV" =~ nvme ]]; then
      TARGET_PART="${SELECTED_DEV}p1"
    else
      TARGET_PART="${SELECTED_DEV}1"
    fi
    ok "Partition erstellt: ${TARGET_PART}"
  fi

  # Formatierung
  header "Formatierung"
  local EXISTING_FS
  EXISTING_FS=$(lsblk -n -o FSTYPE "$TARGET_PART" 2>/dev/null | xargs)
  [[ -n "$EXISTING_FS" ]] && warn "${TARGET_PART} hat bereits ein Dateisystem: ${EXISTING_FS}"
  echo ""
  echo -e "  ${RED}${BOLD}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "  ${RED}${BOLD}║  WARNUNG: ${TARGET_PART} wird mit ${FS_TYPE} formatiert!  ║${NC}"
  echo -e "  ${RED}${BOLD}║  Alle Daten auf dieser Partition gehen verloren! ║${NC}"
  echo -e "  ${RED}${BOLD}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  if ! ask "Partition ${TARGET_PART} jetzt formatieren?"; then
    fail "Abgebrochen"; exit 1
  fi
  info "Formatiere ${TARGET_PART} als ${FS_TYPE}..."
  $MKFS_CMD "$TARGET_PART"
  ok "Formatierung abgeschlossen"

  # Mounten
  header "Mounten"
  local MOUNT_POINT="/mnt/${SMB_SHARE}"
  mkdir -p "$MOUNT_POINT"
  mountpoint -q "$MOUNT_POINT" 2>/dev/null && umount "$MOUNT_POINT"
  mount "$TARGET_PART" "$MOUNT_POINT"
  ok "Gemountet: ${TARGET_PART} → ${MOUNT_POINT}"
  [[ -n "${SMB_REMOTE_PATH:-}" ]] && mkdir -p "${MOUNT_POINT}/${SMB_REMOTE_PATH}" && \
    ok "Unterverzeichnis: ${MOUNT_POINT}/${SMB_REMOTE_PATH}"
  chown -R "${SMB_USER}:${SMB_USER}" "$MOUNT_POINT"
  ok "Besitzer gesetzt: ${SMB_USER}"

  # fstab
  header "fstab konfigurieren"
  local PART_UUID FSTAB_SRC
  PART_UUID=$(blkid -s UUID -o value "$TARGET_PART")
  if [[ -z "$PART_UUID" ]]; then
    warn "UUID nicht ermittelbar — verwende Device-Pfad"
    FSTAB_SRC="$TARGET_PART"
  else
    FSTAB_SRC="UUID=${PART_UUID}"
    ok "UUID: ${PART_UUID}"
  fi
  if grep -q "${MOUNT_POINT}" /etc/fstab; then
    warn "fstab enthält bereits einen Eintrag für ${MOUNT_POINT}"
  else
    local MOUNT_OPTS
    case "$FS_TYPE" in
      ntfs|exfat) MOUNT_OPTS="defaults,uid=${SMB_USER},gid=${SMB_USER},nofail,x-systemd.device-timeout=10" ;;
      *)          MOUNT_OPTS="defaults,nofail,x-systemd.device-timeout=10" ;;
    esac
    local FSTAB_LINE="${FSTAB_SRC} ${MOUNT_POINT} ${FS_TYPE} ${MOUNT_OPTS} 0 0"
    echo "" >> /etc/fstab
    echo "# SMB-Share Backup-Laufwerk (homeoffice-mvp)" >> /etc/fstab
    echo "${FSTAB_LINE}" >> /etc/fstab
    ok "fstab-Eintrag: ${FSTAB_LINE}"
  fi

  # Samba konfigurieren
  header "Samba-Share konfigurieren"
  local SMB_CONF="/etc/samba/smb.conf"
  if testparm -s 2>/dev/null | grep -q "^\[${SMB_SHARE}\]"; then
    warn "Share [${SMB_SHARE}] existiert bereits in smb.conf"
  else
    cat >> "$SMB_CONF" << SAMBA

[${SMB_SHARE}]
   comment = Homeoffice MVP Backup Storage
   path = ${MOUNT_POINT}
   browseable = yes
   read only = no
   valid users = ${SMB_USER}
   force user = ${SMB_USER}
   force group = ${SMB_USER}
   create mask = 0664
   directory mask = 0775
SAMBA
    ok "Share [${SMB_SHARE}] zu smb.conf hinzugefügt"
  fi
  echo -e "${SMB_PASS}\n${SMB_PASS}" | smbpasswd -s -a "$SMB_USER" 2>/dev/null
  ok "Samba-Passwort für ${SMB_USER} gesetzt"
  systemctl restart smbd nmbd 2>/dev/null || true
  ok "Samba-Dienste neugestartet"

  # Validierung
  header "Validierung"
  testparm -s 2>/dev/null | grep -q "^\[${SMB_SHARE}\]" && \
    ok "Share in Samba validiert" || fail "Share nicht in Samba-Konfiguration"
  mountpoint -q "$MOUNT_POINT" 2>/dev/null && {
    ok "Mountpoint ${MOUNT_POINT} aktiv"
    local AVAIL; AVAIL=$(df -h "$MOUNT_POINT" | tail -1 | awk '{print $4}')
    info "Verfügbarer Speicher: ${AVAIL}"
  } || fail "Mountpoint nicht aktiv"
  if command -v smbclient &>/dev/null; then
    smbclient "//${SMB_HOST}/${SMB_SHARE}" -U "${SMB_USER}%${SMB_PASS}" -c "ls" &>/dev/null && \
      ok "SMB-Verbindung OK: //${SMB_HOST}/${SMB_SHARE}" || \
      warn "SMB-Verbindung fehlgeschlagen — Firewall prüfen (Port ${SMB_PORT:-445})"
  fi

  # Zusammenfassung
  header "Fertig!"
  echo ""
  echo -e "  ${GREEN}${BOLD}SMB-Share [${SMB_SHARE}] erfolgreich eingerichtet:${NC}"
  echo ""
  echo -e "  ${BOLD}Laufwerk:${NC}      ${TARGET_PART}"
  echo -e "  ${BOLD}Dateisystem:${NC}   ${FS_TYPE}"
  echo -e "  ${BOLD}Mount-Point:${NC}   ${MOUNT_POINT}"
  echo -e "  ${BOLD}SMB-Pfad:${NC}      //${SMB_HOST}/${SMB_SHARE}"
  echo -e "  ${BOLD}Benutzer:${NC}      ${SMB_USER}"
  echo ""
  echo -e "  ${BLUE}Zugriff:${NC}"
  echo -e "    Linux:   ${CYAN}mount -t cifs //${SMB_HOST}/${SMB_SHARE} /mnt/backup -o username=${SMB_USER}${NC}"
  echo -e "    Windows: ${CYAN}\\\\\\\\${SMB_HOST}\\\\${SMB_SHARE}${NC}"
  echo -e "    macOS:   ${CYAN}smb://${SMB_HOST}/${SMB_SHARE}${NC}"
  exit 0
}

# ═════════════════════════════════════════════════════════════════════
#  Sub-Befehl-Routing (vor Flag-Parsing)
# ═════════════════════════════════════════════════════════════════════
case "${1:-}" in
  firewall)
    shift
    case "${1:-}" in
      setup)  firewall_setup "$@" ;;
      remove) firewall_remove "$@" ;;
      status) firewall_status ;;
      *)
        echo "Verwendung: $0 firewall {setup|remove|status}"
        echo "  setup   — Ports 80/tcp, 443/tcp, 10000/udp freigeben (UFW)"
        echo "  remove  — Regeln entfernen"
        echo "  status  — Aktuelle Regeln anzeigen"
        exit 1 ;;
    esac
    exit $? ;;
  smb)
    shift
    smb_setup "$@" ;;
esac

# ═════════════════════════════════════════════════════════════════════
#  Flag-Parsing (Hauptmodus)
# ═════════════════════════════════════════════════════════════════════
for arg in "$@"; do
  case "$arg" in
    --fix)        FIX_MODE=true ;;
    --check)      CHECK_ONLY=true ;;
    --quickstart) QUICKSTART=true; FIX_MODE=true ;;
    -h|--help)
      echo "Verwendung: $0 [--fix|--check|--quickstart]"
      echo "           $0 firewall {setup|remove|status}"
      echo "           $0 smb [--check]"
      echo ""
      echo "  --fix        Probleme automatisch beheben"
      echo "  --check      Nur prüfen, keine Änderungen"
      echo "  --quickstart Alles: Deps, .env, Secrets, Firewall, Start"
      exit 0 ;;
  esac
done

# ═════════════════════════════════════════════════════════════════════
#  HAUPTPROGRAMM
# ═════════════════════════════════════════════════════════════════════

if $QUICKSTART; then
  echo -e "${BOLD}"
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║   Homeoffice MVP — Schnellstart              ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo -e "${NC}"
fi

# ── 1. OS erkennen ──────────────────────────────────────────────────
header "Betriebssystem"

OS_TYPE="linux"
if [[ -n "${WSL_DISTRO_NAME:-}" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
  OS_TYPE="wsl"
  ok "WSL2 erkannt (${WSL_DISTRO_NAME:-unknown})"
  info "Docker Desktop für Windows muss installiert + WSL-Integration aktiviert sein"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS_TYPE="macos"
  ok "macOS erkannt"
  info "Docker Desktop für Mac muss installiert sein"
else
  ok "Linux erkannt ($(uname -r))"
fi

# ── 2. Abhängigkeiten (nur --quickstart) ────────────────────────────
if $QUICKSTART; then
  header "Abhängigkeiten"

  install_if_missing() {
    local cmd="$1" pkg="${2:-$1}"
    if command -v "$cmd" &>/dev/null; then
      ok "$cmd gefunden"
    else
      warn "$cmd nicht gefunden — installiere $pkg..."
      if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq "$pkg"
      elif command -v dnf &>/dev/null; then
        sudo dnf install -y -q "$pkg"
      elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm "$pkg"
      else
        fail "Kein unterstützter Paketmanager. Bitte $pkg manuell installieren."
        exit 1
      fi
      ok "$cmd installiert"
    fi
  }

  install_if_missing curl
  install_if_missing openssl
  install_if_missing git
  install_if_missing jq
fi

# ── 3. Docker ───────────────────────────────────────────────────────
header "Docker"

if command -v docker &>/dev/null; then
  DOCKER_VERSION=$(docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
  ok "Docker gefunden: v${DOCKER_VERSION}"
else
  fail "Docker nicht gefunden"
  if $QUICKSTART || $FIX_MODE; then
    if [[ "$OS_TYPE" == "wsl" ]]; then
      echo -e "\n  ${YELLOW}WSL2: Bitte Docker Desktop für Windows installieren:${NC}"
      echo -e "  ${CYAN}https://docs.docker.com/desktop/install/windows-install/${NC}\n"
      echo -e "  Danach: Docker Desktop → Settings → Resources → WSL Integration aktivieren"
      exit 1
    elif [[ "$OS_TYPE" == "linux" ]]; then
      info "Installiere Docker..."
      curl -fsSL https://get.docker.com | sh
      sudo systemctl enable --now docker
      sudo usermod -aG docker "$USER"
      ok "Docker installiert"
      warn "Bitte neu einloggen (oder 'newgrp docker'), dann Script erneut starten."
      exit 0
    fi
  else
    info "Installation: https://docs.docker.com/engine/install/"
  fi
fi

if command -v docker &>/dev/null; then
  if docker info &>/dev/null 2>&1; then
    ok "Docker Daemon läuft"
  else
    fail "Docker Daemon nicht erreichbar"
    if [[ "$OS_TYPE" == "wsl" ]]; then
      echo -e "  ${YELLOW}Docker Desktop starten und WSL-Integration prüfen.${NC}"
      $QUICKSTART && exit 1
    elif [[ "$OS_TYPE" == "linux" ]]; then
      info "Starten mit: sudo systemctl start docker"
      if ($FIX_MODE || $QUICKSTART) && { $QUICKSTART || ask "Docker jetzt starten?"; }; then
        sudo systemctl start docker && ok "Docker gestartet" || {
          fail "Konnte Docker nicht starten"; $QUICKSTART && exit 1
        }
      fi
    elif [[ "$OS_TYPE" == "macos" ]]; then
      info "Docker Desktop starten"
    fi
  fi
fi

# ── 4. Docker Compose v2 ───────────────────────────────────────────
header "Docker Compose"

COMPOSE_CMD=""
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || docker compose version | grep -oP '\d+\.\d+\.\d+' | head -1)
  COMPOSE_CMD="docker compose"
  COMPOSE_MAJOR=$(echo "$COMPOSE_VERSION" | cut -d. -f1)
  if [[ "$COMPOSE_MAJOR" -ge 2 ]]; then
    ok "Docker Compose v2: v${COMPOSE_VERSION}"
  else
    fail "Docker Compose v1 (${COMPOSE_VERSION}) — v2 benötigt"
  fi
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
  LEGACY_VER=$(docker-compose version --short 2>/dev/null || echo "?")
  fail "Nur docker-compose v1 (${LEGACY_VER}) — 'docker compose' Plugin benötigt"
  if ($FIX_MODE || $QUICKSTART) && [[ "$OS_TYPE" == "linux" ]] && { $QUICKSTART || ask "Docker Compose Plugin installieren?"; }; then
    sudo apt-get install -y docker-compose-plugin && COMPOSE_CMD="docker compose" && ok "Docker Compose v2 installiert"
  fi
else
  fail "Docker Compose nicht gefunden"
  if ($FIX_MODE || $QUICKSTART) && [[ "$OS_TYPE" == "linux" ]] && { $QUICKSTART || ask "Jetzt installieren?"; }; then
    sudo apt-get install -y docker-compose-plugin && COMPOSE_CMD="docker compose" && ok "Docker Compose v2 installiert"
  fi
fi

# ── 5. Docker-Gruppe ───────────────────────────────────────────────
header "Docker-Gruppe (kein sudo)"

CURRENT_USER="${USER:-$(whoami)}"
if [[ "$OS_TYPE" == "macos" ]]; then
  ok "macOS — kein sudo für Docker nötig"
elif groups "$CURRENT_USER" 2>/dev/null | grep -q '\bdocker\b'; then
  ok "User '$CURRENT_USER' in docker-Gruppe"
else
  fail "User '$CURRENT_USER' NICHT in docker-Gruppe"
  if ($FIX_MODE || $QUICKSTART) && [[ "$OS_TYPE" != "wsl" ]] && { $QUICKSTART || ask "User zur docker-Gruppe hinzufügen?"; }; then
    sudo usermod -aG docker "$CURRENT_USER"
    ok "User hinzugefügt — bitte neu einloggen oder 'newgrp docker'"
  fi
fi

# ── 6. Ports prüfen ────────────────────────────────────────────────
header "Port-Verfügbarkeit"

check_port() {
  local port="$1" proto="${2:-tcp}" label="$3"
  local in_use=false
  if command -v ss &>/dev/null; then
    ss -lnp${proto:0:1} 2>/dev/null | grep -q ":${port} " && in_use=true
  elif command -v netstat &>/dev/null; then
    netstat -ln${proto:0:1} 2>/dev/null | grep -q ":${port} " && in_use=true
  elif command -v lsof &>/dev/null; then
    lsof -i "${proto}:${port}" &>/dev/null && in_use=true
  fi
  if $in_use; then
    local proc=""
    proc=$(ss -lnp${proto:0:1} 2>/dev/null | grep ":${port} " | grep -oP 'users:\(\("[^"]+' | head -1 | cut -d'"' -f2 || true)
    fail "Port ${port}/${proto} belegt${proc:+ (${proc})} — $label"
  else
    ok "Port ${port}/${proto} frei — $label"
  fi
}

check_port 80   tcp  "HTTP / Let's Encrypt"
check_port 443  tcp  "HTTPS"
check_port 10000 udp "Jitsi JVB"

# ── 7. Firewall (UFW) ──────────────────────────────────────────────
header "Firewall (UFW)"

if command -v ufw &>/dev/null; then
  UFW_ACTIVE=false
  ufw status 2>/dev/null | grep -q "Status: active" && UFW_ACTIVE=true
  if $UFW_ACTIVE; then
    ok "UFW aktiv"
    ALL_RULES_OK=true
    for entry in "${FIREWALL_RULES[@]}"; do
      port="${entry%%|*}" comment="${entry##*|}"
      if ufw status 2>/dev/null | grep -q "$port.*ALLOW"; then
        ok "Firewall: $port erlaubt ($comment)"
      else
        fail "Firewall: $port NICHT erlaubt ($comment)"
        ALL_RULES_OK=false
      fi
    done
    if ! $ALL_RULES_OK && ($FIX_MODE || $QUICKSTART); then
      if $QUICKSTART || ask "Fehlende Firewall-Regeln jetzt anlegen? (benötigt sudo)"; then
        for entry in "${FIREWALL_RULES[@]}"; do
          port="${entry%%|*}" comment="${entry##*|}"
          if ! ufw status 2>/dev/null | grep -q "$port.*ALLOW"; then
            sudo ufw allow "$port" comment "$comment" 2>/dev/null && \
              ok "Firewall: $port angelegt" || warn "Konnte $port nicht freigeben (sudo?)"
          fi
        done
      fi
    fi
  else
    warn "UFW installiert aber inaktiv"
    if ($FIX_MODE || $QUICKSTART) && { $QUICKSTART || ask "UFW aktivieren und Regeln anlegen? (benötigt sudo)"; }; then
      for entry in "${FIREWALL_RULES[@]}"; do
        port="${entry%%|*}" comment="${entry##*|}"
        sudo ufw allow "$port" comment "$comment" 2>/dev/null
      done
      sudo ufw --force enable 2>/dev/null && ok "UFW aktiviert mit Regeln" || warn "Konnte UFW nicht aktivieren (sudo?)"
    else
      info "Aktivieren mit: sudo $0 firewall setup"
    fi
  fi
elif [[ "$OS_TYPE" == "wsl" || "$OS_TYPE" == "macos" ]]; then
  info "Firewall wird vom Host-OS verwaltet (nicht UFW)"
else
  warn "UFW nicht installiert — optional: sudo apt install ufw"
  info "Oder manuell: sudo $0 firewall setup"
fi

# ── 8. .env Datei ──────────────────────────────────────────────────
header ".env Datei"

QUICKSTART_ENV_CREATED=false

if $QUICKSTART; then
  if [[ -f "$ENV_FILE" ]]; then
    warn ".env existiert bereits: $ENV_FILE"
    echo -en "  ${YELLOW}▶${NC} Überschreiben? [j/N] "
    read -r answer
    [[ "${answer,,}" == "j" ]] && QUICKSTART_ENV_CREATED=true || \
      info "Behalte bestehende .env"
  else
    QUICKSTART_ENV_CREATED=true
  fi

  if $QUICKSTART_ENV_CREATED; then
    cp "${COMPOSE_DIR}/.env.example" "$ENV_FILE"
    ok ".env aus .env.example erstellt"

    echo ""
    echo -e "  ${BOLD}Projekt-Konfiguration${NC}"
    echo -e "  ${CYAN}─────────────────────${NC}"
    echo ""

    echo -e "  Projektname für DuckDNS-Subdomains (z.B. ${CYAN}bachelorprojekt${NC})"
    echo -e "  Daraus werden: <name>-chat, <name>-auth, <name>-files, <name>-meet, <name>-ldap"
    echo -en "  ${BOLD}Projektname:${NC} "
    read -r PROJECT_NAME
    PROJECT_NAME="${PROJECT_NAME:-bachelorprojekt}"

    echo ""
    echo -e "  DuckDNS Token von ${CYAN}https://www.duckdns.org${NC} (Format: xxxxxxxx-xxxx-...)"
    echo -en "  ${BOLD}Token:${NC} "
    read -r DUCKDNS_TOKEN
    [[ -z "$DUCKDNS_TOKEN" ]] && { fail "DuckDNS Token erforderlich!"; exit 1; }

    echo ""
    echo -e "  E-Mail für Let's Encrypt SSL-Zertifikate:"
    echo -en "  ${BOLD}E-Mail:${NC} "
    read -r ACME_EMAIL
    [[ -z "$ACME_EMAIL" ]] && { fail "E-Mail erforderlich!"; exit 1; }

    echo ""
    echo -e "  Öffentliche IP/Domain für Jitsi Video. Standard: ${CYAN}${PROJECT_NAME}-meet.duckdns.org${NC}"
    echo -en "  ${BOLD}JVB IP/Domain${NC} [Enter=Standard]: "
    read -r JVB_IP
    JVB_IP="${JVB_IP:-${PROJECT_NAME}-meet.duckdns.org}"

    # Secrets generieren
    echo ""
    header "Sichere Secrets generieren"

    KEYCLOAK_DB_PASSWORD=$(gen_secret);    KEYCLOAK_ADMIN_PASSWORD=$(gen_secret)
    MATTERMOST_DB_PASSWORD=$(gen_secret);  MATTERMOST_OIDC_SECRET=$(gen_secret)
    NEXTCLOUD_OIDC_SECRET=$(gen_secret);   NEXTCLOUD_DB_PASSWORD=$(gen_secret)
    NEXTCLOUD_ADMIN_PASSWORD=$(gen_secret); LLDAP_JWT_SECRET=$(gen_secret)
    LLDAP_LDAP_USER_PASS=$(gen_secret);    LLDAP_DB_PASSWORD=$(gen_secret)
    JICOFO_AUTH_PASSWORD=$(gen_secret);    JVB_AUTH_PASSWORD=$(gen_secret)
    ok "12 sichere Secrets generiert (je 32 Zeichen)"

    # Werte schreiben
    header "Werte in .env schreiben"
    sed_inplace "s|^MM_DOMAIN=.*|MM_DOMAIN=${PROJECT_NAME}-chat.duckdns.org|"         "$ENV_FILE"
    sed_inplace "s|^KC_DOMAIN=.*|KC_DOMAIN=${PROJECT_NAME}-auth.duckdns.org|"         "$ENV_FILE"
    sed_inplace "s|^NC_DOMAIN=.*|NC_DOMAIN=${PROJECT_NAME}-files.duckdns.org|"        "$ENV_FILE"
    sed_inplace "s|^JITSI_DOMAIN=.*|JITSI_DOMAIN=${PROJECT_NAME}-meet.duckdns.org|"  "$ENV_FILE"
    sed_inplace "s|^LLDAP_DOMAIN=.*|LLDAP_DOMAIN=${PROJECT_NAME}-ldap.duckdns.org|"  "$ENV_FILE"
    sed_inplace "s|^DUCKDNS_TOKEN=.*|DUCKDNS_TOKEN=${DUCKDNS_TOKEN}|"                "$ENV_FILE"
    sed_inplace "s|^DUCKDNS_SUBDOMAINS=.*|DUCKDNS_SUBDOMAINS=${PROJECT_NAME}-chat,${PROJECT_NAME}-auth,${PROJECT_NAME}-files,${PROJECT_NAME}-meet,${PROJECT_NAME}-ldap|" "$ENV_FILE"
    sed_inplace "s|^JVB_ADVERTISE_IPS=.*|JVB_ADVERTISE_IPS=${JVB_IP}|"               "$ENV_FILE"
    sed_inplace "s|^JITSI_XMPP_SUFFIX=.*|JITSI_XMPP_SUFFIX=${PROJECT_NAME}-meet.duckdns.org|" "$ENV_FILE"
    sed_inplace "s|^ACME_EMAIL=.*|ACME_EMAIL=${ACME_EMAIL}|"                          "$ENV_FILE"
    sed_inplace "s|^LLDAP_BASE_DOMAIN=.*|LLDAP_BASE_DOMAIN=${PROJECT_NAME}-ldap|"    "$ENV_FILE"
    sed_inplace "s|^LLDAP_BASE_TLD=.*|LLDAP_BASE_TLD=duckdns|"                       "$ENV_FILE"
    for secret_var in KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD MATTERMOST_DB_PASSWORD \
      MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD \
      LLDAP_JWT_SECRET LLDAP_LDAP_USER_PASS LLDAP_DB_PASSWORD JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD; do
      sed_inplace "s|^${secret_var}=.*|${secret_var}=${!secret_var}|" "$ENV_FILE"
    done
    ok "Alle Werte in .env geschrieben"
  fi
else
  if [[ ! -f "$ENV_FILE" ]]; then
    fail ".env nicht gefunden: $ENV_FILE"
    if $FIX_MODE && ask ".env aus .env.example erstellen?"; then
      cp "${COMPOSE_DIR}/.env.example" "$ENV_FILE"
      ok ".env erstellt — Werte ausfüllen"
    else
      info "Erstellen: cp .env.example .env"
      info "Oder: ./scripts/setup.sh --quickstart"
    fi
  else
    ok ".env gefunden"
  fi
fi

# ── 9. .env Inhalt validieren ──────────────────────────────────────
header ".env Inhalt"

REQUIRED_VARS=(
  MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN LLDAP_DOMAIN
  DUCKDNS_TOKEN DUCKDNS_SUBDOMAINS JVB_ADVERTISE_IPS JITSI_XMPP_SUFFIX ACME_EMAIL
  KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD
  MATTERMOST_DB_PASSWORD MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET
  NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD
  LLDAP_JWT_SECRET LLDAP_LDAP_USER_PASS LLDAP_DB_PASSWORD LLDAP_BASE_DOMAIN LLDAP_BASE_TLD
  JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD
)
PLACEHOLDERS=("CHANGE_ME" "DEIN_" "your@" "xxxxxxxx" "NACH_KEYCLOAK" "DEIN_NEUER_TOKEN")

if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE" 2>/dev/null || true; set +a

  MISSING=(); PLACEHOLDER_VARS=()
  for var in "${REQUIRED_VARS[@]}"; do
    val="${!var:-}"
    if [[ -z "$val" ]]; then
      MISSING+=("$var")
    else
      for ph in "${PLACEHOLDERS[@]}"; do
        [[ "$val" == *"$ph"* ]] && { PLACEHOLDER_VARS+=("$var=${val}"); break; }
      done
    fi
  done

  [[ ${#MISSING[@]} -eq 0 ]] && ok "Alle ${#REQUIRED_VARS[@]} Pflichtfelder gesetzt" || \
    for v in "${MISSING[@]}"; do fail "Fehlt: $v"; done

  if [[ ${#PLACEHOLDER_VARS[@]} -gt 0 ]]; then
    echo ""
    warn "Placeholder-Werte gefunden:"
    for pv in "${PLACEHOLDER_VARS[@]}"; do echo -e "    ${YELLOW}•${NC} $pv"; done
  else
    ok "Keine Placeholder-Werte"
  fi

  # Format-Validierungen
  [[ -n "${DUCKDNS_TOKEN:-}" ]] && {
    [[ "$DUCKDNS_TOKEN" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] && \
      ok "DuckDNS Token Format gültig" || fail "DuckDNS Token Format ungültig"
  }
  [[ -n "${ACME_EMAIL:-}" ]] && {
    [[ "$ACME_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]] && ok "ACME E-Mail gültig: $ACME_EMAIL" || fail "ACME_EMAIL ungültig"
  }

  for var in MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN LLDAP_DOMAIN; do
    val="${!var:-}"
    [[ -n "$val" ]] && {
      [[ "$val" =~ \.duckdns\.org$ ]] || [[ "$val" =~ \.[a-z]{2,}$ ]] && \
        ok "Domain OK: ${var}=${val}" || warn "Domain prüfen: ${var}=${val}"
    }
  done

  for oidc_var in MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET; do
    val="${!oidc_var:-}"
    [[ -z "$val" || "$val" == *"CHANGE_ME"* ]] && \
      fail "${oidc_var} nicht gesetzt — openssl rand -base64 32" || \
      ok "${oidc_var} gesetzt (${#val} Zeichen)"
  done

  # STORAGE_PATH
  if [[ -n "${STORAGE_PATH:-}" ]]; then
    [[ "$STORAGE_PATH" == /* || "$STORAGE_PATH" == ./* || "$STORAGE_PATH" == "." ]] && \
      ok "STORAGE_PATH: $STORAGE_PATH" || warn "STORAGE_PATH ungewöhnlich: $STORAGE_PATH"
  else
    info "STORAGE_PATH nicht gesetzt — Standard ./data"
  fi

  # Backup-Targets (optional)
  BACKUP_CONFIGURED=false
  FILEN_PARTIAL=false
  [[ -n "${FILEN_EMAIL:-}" || -n "${FILEN_PASSWORD:-}" ]] && FILEN_PARTIAL=true
  if [[ -n "${FILEN_EMAIL:-}" && -n "${FILEN_PASSWORD:-}" ]]; then
    [[ "$FILEN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]] && \
      ok "Backup: Filen.io (${FILEN_EMAIL})" || warn "FILEN_EMAIL ungültig"
    BACKUP_CONFIGURED=true
  elif $FILEN_PARTIAL; then
    warn "Filen.io unvollständig — FILEN_EMAIL + FILEN_PASSWORD nötig"
  fi

  SMB_PARTIAL=false
  [[ -n "${SMB_HOST:-}" || -n "${SMB_SHARE:-}" || -n "${SMB_USER:-}" || -n "${SMB_PASS:-}" ]] && SMB_PARTIAL=true
  if [[ -n "${SMB_HOST:-}" && -n "${SMB_SHARE:-}" ]]; then
    ok "Backup: SMB (//${SMB_HOST}/${SMB_SHARE})"
    [[ -z "${SMB_USER:-}" ]] && warn "SMB_USER fehlt" || ok "SMB_USER: ${SMB_USER}"
    [[ -z "${SMB_PASS:-}" ]] && warn "SMB_PASS fehlt" || ok "SMB_PASS gesetzt"
    BACKUP_CONFIGURED=true
  elif $SMB_PARTIAL; then
    warn "SMB unvollständig — SMB_HOST + SMB_SHARE nötig"
  fi

  $BACKUP_CONFIGURED || {
    warn "Backup: kein Target — optional, nachrüstbar"
    info "Filen.io: FILEN_EMAIL + FILEN_PASSWORD"
    info "SMB/NAS:  SMB_HOST + SMB_SHARE + SMB_USER + SMB_PASS"
  }

  # SMTP (optional)
  if [[ -n "${SMTP_HOST:-}" && -n "${SMTP_USER:-}" ]]; then
    ok "SMTP: ${SMTP_USER}@${SMTP_HOST}:${SMTP_PORT:-465}"
    [[ -z "${SMTP_PASS:-}" ]] && warn "SMTP_PASS fehlt" || ok "SMTP_PASS gesetzt"
  elif [[ -n "${SMTP_HOST:-}" || -n "${SMTP_USER:-}" ]]; then
    warn "SMTP unvollständig"
  else
    info "SMTP nicht konfiguriert — optional"
  fi

  # Passwort-Länge
  for var in KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD MATTERMOST_DB_PASSWORD \
             NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD LLDAP_DB_PASSWORD \
             LLDAP_JWT_SECRET LLDAP_LDAP_USER_PASS MATTERMOST_OIDC_SECRET \
             NEXTCLOUD_OIDC_SECRET JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD; do
    val="${!var:-}"
    [[ -n "$val" && ${#val} -lt 16 ]] && warn "${var} kurz (${#val} Zeichen) — min. 16 empfohlen"
  done
fi

# ── 10. Datenpfade + acme.json ─────────────────────────────────────
header "Datenpfade & acme.json"

STORAGE="${STORAGE_PATH:-${COMPOSE_DIR}/data}"
[[ "$STORAGE" == "./"* ]] && STORAGE="${COMPOSE_DIR}/${STORAGE:2}"
[[ "$STORAGE" == "." ]]   && STORAGE="${COMPOSE_DIR}/data"
[[ "$STORAGE" != /* ]]    && STORAGE="${COMPOSE_DIR}/${STORAGE}"

for dir in "${STORAGE}/traefik/letsencrypt" "${STORAGE}/mattermost" "${STORAGE}/nextcloud"; do
  if [[ -d "$dir" ]]; then
    ok "Verzeichnis: $dir"
  else
    fail "Fehlt: $dir"
    if ($FIX_MODE || $QUICKSTART) && { $QUICKSTART || ask "Erstellen?"; }; then
      mkdir -p "$dir" && ok "Erstellt: $dir"
    fi
  fi
done

ACME_JSON="${STORAGE}/traefik/letsencrypt/acme.json"
if [[ -f "$ACME_JSON" ]]; then
  PERMS=$(stat -c "%a" "$ACME_JSON" 2>/dev/null || stat -f "%Lp" "$ACME_JSON" 2>/dev/null)
  [[ "$PERMS" == "600" ]] && ok "acme.json chmod 600" || {
    fail "acme.json Rechte: ${PERMS} (600 nötig)"
    if ($FIX_MODE || $QUICKSTART) && { $QUICKSTART || ask "chmod 600?"; }; then
      chmod 600 "$ACME_JSON" && ok "Rechte korrigiert"
    fi
  }
else
  fail "acme.json fehlt"
  if ($FIX_MODE || $QUICKSTART) && { $QUICKSTART || ask "Erstellen?"; }; then
    [[ -d "$(dirname "$ACME_JSON")" ]] || mkdir -p "$(dirname "$ACME_JSON")"
    touch "$ACME_JSON" && chmod 600 "$ACME_JSON" && ok "acme.json erstellt (chmod 600)"
  fi
fi

# ── 11. Volume-Mount-Dateien ───────────────────────────────────────
header "Volume-Mount-Dateien"

for mf in "${COMPOSE_DIR}/scripts/import-entrypoint.sh" \
          "${COMPOSE_DIR}/realm-homeoffice.json" \
          "${COMPOSE_DIR}/scripts/backup-entrypoint.sh"; do
  [[ -f "$mf" ]] && ok "Vorhanden: ${mf##*/}" || fail "Fehlt: ${mf##*/}"
done

for ef in "${COMPOSE_DIR}/scripts/import-entrypoint.sh" \
          "${COMPOSE_DIR}/scripts/backup-entrypoint.sh"; do
  if [[ -f "$ef" ]]; then
    if [[ -x "$ef" ]]; then
      ok "Ausführbar: ${ef##*/}"
    else
      fail "${ef##*/} nicht ausführbar"
      if ($FIX_MODE || $QUICKSTART) && { $QUICKSTART || ask "chmod +x?"; }; then
        chmod +x "$ef" && ok "Ausführbar: ${ef##*/}"
      fi
    fi
  fi
done

# ── 12. docker compose config ─────────────────────────────────────
header "docker compose config"

if [[ -n "$COMPOSE_CMD" ]] && docker info &>/dev/null 2>&1; then
  cd "$COMPOSE_DIR"
  if [[ -f "$ENV_FILE" ]]; then
    COMPOSE_OUTPUT=$($COMPOSE_CMD config --quiet 2>&1) && RC=0 || RC=$?
    [[ $RC -eq 0 ]] && ok "docker compose config valide" || {
      fail "docker compose config Fehler:"
      echo "$COMPOSE_OUTPUT" | sed 's/^/    /'
    }
  else
    warn "Übersprungen — .env fehlt"
  fi
else
  warn "Übersprungen — Docker/Compose nicht verfügbar"
fi

# ── 13. Netzwerk-Konnektivität ────────────────────────────────────
header "Netzwerk-Konnektivität"

curl -s --connect-timeout 5 "https://www.duckdns.org" -o /dev/null && \
  ok "DuckDNS erreichbar" || warn "DuckDNS nicht erreichbar"

curl -s --connect-timeout 5 "https://acme-v02.api.letsencrypt.org/directory" -o /dev/null && \
  ok "Let's Encrypt API erreichbar" || warn "Let's Encrypt API nicht erreichbar"

[[ -n "${MM_DOMAIN:-}" ]] && {
  (host "$MM_DOMAIN" &>/dev/null 2>&1 || nslookup "$MM_DOMAIN" &>/dev/null 2>&1) && \
    ok "DNS OK: $MM_DOMAIN" || warn "DNS fehlgeschlagen: $MM_DOMAIN"
}

# ── 14. SMB-Erreichbarkeit (wenn konfiguriert) ────────────────────
if [[ -n "${SMB_HOST:-}" && -n "${SMB_SHARE:-}" ]]; then
  header "SMB-Backup-Share"
  if command -v smbclient &>/dev/null && [[ -n "${SMB_USER:-}" && -n "${SMB_PASS:-}" ]]; then
    if smbclient -L "//${SMB_HOST}" -U "${SMB_USER}%${SMB_PASS}" -p "${SMB_PORT:-445}" 2>/dev/null \
       | grep -qi "${SMB_SHARE}"; then
      ok "SMB-Share erreichbar: //${SMB_HOST}/${SMB_SHARE}"
    else
      warn "SMB-Share nicht erreichbar — einrichten mit: sudo $0 smb"
    fi
  else
    info "smbclient nicht verfügbar — SMB-Test übersprungen"
    info "Share einrichten mit: sudo $0 smb"
  fi
fi

# ═════════════════════════════════════════════════════════════════════
#  Zusammenfassung
# ═════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo -e "${BOLD} Ergebnis${NC}"
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo -e "  ${GREEN}✓ Bestanden:${NC}  $PASS"
echo -e "  ${YELLOW}⚠ Warnungen:${NC} $WARN"
echo -e "  ${RED}✗ Fehler:${NC}    $FAIL"
echo ""

if [[ $FAIL -eq 0 && $WARN -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  Alles bereit!${NC} ${CYAN}docker compose up -d${NC}"
elif [[ $FAIL -eq 0 ]]; then
  echo -e "${YELLOW}${BOLD}  Bereit mit Warnungen.${NC} ${CYAN}docker compose up -d${NC}"
else
  if ! $QUICKSTART; then
    echo -e "${RED}${BOLD}  Fehler gefunden — beheben bevor docker compose up.${NC}"
    $FIX_MODE || echo -e "  Auto-Fix: ${CYAN}./scripts/setup.sh --fix${NC}"
    exit 1
  else
    echo -e "${YELLOW}${BOLD}  Einige Prüfungen fehlgeschlagen — siehe oben.${NC}"
  fi
fi

# ── 15. Stack starten (nur --quickstart) ──────────────────────────
if $QUICKSTART; then
  echo ""
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Konfiguration abgeschlossen!${NC}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════════${NC}"
  echo ""
  source "$ENV_FILE" 2>/dev/null || true
  echo -e "  ${BOLD}Dienste:${NC}"
  echo -e "    Chat:     ${CYAN}https://${MM_DOMAIN:-?}${NC}"
  echo -e "    Auth:     ${CYAN}https://${KC_DOMAIN:-?}${NC}"
  echo -e "    Dateien:  ${CYAN}https://${NC_DOMAIN:-?}${NC}"
  echo -e "    Meeting:  ${CYAN}https://${JITSI_DOMAIN:-?}${NC}"
  echo -e "    LDAP:     ${CYAN}https://${LLDAP_DOMAIN:-?}${NC}"
  echo ""
  echo -en "  ${BOLD}Stack jetzt starten?${NC} [J/n] "
  read -r start_answer
  if [[ "${start_answer,,}" != "n" ]]; then
    header "Stack starten"
    cd "$COMPOSE_DIR"
    docker compose up -d
    echo ""
    ok "Stack gestartet!"
    echo ""
    echo -e "  ${BOLD}Befehle:${NC}"
    echo -e "    ${CYAN}docker compose ps${NC}        — Status"
    echo -e "    ${CYAN}docker compose logs -f${NC}   — Logs"
    echo -e "    ${CYAN}docker compose down${NC}      — Stoppen"
    echo ""
    echo -e "  ${YELLOW}Hinweis:${NC} SSL braucht 1-2 Min, Keycloak 30-60 Sek."
    echo ""
    echo -e "  ${BOLD}Wichtig:${NC} Alle 5 DuckDNS-Subdomains auf ${CYAN}https://www.duckdns.org${NC} anlegen!"
  else
    info "Manuell starten: ${CYAN}cd ${COMPOSE_DIR} && docker compose up -d${NC}"
  fi
fi
