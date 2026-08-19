#!/usr/bin/env bash
# scripts/iso/build-node-iso.sh
#
# Baut aus dem offiziellen Ubuntu-Server-ISO ein unbeaufsichtigtes
# Autoinstall-ISO fuer Cluster-Workstations: ein Stick, drei Maschinen.
#
# Das Ergebnis installiert Ubuntu ohne jede Rueckfrage, setzt den Hostnamen
# anhand der MAC-Adresse (scripts/iso/autoinstall/assign-identity.sh) und legt
# /usr/local/sbin/k3s-join.sh ab. k3s selbst wird NICHT installiert — der
# Cluster-Join ist ein bewusster zweiter Schritt.
#
# ACHTUNG: Das erzeugte ISO loescht beim Booten die groesste Platte der
# Maschine ohne Rueckfrage. Es gehoert nicht in einen Rechner, dessen Inhalt
# noch gebraucht wird.
#
# Beispiel:
#   bash scripts/iso/build-node-iso.sh \
#     --ssh-key ~/.ssh/id_ed25519.pub \
#     --node-map scripts/iso/node-map.example \
#     --out /home/patrick/iso/ws-node.iso
#
# Voraussetzungen: xorriso, curl, envsubst (gettext-base), openssl.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
AUTOINSTALL_DIR="${SCRIPT_DIR}/autoinstall"

# --- Defaults ---------------------------------------------------------------
RELEASE="24.04"
SOURCE_ISO=""
OUT_ISO="${PROJECT_DIR}/build/iso/ubuntu-cluster-node.iso"
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
SHUTDOWN_MODE="reboot"
SKIP_VERIFY=0
KEEP_WORKDIR=0
K3S_VERSION=""

usage() {
  grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Flags:
  --ssh-key <datei|"ssh-ed25519 ...">  Public Key fuer den Admin-User (Pflicht)
  --node-map <datei>       MAC->Hostname-Tabelle (empfohlen, sonst ws-<mac>)
  --out <datei>            Ziel-ISO (default: build/iso/ubuntu-cluster-node.iso)
  --release <x.yy>         Ubuntu-Release (default: 24.04)
  --source-iso <datei>     vorhandenes ISO statt Download
  --cache-dir <verz>       Downloadverzeichnis (default: ~/.cache/bachelorprojekt-iso)
  --admin-user <name>      default: clusteradmin
  --admin-password <pw>    optional; ohne Angabe ist Passwort-Login gesperrt
  --locale <l>             default: de_DE.UTF-8
  --keyboard <layout>      default: de
  --timezone <tz>          default: Europe/Berlin
  --hostname-fallback <h>  Name, falls assign-identity.sh nichts setzt
  --k3s-version <v>        in k3s-join.sh eingebrannt (default: environments/versions.yaml)
  --package-upgrade        dist-upgrade waehrend der Installation
  --shutdown <reboot|poweroff>  default: reboot
  --skip-verify            SHA256-Pruefung des Quell-ISO ueberspringen
  --keep-workdir           Arbeitsverzeichnis nicht loeschen (Debug)
  -h, --help               diese Hilfe
EOF
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-key)           SSH_KEY_ARG="$2"; shift 2
                         if [[ -f "$SSH_KEY_ARG" ]]; then SSH_KEY_FILE="$SSH_KEY_ARG"
                         else SSH_KEY_LITERAL="$SSH_KEY_ARG"; fi ;;
    --node-map)          NODE_MAP="$2";          shift 2 ;;
    --out)               OUT_ISO="$2";           shift 2 ;;
    --release)           RELEASE="$2";           shift 2 ;;
    --source-iso)        SOURCE_ISO="$2";        shift 2 ;;
    --cache-dir)         CACHE_DIR="$2";         shift 2 ;;
    --admin-user)        ADMIN_USER="$2";        shift 2 ;;
    --admin-password)    ADMIN_PASSWORD="$2";    shift 2 ;;
    --locale)            LOCALE="$2";            shift 2 ;;
    --keyboard)          KEYBOARD_LAYOUT="$2";   shift 2 ;;
    --timezone)          TIMEZONE="$2";          shift 2 ;;
    --hostname-fallback) HOSTNAME_FALLBACK="$2"; shift 2 ;;
    --k3s-version)       K3S_VERSION="$2";       shift 2 ;;
    --package-upgrade)   PACKAGE_UPGRADE="true"; shift ;;
    --shutdown)          SHUTDOWN_MODE="$2";     shift 2 ;;
    --skip-verify)       SKIP_VERIFY=1;          shift ;;
    --keep-workdir)      KEEP_WORKDIR=1;         shift ;;
    -h|--help)           usage 0 ;;
    *) echo "Unbekanntes Flag: $1" >&2; usage 1 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*" >&2; }

