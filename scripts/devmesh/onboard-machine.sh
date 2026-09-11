#!/usr/bin/env bash
# scripts/devmesh/onboard-machine.sh — Dev-Maschine (WSL) arbeitsfaehig machen und pruefen [T900119]
#
# Laeuft in der WSL-Distro als normaler Benutzer; sudo nur fuer install-dev-tools.sh.
# Ablauf, Key-Transport und Register: docs/runbooks/git-crypt-key-distribution.md
#
# Usage:
#   onboard-machine.sh [--verify] [--dir DIR] [--repo-url URL] [--key-file PATH]
#                      [--name NAME] [--email EMAIL] [--with-devmesh]
#
#   --verify        nur pruefen, nichts aendern
#   --dir           Clone-Verzeichnis             (Default: $HOME/Bachelorprojekt)
#   --repo-url      Quelle fuer einen neuen Clone (Default: HTTPS-URL von GitHub)
#   --key-file      symmetrischer git-crypt-Key   (Default: $HOME/.config/git-crypt/bachelorprojekt.key)
#   --name/--email  git-Identitaet des Clones
#   --with-devmesh  zusaetzlich Kubeconfig-Context devmesh holen bzw. pruefen
#
# Exit: 0 arbeitsfaehig, 1 mindestens eine Pruefung fehlgeschlagen (Name im Output),
#       2 Vorbedingung fehlt (keine WSL, kein git, Keydatei fehlt/unlesbar, Repo unerreichbar)
set -euo pipefail

MODE=setup
DIR="$HOME/Bachelorprojekt"
REPO_URL="https://github.com/Paddione/Bachelorprojekt.git"
KEY_FILE="$HOME/.config/git-crypt/bachelorprojekt.key"
GIT_NAME=""
GIT_EMAIL=""
WITH_DEVMESH=0
FAILED=()

say()  { printf '[onboard] %s\n' "$*"; }
ok()   { printf '[onboard] OK    %s\n' "$*"; }
fail() { printf '[onboard] FAIL  %s: %s\n' "$1" "$2" >&2; FAILED+=("$1"); }
die()  { printf '[onboard] PRECONDITION: %s\n' "$*" >&2; exit 2; }
need() { [ "$2" -ge 2 ] || die "$1 braucht einen Wert"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --verify)       MODE=verify ;;
    --dir)          need "$1" $#; DIR="$2"; shift ;;
    --repo-url)     need "$1" $#; REPO_URL="$2"; shift ;;
    --key-file)     need "$1" $#; KEY_FILE="$2"; shift ;;
    --name)         need "$1" $#; GIT_NAME="$2"; shift ;;
    --email)        need "$1" $#; GIT_EMAIL="$2"; shift ;;
    --with-devmesh) WITH_DEVMESH=1 ;;
    -h|--help)      sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              die "unbekannte Option: $1" ;;
  esac
  shift
done

# Exit 2: ohne diese Punkte ist keine Pruefung aussagekraeftig.
preflight() {
  local url="$REPO_URL"
  command -v wslinfo >/dev/null 2>&1 || die "keine WSL-Distro (wslinfo fehlt)"
  command -v git >/dev/null 2>&1 || die "git fehlt"
  [ -e "$KEY_FILE" ] || die "Keydatei fehlt: $KEY_FILE"
  if [ -d "$DIR/.git" ]; then url="$(git -C "$DIR" remote get-url origin)"; fi
  git ls-remote "$url" HEAD >/dev/null 2>&1 || die "Repo nicht erreichbar: $url"
}

# D6: fremder Eigentuemer bricht ab, bevor irgendetwas geaendert wird.
check_key_file() {
  local owner mode
  owner="$(stat -c '%u' "$KEY_FILE")"
  if [ "$owner" != "$(id -u)" ]; then
    printf '[onboard] FAIL  key-owner: %s gehoert uid %s, nicht %s (Datei unveraendert)\n' \
      "$KEY_FILE" "$owner" "$(id -u)" >&2
    exit 1
  fi
  [ -r "$KEY_FILE" ] || die "Keydatei nicht lesbar: $KEY_FILE"
  mode="$(stat -c '%a' "$KEY_FILE")"
  if [ "$mode" = "600" ]; then ok "key-mode 600"; return 0; fi
  if [ "$MODE" = verify ]; then fail key-mode "Modus $mode statt 600"; return 0; fi
  chmod 600 "$KEY_FILE"
  say "key-mode korrigiert: $mode -> 600 ($KEY_FILE)"
}

# wslinfo meldet den laufenden Modus; .wslconfig kann geaendert, aber noch nicht aktiv sein.
check_wsl_networking() {
  local m
  m="$(wslinfo --networking-mode 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$m" = "mirrored" ]; then
    ok "wsl-networking mirrored"
  else
    fail wsl-networking "Modus '${m:-unbekannt}', erwartet mirrored (.wslconfig, danach wsl --shutdown)"
  fi
}

finish() {
  if [ "${#FAILED[@]}" -gt 0 ]; then
    printf '[onboard] %s Pruefung(en) fehlgeschlagen: %s\n' "${#FAILED[@]}" "${FAILED[*]}" >&2
    exit 1
  fi
  say "Maschine arbeitsfaehig ($MODE)"
  exit 0
}

# --- main ---
preflight
check_key_file
check_wsl_networking
finish
