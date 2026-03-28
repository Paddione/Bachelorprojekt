#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup-smb.sh — SMB-Share Setup für Homeoffice MVP Backup
# ═══════════════════════════════════════════════════════════════════
# Prüft ob der in .env konfigurierte SMB-Share existiert.
# Falls nicht: listet alle verfügbaren Laufwerke (USB + intern),
# lässt den Benutzer wählen, formatiert und erstellt den Share.
#
# Verwendung:
#   chmod +x scripts/setup-smb.sh
#   sudo ./scripts/setup-smb.sh          # Interaktiv
#   sudo ./scripts/setup-smb.sh --check  # Nur prüfen
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${COMPOSE_DIR}/.env"

# ── Farben ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

CHECK_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    -h|--help)
      echo "Verwendung: sudo $0 [--check]"
      echo "  --check  Nur prüfen, keine Änderungen"
      exit 0 ;;
  esac
done

# ── Hilfsfunktionen ─────────────────────────────────────────────────
ok()     { echo -e "  ${GREEN}✓${NC} $*"; }
warn()   { echo -e "  ${YELLOW}⚠${NC}  $*"; }
fail()   { echo -e "  ${RED}✗${NC} $*"; }
info()   { echo -e "  ${BLUE}→${NC} $*"; }
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

# ── Root-Check ──────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  fail "Dieses Skript muss als root ausgeführt werden: sudo $0"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════
# 1. .env laden — SMB-Konfiguration lesen
# ═══════════════════════════════════════════════════════════════════
header "SMB-Konfiguration aus .env"

if [[ ! -f "$ENV_FILE" ]]; then
  fail ".env nicht gefunden: $ENV_FILE"
  exit 1
fi

# SMB-Variablen aus .env lesen
SMB_HOST=$(grep -E '^SMB_HOST=' "$ENV_FILE" | cut -d= -f2- | xargs)
SMB_SHARE=$(grep -E '^SMB_SHARE=' "$ENV_FILE" | cut -d= -f2- | xargs)
SMB_USER=$(grep -E '^SMB_USER=' "$ENV_FILE" | cut -d= -f2- | xargs)
SMB_PASS=$(grep -E '^SMB_PASS=' "$ENV_FILE" | cut -d= -f2- | xargs)
SMB_PORT=$(grep -E '^SMB_PORT=' "$ENV_FILE" | cut -d= -f2- | xargs)
SMB_DOMAIN=$(grep -E '^SMB_DOMAIN=' "$ENV_FILE" | cut -d= -f2- | xargs)
SMB_REMOTE_PATH=$(grep -E '^SMB_REMOTE_PATH=' "$ENV_FILE" | cut -d= -f2- | xargs)

# Prüfen ob alle Pflichtfelder gesetzt sind
MISSING=()
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

# ═══════════════════════════════════════════════════════════════════
# 2. Prüfen ob der SMB-Share bereits existiert
# ═══════════════════════════════════════════════════════════════════
header "SMB-Share prüfen"

SHARE_EXISTS=false

# Methode 1: Samba-Konfiguration direkt prüfen (lokal)
if testparm -s 2>/dev/null | grep -q "^\[${SMB_SHARE}\]"; then
  ok "Share [${SMB_SHARE}] in smb.conf gefunden"
  SHARE_EXISTS=true
else
  warn "Share [${SMB_SHARE}] nicht in smb.conf konfiguriert"
fi

# Methode 2: Erreichbarkeit via smbclient prüfen
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
  echo ""
  info "Zum Mounten: sudo mount -t cifs //${SMB_HOST}/${SMB_SHARE} /mnt/${SMB_SHARE} -o username=${SMB_USER}"
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════
# 3. Share existiert nicht — verfügbare Laufwerke anzeigen
# ═══════════════════════════════════════════════════════════════════
header "Verfügbare Laufwerke"

echo ""
echo -e "  ${BOLD}Alle erkannten Block-Geräte:${NC}"
echo ""

# Hilfsfunktion um KEY="VALUE" Zeilen zu parsen
parse_lsblk_field() {
  echo "$1" | grep -oP "${2}=\"[^\"]*\"" | sed "s/${2}=\"//;s/\"$//"
}