# --- Vorbedingungen ---------------------------------------------------------
missing_tools=()
for t in xorriso curl envsubst openssl awk sed; do
  command -v "$t" >/dev/null 2>&1 || missing_tools+=("$t")
done
if [[ ${#missing_tools[@]} -gt 0 ]]; then
  echo "ERROR: fehlende Werkzeuge: ${missing_tools[*]}" >&2
  echo "  sudo apt install -y xorriso curl gettext-base openssl" >&2
  exit 1
fi

# SSH-Key ist Pflicht: ohne ihn ist der Node nach dem Reboot nicht erreichbar,
# und der Fehler faellt erst auf, wenn alle drei Maschinen schon installiert sind.
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

case "$SHUTDOWN_MODE" in reboot|poweroff) ;; *) die "--shutdown: reboot oder poweroff" ;; esac

# k3s-Version aus versions.yaml, damit ISO und Cluster nicht auseinanderlaufen.
if [[ -z "$K3S_VERSION" ]]; then
  K3S_VERSION="$(awk -F': *' '/^k3s:/ {print $2; exit}' \
    "${PROJECT_DIR}/environments/versions.yaml" 2>/dev/null || true)"
fi
[[ -n "$K3S_VERSION" ]] || die "k3s-Version nicht ermittelbar — --k3s-version angeben"

# Passwort-Hash. Ohne Passwort bleibt der Account gesperrt (nur SSH-Key).
if [[ -n "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD_HASH="$(openssl passwd -6 "$ADMIN_PASSWORD")"
else
  ADMIN_PASSWORD_HASH='!'
  echo "WARN: kein --admin-password — Konsolen-Login ist gesperrt, nur SSH-Key." >&2
fi

if [[ -n "$NODE_MAP" ]]; then
  [[ -f "$NODE_MAP" ]] || die "--node-map nicht gefunden: $NODE_MAP"
fi

# --- Quell-ISO besorgen -----------------------------------------------------
mkdir -p "$CACHE_DIR"
if [[ -z "$SOURCE_ISO" ]]; then
  BASE_URL="https://releases.ubuntu.com/${RELEASE}"
  info "Ermittle aktuelles Point-Release fuer Ubuntu ${RELEASE}"
  SUMS="$(curl -fsSL "${BASE_URL}/SHA256SUMS")" \
    || die "SHA256SUMS von ${BASE_URL} nicht abrufbar — Release ${RELEASE} korrekt?"
  # SHA256SUMS listet alle Point-Releases aufsteigend. Versionssortiert das
  # letzte nehmen — head -1 lieferte hier das aelteste (24.04.3 statt 24.04.4).
  ISO_NAME="$(echo "$SUMS" | awk '{print $2}' | tr -d '*' \
    | grep -E '^ubuntu-.*-live-server-amd64\.iso$' | sort -V | tail -1)"
  [[ -n "$ISO_NAME" ]] || die "kein live-server-amd64-ISO in ${BASE_URL}/SHA256SUMS"
  SOURCE_ISO="${CACHE_DIR}/${ISO_NAME}"
  EXPECTED_SHA="$(echo "$SUMS" | grep -F "$ISO_NAME" | awk '{print $1}' | head -1)"

  if [[ -f "$SOURCE_ISO" ]] && [[ "$SKIP_VERIFY" -eq 0 ]] \
     && echo "${EXPECTED_SHA}  ${SOURCE_ISO}" | sha256sum -c --status 2>/dev/null; then
    info "Quell-ISO bereits im Cache und intakt: ${SOURCE_ISO}"
  else
    info "Lade ${ISO_NAME} (~3 GB)"
    curl -fL --progress-bar -o "${SOURCE_ISO}.part" "${BASE_URL}/${ISO_NAME}"
    mv "${SOURCE_ISO}.part" "$SOURCE_ISO"
    if [[ "$SKIP_VERIFY" -eq 0 ]]; then
      info "Pruefe SHA256"
      echo "${EXPECTED_SHA}  ${SOURCE_ISO}" | sha256sum -c - >&2 \
        || die "SHA256 des heruntergeladenen ISO stimmt nicht"
    fi
  fi
else
  [[ -f "$SOURCE_ISO" ]] || die "--source-iso nicht gefunden: $SOURCE_ISO"
  info "Nutze vorhandenes ISO: ${SOURCE_ISO}"
fi

# --- Arbeitsverzeichnis -----------------------------------------------------
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/node-iso.XXXXXX")"
cleanup() {
  if [[ "$KEEP_WORKDIR" -eq 1 ]]; then
    echo "Arbeitsverzeichnis behalten: ${WORKDIR}" >&2
  else
    chmod -R u+w "$WORKDIR" 2>/dev/null || true
    rm -rf "$WORKDIR"
  fi
}
trap cleanup EXIT

ISO_ROOT="${WORKDIR}/iso"
BOOT_DIR="${WORKDIR}/BOOT"
mkdir -p "$ISO_ROOT" "$BOOT_DIR"

info "Entpacke ISO nach ${ISO_ROOT}"
# -extract_boot_images sichert MBR- und EFI-Image; ohne sie waere das neue ISO
# nur noch auf einem der beiden Boot-Pfade startbar.
xorriso -osirrox on -indev "$SOURCE_ISO" \
  -extract_boot_images "$BOOT_DIR" \
  -extract / "$ISO_ROOT" >/dev/null 2>&1 \
  || die "Entpacken fehlgeschlagen"
chmod -R u+w "$ISO_ROOT"

# --- Autoinstall-Daten einlegen ---------------------------------------------
NOCLOUD="${ISO_ROOT}/nocloud"
mkdir -p "$NOCLOUD"

info "Rendere user-data"
export ISO_LOCALE="$LOCALE" \
       ISO_KEYBOARD_LAYOUT="$KEYBOARD_LAYOUT" \
       ISO_TIMEZONE="$TIMEZONE" \
       ISO_HOSTNAME_FALLBACK="$HOSTNAME_FALLBACK" \
       ISO_ADMIN_USER="$ADMIN_USER" \
       ISO_ADMIN_PASSWORD_HASH="$ADMIN_PASSWORD_HASH" \
       ISO_SSH_ALLOW_PW="$([[ -n "$ADMIN_PASSWORD" ]] && echo true || echo false)" \
       ISO_SSH_PUBLIC_KEY="$SSH_PUBLIC_KEY" \
       ISO_PACKAGE_UPGRADE="$PACKAGE_UPGRADE" \
       ISO_SHUTDOWN_MODE="$SHUTDOWN_MODE"

envsubst '${ISO_LOCALE} ${ISO_KEYBOARD_LAYOUT} ${ISO_TIMEZONE} ${ISO_HOSTNAME_FALLBACK} ${ISO_ADMIN_USER} ${ISO_ADMIN_PASSWORD_HASH} ${ISO_SSH_ALLOW_PW} ${ISO_SSH_PUBLIC_KEY} ${ISO_PACKAGE_UPGRADE} ${ISO_SHUTDOWN_MODE}' \
  < "${AUTOINSTALL_DIR}/user-data.tmpl" > "${NOCLOUD}/user-data"

# meta-data muss existieren, darf aber leer sein — sonst findet die
# NoCloud-Datenquelle nichts und der Installer fragt doch interaktiv.
: > "${NOCLOUD}/meta-data"

cp "${AUTOINSTALL_DIR}/assign-identity.sh" "${NOCLOUD}/assign-identity.sh"
sed "s|__K3S_VERSION__|${K3S_VERSION}|g" \
  "${AUTOINSTALL_DIR}/k3s-join.sh" > "${NOCLOUD}/k3s-join.sh"
chmod 0755 "${NOCLOUD}/assign-identity.sh" "${NOCLOUD}/k3s-join.sh"

if [[ -n "$NODE_MAP" ]]; then
  cp "$NODE_MAP" "${NOCLOUD}/node-map"
  info "node-map: $(grep -cvE '^\s*(#|$)' "$NODE_MAP") Eintraege"
else
  printf '# leer — Hostnamen werden aus der MAC abgeleitet (ws-<mac-suffix>)\n' \
    > "${NOCLOUD}/node-map"
  echo "WARN: keine --node-map — die drei Nodes heissen ws-<mac-suffix>." >&2
fi

# --- GRUB auf Autoinstall umbiegen ------------------------------------------
# Das Semikolon MUSS in der grub.cfg als \; landen: GRUB trennt an einem
# nackten ';' die Kommandos, die Kernel-Zeile bricht dort ab und der Installer
# findet seine Datenquelle nicht — er fragt dann doch interaktiv nach.
# Die doppelten Backslashes hier sind fuer sed: sed macht daraus einen.
KCMDLINE='autoinstall ds=nocloud\\;s=/cdrom/nocloud/'

patch_grub() {
  local cfg="$1"
  [[ -f "$cfg" ]] || return 0
  # Alle casper-Kernel-Zeilen, nicht nur /casper/vmlinuz: Ubuntu 24.04 hat
  # zusaetzlich einen HWE-Eintrag (/casper/hwe-vmlinuz). Bleibt der ungepatcht,
  # landet man bei dessen Auswahl im interaktiven Installer.
  sed -i "\|/casper/[a-z-]*vmlinuz|{ /autoinstall/! s|\(/casper/[a-z-]*vmlinuz\)|\1 ${KCMDLINE}|; }" "$cfg"
  # Kurzer Timeout, erster Eintrag als Default: der Stick soll durchlaufen,
  # aber ein Mensch soll noch abbrechen koennen.
  if grep -q '^set timeout=' "$cfg"; then
    sed -i 's/^set timeout=.*/set timeout=5/' "$cfg"
  else
    sed -i '1i set timeout=5' "$cfg"
  fi
  if grep -q '^set default=' "$cfg"; then
    sed -i 's/^set default=.*/set default=0/' "$cfg"
  else
    sed -i '1i set default=0' "$cfg"
  fi
  info "GRUB gepatcht: ${cfg#$ISO_ROOT/}"
}
patch_grub "${ISO_ROOT}/boot/grub/grub.cfg"
patch_grub "${ISO_ROOT}/boot/grub/loopback.cfg"

# Fail-closed pruefen, was tatsaechlich in der Datei steht — nicht, was der
# sed-Aufruf gemeint hat. Genau hier verschwand der Backslash schon einmal
# unbemerkt, und das Ergebnis war ein ISO, das doch nach der Sprache fragt.
GRUB_CFG="${ISO_ROOT}/boot/grub/grub.cfg"
grep -qF 'autoinstall' "$GRUB_CFG" \
  || die "GRUB-Patch griff nicht — Kernelzeile in boot/grub/grub.cfg nicht erkannt"
grep -qF 'ds=nocloud\;s=/cdrom/nocloud/' "$GRUB_CFG" \
  || die "GRUB-Kernelzeile enthaelt kein maskiertes Semikolon — der Installer wuerde interaktiv nachfragen"
if grep -E '/casper/[a-z-]*vmlinuz' "$GRUB_CFG" | grep -qv 'autoinstall'; then
  die "mindestens eine Kernel-Zeile in grub.cfg blieb ohne autoinstall"
fi

# md5sum.txt: die geaenderten Dateien neu hashen, damit der optionale
# "Check disc for defects"-Eintrag nicht faelschlich Fehler meldet.
if [[ -f "${ISO_ROOT}/md5sum.txt" ]]; then
  grep -v -e './boot/grub/grub.cfg' -e './boot/grub/loopback.cfg' \
    "${ISO_ROOT}/md5sum.txt" > "${ISO_ROOT}/md5sum.txt.new" || true
  (
    cd "$ISO_ROOT"
    for f in ./boot/grub/grub.cfg ./boot/grub/loopback.cfg ./nocloud/*; do
      [[ -f "$f" ]] && md5sum "$f" >> md5sum.txt.new
    done
  )
  mv "${ISO_ROOT}/md5sum.txt.new" "${ISO_ROOT}/md5sum.txt"
fi

# --- Neu packen -------------------------------------------------------------
mkdir -p "$(dirname "$OUT_ISO")"
VOLID="UBUNTU-CLUSTER-NODE"

# xorriso benennt die extrahierten Boot-Images je nach Version unterschiedlich
# (bis ~1.5.4: 1-Boot-NoEmul.img / 2-Boot-NoEmul.img; ab 1.5.6:
# mbr_code_grub2.img / gpt_part2_efi.img). Deshalb Kandidaten durchgehen statt
# einen Namen anzunehmen — sonst bricht der Build auf einer anderen Distro ab.
find_boot_image() {
  local candidate
  for candidate in "$@"; do
    if [[ -s "${BOOT_DIR}/${candidate}" ]]; then
      echo "${BOOT_DIR}/${candidate}"
      return 0
    fi
  done
  return 1
}

MBR_IMG="$(find_boot_image mbr_code_grub2.img 1-Boot-NoEmul.img)" \
  || die "MBR-Boot-Image nicht gefunden in ${BOOT_DIR}: $(ls "$BOOT_DIR" | tr '\n' ' ')"
EFI_IMG="$(find_boot_image gpt_part2_efi.img eltorito_img2_uefi.img 2-Boot-NoEmul.img)" \
  || die "EFI-Boot-Image nicht gefunden in ${BOOT_DIR}: $(ls "$BOOT_DIR" | tr '\n' ' ')"

# El-Torito-Eintrag fuer UEFI verweist auf die angehaengte Partition; die
# Groesse muss in 512-Byte-Sektoren stimmen, sonst startet UEFI nicht.
EFI_SECTORS=$(( $(stat -c%s "$EFI_IMG") / 512 ))

info "Baue ${OUT_ISO} (MBR: ${MBR_IMG##*/}, EFI: ${EFI_IMG##*/}, ${EFI_SECTORS} Sektoren)"
(
  cd "$ISO_ROOT"
  xorriso -as mkisofs -r -V "$VOLID" \
    -o "$OUT_ISO" \
    --grub2-mbr "$MBR_IMG" \
    --protective-msdos-label \
    -partition_cyl_align off \
    -partition_offset 16 \
    --mbr-force-bootable \
    -append_partition 2 28732ac11ff8d211ba4b00a0c93ec93b "$EFI_IMG" \
    -appended_part_as_gpt \
    -iso_mbr_part_type a2a0d0ebe5b9334487c068b6b72699c7 \
    -c '/boot.catalog' \
    -b '/boot/grub/i386-pc/eltorito.img' \
      -no-emul-boot -boot-load-size 4 -boot-info-table --grub2-boot-info \
    -eltorito-alt-boot \
    -e '--interval:appended_partition_2:all::' \
      -no-emul-boot -boot-load-size "$EFI_SECTORS" \
    . >"${WORKDIR}/xorriso.log" 2>&1
) || {
  echo "--- xorriso-Ausgabe (letzte 20 Zeilen) ---" >&2
  tail -20 "${WORKDIR}/xorriso.log" >&2
  die "xorriso-Repack fehlgeschlagen"
}

sha256sum "$OUT_ISO" > "${OUT_ISO}.sha256"

cat >&2 <<EOF

Fertig: ${OUT_ISO}
  Groesse:   $(du -h "$OUT_ISO" | awk '{print $1}')
  SHA256:    $(awk '{print $1}' < "${OUT_ISO}.sha256")
  Admin:     ${ADMIN_USER} (Passwort-Login: $([[ -n "$ADMIN_PASSWORD" ]] && echo an || echo gesperrt))
  k3s-Join:  /usr/local/sbin/k3s-join.sh (${K3S_VERSION})

Auf einen Stick schreiben — ZIELGERAET PRUEFEN, der Befehl loescht es:
  lsblk -o NAME,SIZE,MODEL,TRAN
  sudo dd if=${OUT_ISO} of=/dev/sdX bs=4M status=progress conv=fsync

Der Stick installiert ohne Rueckfrage und loescht dabei die groesste Platte
der Maschine. GRUB wartet 5 Sekunden — das ist die einzige Abbruchgelegenheit.
EOF
