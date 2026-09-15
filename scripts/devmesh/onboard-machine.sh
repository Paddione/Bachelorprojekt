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

# --- machine checks ---
TOOLS=(git-crypt gh task node pnpm kubectl)

missing_tools() {
  local t
  for t in "${TOOLS[@]}"; do command -v "$t" >/dev/null 2>&1 || printf '%s ' "$t"; done
}

step_clone() {
  if [ -d "$DIR/.git" ]; then ok "clone $DIR"; return 0; fi
  if [ "$MODE" = verify ]; then fail clone "kein Clone unter $DIR"; return 1; fi
  if ! git clone -q "$REPO_URL" "$DIR"; then fail clone "git clone $REPO_URL fehlgeschlagen"; return 1; fi
  ok "clone $DIR (neu)"
}

step_toolchain() {
  local missing
  missing="$(missing_tools)"
  if [ -z "$missing" ]; then ok "toolchain"; return 0; fi
  if [ "$MODE" = verify ]; then fail toolchain "fehlt: $missing"; return 0; fi
  say "toolchain fehlt ($missing), install-dev-tools.sh fuer $(id -un)"
  if ! sudo env FORCE=1 SKIP_K3D_GO=1 bash "$DIR/scripts/install-dev-tools.sh"; then
    fail toolchain "install-dev-tools.sh fehlgeschlagen"; return 0
  fi
  missing="$(missing_tools)"
  if [ -z "$missing" ]; then ok "toolchain (installiert)"; else fail toolchain "nach Installation fehlt: $missing (neu anmelden?)"; fi
}

hooks_ok() {
  (cd "$DIR" && bash scripts/check-hooks-path.sh >/dev/null 2>&1) \
    && [ "$(git -C "$DIR" config --get merge.ours.driver 2>/dev/null || true)" = "true" ]
}

step_hooks() {
  if hooks_ok; then ok "hooks + merge.ours"; return 0; fi
  if [ "$MODE" = verify ]; then fail hooks "core.hooksPath oder merge.ours.driver fehlt"; return 0; fi
  task -d "$DIR" secrets:install-hooks >/dev/null || true
  if hooks_ok; then ok "hooks + merge.ours (installiert)"; else fail hooks "task secrets:install-hooks hat nicht gewirkt"; fi
}

step_identity() {
  local name email
  name="$(git -C "$DIR" config --get user.name 2>/dev/null || true)"
  email="$(git -C "$DIR" config --get user.email 2>/dev/null || true)"
  if [ "$MODE" = setup ] && [ -n "$GIT_NAME" ] && [ "$GIT_NAME" != "$name" ]; then
    git -C "$DIR" config --local user.name "$GIT_NAME"; name="$GIT_NAME"
  fi
  if [ "$MODE" = setup ] && [ -n "$GIT_EMAIL" ] && [ "$GIT_EMAIL" != "$email" ]; then
    git -C "$DIR" config --local user.email "$GIT_EMAIL"; email="$GIT_EMAIL"
  fi
  if [ -z "$name" ] || [ -z "$email" ]; then fail git-identity "user.name/user.email leer, --name und --email angeben"; return 0; fi
  if [ -n "$GIT_NAME" ] && [ "$GIT_NAME" != "$name" ]; then fail git-identity "user.name ist '$name', erwartet '$GIT_NAME'"; return 0; fi
  if [ -n "$GIT_EMAIL" ] && [ "$GIT_EMAIL" != "$email" ]; then fail git-identity "user.email ist '$email', erwartet '$GIT_EMAIL'"; return 0; fi
  ok "git-identity $name <$email>"
}

step_gh() {
  if gh auth status >/dev/null 2>&1; then ok "gh-auth"; else fail gh-auth "keine gh-Anmeldung (gh auth login)"; fi
}

# D4: Ergebnis pruefen statt dem Exit-Code von git-crypt unlock zu vertrauen.
secret_probe() {
  local f
  while IFS= read -r f; do
    if bash "$DIR/scripts/git-crypt-guard.sh" is-managed "$f"; then printf '%s\n' "$f"; return 0; fi
  done < <(git -C "$DIR" ls-files -- 'environments/.secrets/')
  return 1
}

step_decrypt() {
  local probe
  if ! probe="$(secret_probe)" || [ ! -f "$DIR/$probe" ]; then
    fail decryption "keine getrackte Datei unter environments/.secrets/"; return 0
  fi
  if ! bash "$DIR/scripts/git-crypt-guard.sh" is-encrypted "$DIR/$probe"; then ok "decryption ($probe)"; return 0; fi
  if [ "$MODE" = verify ]; then fail decryption "$probe ist verschluesselt"; return 0; fi
  if ! (cd "$DIR" && git-crypt unlock "$KEY_FILE"); then fail decryption "git-crypt unlock fehlgeschlagen"; return 0; fi
  if bash "$DIR/scripts/git-crypt-guard.sh" is-encrypted "$DIR/$probe"; then
    fail decryption "unlock endete ohne Fehler, $probe bleibt verschluesselt (falscher Key?)"
  else
    ok "decryption ($probe, entsperrt)"
  fi
}

step_devmesh() {
  [ "$WITH_DEVMESH" = 1 ] || return 0
  if kubectl config get-contexts devmesh >/dev/null 2>&1; then ok "devmesh-context"; return 0; fi
  if [ "$MODE" = verify ]; then fail devmesh-context "Kubeconfig-Context devmesh fehlt"; return 0; fi
  if task -d "$DIR" devmesh:kubeconfig && kubectl config get-contexts devmesh >/dev/null 2>&1; then
    ok "devmesh-context (geholt)"
  else
    fail devmesh-context "task devmesh:kubeconfig fehlgeschlagen oder noch nicht vorhanden (SP-2, T900117)"
  fi
}

# --- main ---
preflight
check_key_file
check_wsl_networking
if step_clone; then
  step_toolchain
  step_hooks
  step_identity
  step_gh
  step_decrypt
  step_devmesh
fi
finish