# Ermittle geschützte Disks: alle Top-Level-Disks die gemountete Partitionen haben
ROOT_DISKS=()
while IFS= read -r line; do
  disk_name=$(parse_lsblk_field "$line" "NAME")
  disk_type=$(parse_lsblk_field "$line" "TYPE")
  [[ "$disk_type" != "disk" ]] && continue
  # Prüfe ob irgendeine Partition dieses Disks gemountet ist
  has_mount=$(lsblk -n -o MOUNTPOINT "/dev/${disk_name}" 2>/dev/null | grep -v '^$' | head -1 || true)
  if [[ -n "$has_mount" ]]; then
    ROOT_DISKS+=("$disk_name")
  fi
done < <(lsblk -P -o NAME,TYPE 2>/dev/null)
info "Systemlaufwerke erkannt: ${ROOT_DISKS[*]} (werden geschützt)"

# Sammle verfügbare Laufwerke (nicht System, nicht gemountet)
declare -A CHOICES
declare -A CHOICE_TRAN
IDX=0

echo -e "  ${BOLD}Nr  Gerät              Größe   Typ    FS         Transport  Modell${NC}"
echo -e "  ${CYAN}──  ─────────────────  ──────  ─────  ─────────  ─────────  ──────────────────${NC}"

# lsblk -P gibt key="value"-Paare aus — kein Problem mit leeren Feldern
while IFS= read -r line; do
  D_NAME=$(parse_lsblk_field "$line" "NAME")
  D_SIZE=$(parse_lsblk_field "$line" "SIZE")
  D_TYPE=$(parse_lsblk_field "$line" "TYPE")
  D_FSTYPE=$(parse_lsblk_field "$line" "FSTYPE")
  D_MOUNTPOINT=$(parse_lsblk_field "$line" "MOUNTPOINT")
  D_TRAN=$(parse_lsblk_field "$line" "TRAN")
  D_MODEL=$(parse_lsblk_field "$line" "MODEL")

  # Überspringe loop, lvm und gemountete Geräte
  [[ "$D_TYPE" == "loop" || "$D_TYPE" == "lvm" ]] && continue
  [[ -n "$D_MOUNTPOINT" ]] && continue

  # Überspringe das Systemlaufwerk und alle seine Partitionen
  BASE_DISK=$(lsblk -n -o PKNAME "/dev/${D_NAME}" 2>/dev/null | head -1 | xargs)
  [[ -z "$BASE_DISK" ]] && BASE_DISK="$D_NAME"  # Disk hat keinen Parent
  SKIP=false
  for rd in "${ROOT_DISKS[@]}"; do
    [[ "$BASE_DISK" == "$rd" || "$D_NAME" == "$rd" ]] && SKIP=true && break
  done
  $SKIP && continue

  # Nur Disks und Partitionen
  if [[ "$D_TYPE" == "disk" || "$D_TYPE" == "part" ]]; then
    ((IDX++)) || true
    CHOICES[$IDX]="/dev/${D_NAME}"

    # Transport: Partitionen erben vom Parent-Disk
    TRAN="${D_TRAN}"
    if [[ -z "$TRAN" && "$D_TYPE" == "part" ]]; then
      PARENT=$(lsblk -n -o PKNAME "/dev/${D_NAME}" 2>/dev/null | head -1 | xargs)
      [[ -n "$PARENT" ]] && TRAN=$(lsblk -n -o TRAN "/dev/${PARENT}" 2>/dev/null | head -1 | xargs)
    fi
    CHOICE_TRAN[$IDX]="$TRAN"

    # Farbiges Transport-Label
    TRAN_LABEL="${TRAN:-—}"
    [[ "$TRAN" == "usb" ]]  && TRAN_LABEL="${GREEN}USB${NC}"
    [[ "$TRAN" == "nvme" ]] && TRAN_LABEL="${BLUE}NVMe${NC}"
    [[ "$TRAN" == "sata" ]] && TRAN_LABEL="${YELLOW}SATA${NC}"

    # Model: unescape lsblk hex encoding (\x20 → space)
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

