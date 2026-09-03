#!/usr/bin/env bash
# setup-autostart.sh — Richtet den opencode serve Autostart in .bashrc ein.
#
# Usage: bash scripts/setup-autostart.sh [install|remove|status]
#
# Fügt die opencode-serve-Block in ~/.bashrc ein (oder entfernt ihn).
# Das Skript ist idempotent — mehrfacher Aufruf erzeugt keine Duplikate.

set -euo pipefail

REPO_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
BASHRC="$HOME/.bashrc"

# Password kann mit --password <pw> überschrieben werden, sonst Default:
OPCODE_PASSWORD="170591pk"
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --password) OPCODE_PASSWORD="$2"; shift 2 ;;
    *) shift ;;
  esac
done

_BLOCK="$(cat <<BLOCK
# ── Autostart opencode serve (HTTP-Server für Skripte/IDE-Plugins) ────────────
# Startet den opencode-Server automatisch, wenn er nicht schon läuft.
# Setzt OPENCODE_SERVER_PASSWORD vor dem ersten Start auf einen eigenen Wert.
_PID_FILE="\$HOME/.local/share/opencode/opencode-serve.pid"
if [ ! -f "\$_PID_FILE" ] || ! kill -0 "\$(cat "\$_PID_FILE" 2>/dev/null)" 2>/dev/null; then
  export OPENCODE_SERVER_PASSWORD="${OPCODE_PASSWORD}"
  bash "${REPO_DIR}/scripts/opencode-serve.sh" start --port 4100 >/dev/null 2>&1 &
  disown 2>/dev/null
fi
# ── Autostart opencode serve (End)
BLOCK
)"

cmd_install() {
  echo "Füge opencode-serve Autostart zu $BASHRC hinzu …"

  # Prüfen ob .bashrc existiert, sonst erstellen
  if [ ! -f "$BASHRC" ]; then
    touch "$BASHRC"
  fi

  # .bash_profile sollte .bashrc source-en — prüfen
  BASH_PROFILE="$HOME/.bash_profile"
  if [ -f "$BASH_PROFILE" ]; then
    if ! grep -qF '.bashrc' "$BASH_PROFILE" 2>/dev/null; then
      echo "Füge .bashrc-Source zu .bash_profile hinzu …"
      {
        echo ""
        echo "# Source .bashrc if it exists"
        echo 'if [ -f "$HOME/.bashrc" ]; then'
        echo '  . "$HOME/.bashrc"'
        echo 'fi'
      } >> "$BASH_PROFILE"
    else
      echo ".bash_profile source bereits .bashrc — OK."
    fi
  else
    echo "Keine .bash_profile gefunden — .bashrc wird direkt von bash geladen."
  fi

  # Alten Block entfernen, wenn vorhanden
  if grep -qF "Autostart opencode serve" "$BASHRC" 2>/dev/null; then
    echo "Ersetze bestehenden Autostart-Block …"
    local tmp
    tmp="$(mktemp)"
    awk '
      /Autostart opencode serve \(HTTP/ { skip=1; next }
      /Autostart opencode serve \(End\)/ { skip=0; next }
      !skip { print }
    ' "$BASHRC" > "$tmp"
    mv "$tmp" "$BASHRC"
  else
    echo "Kein bestehender Block gefunden — füge neuen Block hinzu."
  fi

  {
    echo ""
    echo "$_BLOCK"
  } >> "$BASHRC"

  echo "Autostart eingerichtet. Starte neu oder führe 'source ~/.bashrc' aus."
}

cmd_remove() {
  if ! grep -qF "Autostart opencode serve" "$BASHRC" 2>/dev/null; then
    echo "Autostart nicht in .bashrc gefunden — nichts zu entfernen."
    return 0
  fi

  echo "Entferne opencode-serve Autostart aus .bashrc …"

  local tmp
  tmp="$(mktemp)"
  # Lösche den gesamten Block (Marker-Zeilen inklusive)
  awk '
    /Autostart opencode serve \(HTTP/ { skip=1; next }
    /Autostart opencode serve \(End\)/ { skip=0; next }
    !skip { print }
  ' "$BASHRC" > "$tmp"
  mv "$tmp" "$BASHRC"

  echo "Autostart entfernt."
}

cmd_status() {
  if grep -qF "Autostart opencode serve" "$BASHRC" 2>/dev/null; then
    echo "Autostart ist in .bashrc konfiguriert."
    grep -A 7 "Autostart opencode serve" "$BASHRC" 2>/dev/null | head -8
  else
    echo "Autostart ist NICHT konfiguriert."
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

case "${1:-install}" in
  install)  cmd_install ;;
  remove)   cmd_remove ;;
  status)   cmd_status ;;
  *)
    echo "Usage: $0 {install|remove|status}" >&2
    exit 1
    ;;
esac
