#!/usr/bin/env bash
# Deploy der LM-Studio-Startup-Scripts auf PK-L-1 und PK-Tablet.
# Verbindung laeuft ueber die Host-Portproxy-Bruecke (127.0.0.1:2201/2202),
# Ziele und Key stehen in ~/.ssh/config (Aliase pk-l-1 / pk-tablet).
#
# Aufruf:
#   deploy-to-devices.sh            # beide Geraete
#   deploy-to-devices.sh pk-l-1     # nur ein Geraet
#
# schtasks wird NICHT direkt ueber die cmd-Remote-Shell aufgerufen (Quoting
# zerfaellt an Leerzeichen); stattdessen laeuft register-autostart.ps1 auf
# dem Geraet (File-Aufruf ohne Leerzeichen = cmd-sicher).
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGETS=("${@:-pk-l-1 pk-tablet}")

deploy_one() {
  local name="$1" script="$2"
  echo "=== $name ($script) ==="
  ssh -o BatchMode=yes "$name" \
    'powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path C:\pk-device | Out-Null"' \
    && echo "  C:\\pk-device ok"
  scp -o BatchMode=yes "$SCRIPTS_DIR/$script" "$SCRIPTS_DIR/register-autostart.ps1" "$name:C:/pk-device/" \
    && echo "  $script + register-autostart.ps1 kopiert"
  ssh -o BatchMode=yes "$name" \
    "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\pk-device\\register-autostart.ps1 -ScriptName $script" \
    && echo "  Autostart-Task 'PK-Startup-LLM' registriert (onlogon)"
}

for t in $TARGETS; do
  case "$t" in
    pk-l-1)    deploy_one pk-l-1    pk-l-1-startup.ps1 ;;
    pk-tablet) deploy_one pk-tablet pk-tablet-startup.ps1 ;;
    *) echo "Unbekanntes Ziel: $t (pk-l-1 | pk-tablet)"; exit 1 ;;
  esac
done

echo ""
echo "Fertig. Verifikation: http://localhost:18235/v1/models muss beide Slots zeigen."