if $CHECK_ONLY; then
  info "Check-Modus: $IDX verfügbare(s) Laufwerk(e) gefunden"
  info "Starte ohne --check um ein Laufwerk auszuwählen"
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════
# 4. Benutzer wählt Laufwerk
# ═══════════════════════════════════════════════════════════════════
header "Laufwerk auswählen"

echo -en "  ${YELLOW}▶${NC} Welches Laufwerk soll für den Share [${SMB_SHARE}] verwendet werden? [1-${IDX}] "
read -r CHOICE

if [[ -z "${CHOICES[$CHOICE]+_}" ]]; then
  fail "Ungültige Auswahl: $CHOICE"
  exit 1
fi

SELECTED_DEV="${CHOICES[$CHOICE]}"
ok "Ausgewählt: ${SELECTED_DEV}"

# Prüfe ob es ein Disk oder Part ist
SELECTED_TYPE=$(lsblk -n -o TYPE "$SELECTED_DEV" 2>/dev/null)
SELECTED_SIZE=$(lsblk -n -o SIZE "$SELECTED_DEV" 2>/dev/null | xargs)

# ═══════════════════════════════════════════════════════════════════
# 5. Dateisystem wählen
# ═══════════════════════════════════════════════════════════════════
header "Dateisystem wählen"

echo -e "  ${BOLD}Verfügbare Dateisysteme:${NC}"
echo ""
echo -e "  ${GREEN}1${NC}  ext4   — Standard Linux-FS, stabil und bewährt"
echo -e "  ${GREEN}2${NC}  xfs    — Performant bei großen Dateien, gut für Backups"
echo -e "  ${GREEN}3${NC}  btrfs  — Snapshots & Kompression, modern"
echo -e "  ${GREEN}4${NC}  ntfs   — Windows-kompatibel (für Dual-Boot / portabel)"
echo -e "  ${GREEN}5${NC}  exfat  — Plattformübergreifend (USB-Sticks, keine Rechteverwaltung)"
echo ""
echo -en "  ${YELLOW}▶${NC} Welches Dateisystem? [1-5, Standard=1/ext4] "
read -r FS_CHOICE

case "${FS_CHOICE:-1}" in
  1) FS_TYPE="ext4";  MKFS_CMD="mkfs.ext4 -F" ;;
  2) FS_TYPE="xfs";   MKFS_CMD="mkfs.xfs -f" ;;
  3) FS_TYPE="btrfs"; MKFS_CMD="mkfs.btrfs -f" ;;
  4) FS_TYPE="ntfs";  MKFS_CMD="mkfs.ntfs -Q" ;;
  5) FS_TYPE="exfat"; MKFS_CMD="mkfs.exfat" ;;
  *)
    fail "Ungültige Auswahl: $FS_CHOICE"
    exit 1 ;;
esac

ok "Dateisystem: ${FS_TYPE}"

# Prüfe ob mkfs-Tool installiert ist
MKFS_BIN=$(echo "$MKFS_CMD" | awk '{print $1}')
if ! command -v "$MKFS_BIN" &>/dev/null; then
  fail "${MKFS_BIN} nicht installiert"
  echo ""
  case "$FS_TYPE" in
    ntfs)  info "Installieren mit: sudo apt install ntfs-3g" ;;
    exfat) info "Installieren mit: sudo apt install exfatprogs" ;;
    btrfs) info "Installieren mit: sudo apt install btrfs-progs" ;;
    xfs)   info "Installieren mit: sudo apt install xfsprogs" ;;
    *)     info "Installieren mit: sudo apt install e2fsprogs" ;;
  esac
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════
# 6. Partitionierung (falls ganzes Disk gewählt)
# ═══════════════════════════════════════════════════════════════════
TARGET_PART="$SELECTED_DEV"

