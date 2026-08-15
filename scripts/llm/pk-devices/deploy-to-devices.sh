#!/usr/bin/env bash
# Deploy der LM-Studio-Startup-Scripts auf PK-Tablet und PK-L-1 (nach SSH-Bootstrap).
# Aufruf: deploy-to-devices.sh <user> <ip-tablet> <ip-laptop>
#   <user>        Windows-Benutzername (Ausgabe des pk-ssh-bootstrap.ps1)
#   <ip-tablet>   IP des PK-Tablet
#   <ip-laptop>   IP des PK-L-1
set -euo pipefail

USER_WIN="${1:?Windows-Username fehlt (Bootstrap-Ausgabe 'ssh <user>@<ip>')}"
IP_TABLET="${2:?IP des PK-Tablet fehlt}"
IP_LAPTOP="${3:?IP des PK-L-1 fehlt}"

KEY="$HOME/.ssh/pk-devices"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

# SSH-Config-Eintraege (fuer spaetere Wartung)
ssh_config_block() {
  cat <<EOF

Host pk-tablet pk-l-1
    User $USER_WIN
    IdentityFile $KEY
    StrictHostKeyChecking accept-new

Host pk-tablet
    HostName $IP_TABLET

Host pk-l-1
    HostName $IP_LAPTOP
EOF
}
if ! grep -q '^Host pk-tablet$' "$HOME/.ssh/config" 2>/dev/null; then
  ssh_config_block >> "$HOME/.ssh/config"
  echo "ssh config: Eintraege fuer pk-tablet/pk-l-1 angelegt."
else
  echo "ssh config: Eintraege existieren bereits (nicht ueberschrieben)."
fi

deploy_one() {
  local name="$1" ip="$2" script="$3"
  echo "=== $name ($ip) ==="
  ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=5 "$USER_WIN@$ip" \
    'powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path C:\pk-device | Out-Null"' \
    && echo "  Verzeichnis C:\pk-device ok"
  scp -i "$KEY" -o BatchMode=yes "$SCRIPTS_DIR/$script" "$USER_WIN@$ip:C:/pk-device/" \
    && echo "  $script kopiert"
  ssh -i "$KEY" -o BatchMode=yes "$USER_WIN@$ip" \
    "schtasks /create /tn 'PK-Startup-LLM' /tr 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\\pk-device\\$script' /sc onlogon /f" \
    && echo "  Autostart-Task 'PK-Startup-LLM' registriert (onlogon)"
}

deploy_one "pk-tablet" "$IP_TABLET" "pk-tablet-startup.ps1"
deploy_one "pk-l-1"   "$IP_LAPTOP" "pk-l-1-startup.ps1"

echo ""
echo "Fertig. Verifikation: http://localhost:18235/v1/models muss beide Slots zeigen."
