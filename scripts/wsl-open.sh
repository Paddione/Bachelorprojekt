#!/usr/bin/env bash
# Status: Aktiv behalten. Wird von `scripts/vda/brainstorm.sh` (Z. 124, 150) aufgerufen —
# dort allerdings als `$SELF_DIR/wsl-open.sh`, also `scripts/vda/wsl-open.sh`, das es nicht
# gibt; der Aufruf laeuft ins Leere und wird von `|| true` geschluckt. Der Pfadfehler wird
# hier nur festgehalten, nicht behoben (Laufzeitverhalten -> eigenes Ticket).
# Der Name ist historisch: das Skript oeffnet URLs im Windows-Default-Browser aus Git Bash.
# Native Windows URL opener (replaces WSL wsl-open.sh)
# Opens a URL in the default Windows browser from Git Bash.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <url>" >&2
  exit 1
fi

url="$1"

# Prefer powershell; fall back to cmd.exe
if powershell.exe -Command "Start-Process '$url'" 2>/dev/null; then
  :
elif cmd.exe /c "start" "" "$url" 2>/dev/null; then
  :
else
  echo "→ Browser-Auto-Open fehlgeschlagen; URL manuell öffnen: $url" >&2
fi