if [[ "$SELECTED_TYPE" == "disk" ]]; then
  header "Partitionierung"

  warn "Ganzes Laufwerk gewählt: ${SELECTED_DEV} (${SELECTED_SIZE})"
  warn "Alle Daten auf diesem Laufwerk werden gelöscht!"
  echo ""

  if ! ask "Laufwerk ${SELECTED_DEV} partitionieren? ALLE DATEN GEHEN VERLOREN!"; then
    fail "Abgebrochen"
    exit 1
  fi

  info "Partitioniere ${SELECTED_DEV}..."

  # GPT-Partitionstabelle erstellen mit einer Partition
  parted -s "$SELECTED_DEV" mklabel gpt
  parted -s "$SELECTED_DEV" mkpart primary 0% 100%
  partprobe "$SELECTED_DEV"
  sleep 1

  # Partition-Device ermitteln (z.B. sda→sda1, nvme0n1→nvme0n1p1)
  if [[ "$SELECTED_DEV" =~ nvme ]]; then
    TARGET_PART="${SELECTED_DEV}p1"
  else
    TARGET_PART="${SELECTED_DEV}1"
  fi

  ok "Partition erstellt: ${TARGET_PART}"
fi

# ═══════════════════════════════════════════════════════════════════
# 7. Formatierung
# ═══════════════════════════════════════════════════════════════════
header "Formatierung"

EXISTING_FS=$(lsblk -n -o FSTYPE "$TARGET_PART" 2>/dev/null | xargs)

if [[ -n "$EXISTING_FS" ]]; then
  warn "${TARGET_PART} hat bereits ein Dateisystem: ${EXISTING_FS}"
fi

echo ""
echo -e "  ${RED}${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "  ${RED}${BOLD}║  WARNUNG: ${TARGET_PART} wird mit ${FS_TYPE} formatiert!  ║${NC}"
echo -e "  ${RED}${BOLD}║  Alle Daten auf dieser Partition gehen verloren! ║${NC}"
echo -e "  ${RED}${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

if ! ask "Partition ${TARGET_PART} jetzt formatieren?"; then
  fail "Abgebrochen"
  exit 1
fi

info "Formatiere ${TARGET_PART} als ${FS_TYPE}..."
$MKFS_CMD "$TARGET_PART"
ok "Formatierung abgeschlossen"

# ═══════════════════════════════════════════════════════════════════
# 8. Mount-Point erstellen und mounten
# ═══════════════════════════════════════════════════════════════════
header "Mounten"

MOUNT_POINT="/mnt/${SMB_SHARE}"
mkdir -p "$MOUNT_POINT"

# Falls bereits gemountet, zuerst unmounten
if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
  info "Bereits gemountet — unmounte ${MOUNT_POINT}..."
  umount "$MOUNT_POINT"
fi

mount "$TARGET_PART" "$MOUNT_POINT"
ok "Gemountet: ${TARGET_PART} → ${MOUNT_POINT}"

# Unterverzeichnis für SMB_REMOTE_PATH erstellen
if [[ -n "${SMB_REMOTE_PATH:-}" ]]; then
  mkdir -p "${MOUNT_POINT}/${SMB_REMOTE_PATH}"
  ok "Unterverzeichnis erstellt: ${MOUNT_POINT}/${SMB_REMOTE_PATH}"
fi

# Besitzer setzen
chown -R "${SMB_USER}:${SMB_USER}" "$MOUNT_POINT"
ok "Besitzer gesetzt: ${SMB_USER}"

# ═══════════════════════════════════════════════════════════════════
# 9. fstab-Eintrag
# ═══════════════════════════════════════════════════════════════════
header "fstab konfigurieren"

# UUID ermitteln
PART_UUID=$(blkid -s UUID -o value "$TARGET_PART")

if [[ -z "$PART_UUID" ]]; then
  warn "Konnte UUID für ${TARGET_PART} nicht ermitteln — verwende Device-Pfad"
  FSTAB_SRC="$TARGET_PART"
else
  FSTAB_SRC="UUID=${PART_UUID}"
  ok "UUID: ${PART_UUID}"
fi

# Prüfen ob bereits ein Eintrag existiert
if grep -q "${MOUNT_POINT}" /etc/fstab; then
  warn "fstab enthält bereits einen Eintrag für ${MOUNT_POINT}"
  info "Überspringe fstab-Konfiguration"
