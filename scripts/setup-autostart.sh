#!/usr/bin/env bash
# setup-autostart.sh — Richtet den opencode serve Autostart in .bashrc ein.
#
# Usage: bash scripts/setup-autostart.sh [install|remove|status] [--password <pw>]
#
# Das Server-Passwort steht NIE im Repo und NIE in der .bashrc. Vorrang:
#   1. $OPENCODE_SERVER_PASSWORD (Environment),
#   2. Secret-Datei ${XDG_DATA_HOME:-$HOME/.local/share}/opencode/.server_password (Mode 600).
# install erzeugt die Secret-Datei (zufällig), sofern sie fehlt.
# --password <pw> legt <pw> in der Secret-Datei ab.
# Fügt die opencode-serve-Block in ~/.bashrc ein (oder entfernt ihn).
# Das Skript ist idempotent — mehrfacher Aufruf erzeugt keine Duplikate.

set -euo pipefail

REPO_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
BASHRC="$HOME/.bashrc"
SECRET_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/.server_password"

# --password <pw> schreibt <pw> in die Secret-Datei (wird nie in .bashrc eingebettet).
PASSWORD_ARG=""
CMD="install"
while [[ $# -gt 0 ]]; do
  case "$1" in
    install|remove|status) CMD="$1"; shift ;;
    --password) PASSWORD_ARG="$2"; shift 2 ;;
    --password=*) PASSWORD_ARG="${1#*=}"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

ensure_secret() {
  if [[ -n "$PASSWORD_ARG" ]]; then
    mkdir -p "$(dirname "$SECRET_FILE")"
    printf '%s' "$PASSWORD_ARG" > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
    echo "Passwort in $SECRET_FILE abgelegt (Mode 600)."
  elif [[ ! -f "$SECRET_FILE" ]]; then
    mkdir -p "$(dirname "$SECRET_FILE")"
    openssl rand -base64 24 | tr -d '\n' > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
    echo "Neues Zufalls-Passwort in $SECRET_FILE erzeugt (Mode 600)."
  fi
}

_BLOCK="$(cat <<'BLOCK'
# ── Autostart opencode serve (HTTP-Server für Skripte/IDE-Plugins) ────────────
# Startet den opencode-Server automatisch, wenn er nicht schon läuft.
# Passwort: $OPENCODE_SERVER_PASSWORD (Env) oder Secret-Datei (Mode 600) — nie im Repo.
_PID_FILE="$HOME/.local/share/opencode/opencode-serve.pid"
_SECRET_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/.server_password"
if [ ! -f "$_PID_FILE" ] || ! kill -0 "$(cat "$_PID_FILE" 2>/dev/null)" 2>/dev/null; then
  if [ -z "${OPENCODE_SERVER_PASSWORD:-}" ] && [ -f "$_SECRET_FILE" ]; then
    export OPENCODE_SERVER_PASSWORD="$(cat "$_SECRET_FILE")"
  fi
  bash "__REPO_DIR__/scripts/opencode-serve.sh" start --port 4100 >/dev/null 2>&1 &
  disown 2>/dev/null
fi
# ── Autostart opencode serve (End)
BLOCK
)"
_BLOCK="${_BLOCK//__REPO_DIR__/$REPO_DIR}"

cmd_install() {
  echo "Füge opencode-serve Autostart zu $BASHRC hinzu …"
  ensure_secret

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
    grep -A 9 "Autostart opencode serve" "$BASHRC" 2>/dev/null | head -10
  else
    echo "Autostart ist NICHT konfiguriert."
  fi
  if [[ -f "$SECRET_FILE" ]]; then
    echo "Secret-Datei: $SECRET_FILE (vorhanden, Mode $(stat -c %a "$SECRET_FILE" 2>/dev/null || echo ?))."
  else
    echo "Secret-Datei: $SECRET_FILE fehlt (wird bei install erzeugt)."
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

case "$CMD" in
  install)  cmd_install ;;
  remove)   cmd_remove ;;
  status)   cmd_status ;;
  *)
    echo "Usage: $0 {install|remove|status} [--password <pw>]" >&2
    exit 1
    ;;
esac