else
  # Mount-Optionen je nach FS
  case "$FS_TYPE" in
    ntfs)  MOUNT_OPTS="defaults,uid=${SMB_USER},gid=${SMB_USER},nofail,x-systemd.device-timeout=10" ;;
    exfat) MOUNT_OPTS="defaults,uid=${SMB_USER},gid=${SMB_USER},nofail,x-systemd.device-timeout=10" ;;
    *)     MOUNT_OPTS="defaults,nofail,x-systemd.device-timeout=10" ;;
  esac

  FSTAB_LINE="${FSTAB_SRC} ${MOUNT_POINT} ${FS_TYPE} ${MOUNT_OPTS} 0 0"

  echo "" >> /etc/fstab
  echo "# SMB-Share Backup-Laufwerk (homeoffice-mvp)" >> /etc/fstab
  echo "${FSTAB_LINE}" >> /etc/fstab

  ok "fstab-Eintrag hinzugefügt:"
  info "${FSTAB_LINE}"
fi

# ═══════════════════════════════════════════════════════════════════
# 10. Samba-Share konfigurieren
# ═══════════════════════════════════════════════════════════════════
header "Samba-Share konfigurieren"

SMB_CONF="/etc/samba/smb.conf"

if testparm -s 2>/dev/null | grep -q "^\[${SMB_SHARE}\]"; then
  warn "Share [${SMB_SHARE}] existiert bereits in smb.conf"
  info "Überspringe Samba-Konfiguration"
else
  SHARE_BLOCK="
[${SMB_SHARE}]
   comment = Homeoffice MVP Backup Storage
   path = ${MOUNT_POINT}
   browseable = yes
   read only = no
   valid users = ${SMB_USER}
   force user = ${SMB_USER}
   force group = ${SMB_USER}
   create mask = 0664
   directory mask = 0775"

  echo "$SHARE_BLOCK" >> "$SMB_CONF"
  ok "Share [${SMB_SHARE}] zu smb.conf hinzugefügt"
  info "Pfad: ${MOUNT_POINT}"
fi

# Samba-Passwort setzen (nicht-interaktiv)
echo -e "${SMB_PASS}\n${SMB_PASS}" | smbpasswd -s -a "$SMB_USER" 2>/dev/null
ok "Samba-Passwort für ${SMB_USER} gesetzt"

# Samba neustarten
systemctl restart smbd nmbd 2>/dev/null || true
ok "Samba-Dienste neugestartet"

# ═══════════════════════════════════════════════════════════════════
# 11. Validierung
# ═══════════════════════════════════════════════════════════════════
header "Validierung"

# Testparm prüfen
if testparm -s 2>/dev/null | grep -q "^\[${SMB_SHARE}\]"; then
  ok "Share [${SMB_SHARE}] in Samba-Konfiguration validiert"
else
  fail "Share [${SMB_SHARE}] nicht in Samba-Konfiguration gefunden"
fi

# Mountpoint prüfen
if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
  ok "Mountpoint ${MOUNT_POINT} aktiv"
  AVAIL=$(df -h "$MOUNT_POINT" | tail -1 | awk '{print $4}')
  info "Verfügbarer Speicher: ${AVAIL}"
else
  fail "Mountpoint ${MOUNT_POINT} nicht aktiv"
fi

# smbclient Verbindungstest
if command -v smbclient &>/dev/null; then
  if smbclient "//${SMB_HOST}/${SMB_SHARE}" -U "${SMB_USER}%${SMB_PASS}" -c "ls" &>/dev/null; then
    ok "SMB-Verbindung erfolgreich: //${SMB_HOST}/${SMB_SHARE}"
  else
    warn "SMB-Verbindung fehlgeschlagen — ggf. Firewall prüfen (Port ${SMB_PORT:-445})"
  fi
fi

# ═══════════════════════════════════════════════════════════════════
# Zusammenfassung
# ═══════════════════════════════════════════════════════════════════
header "Fertig!"

echo ""
echo -e "  ${GREEN}${BOLD}SMB-Share [${SMB_SHARE}] wurde erfolgreich eingerichtet:${NC}"
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
echo ""
