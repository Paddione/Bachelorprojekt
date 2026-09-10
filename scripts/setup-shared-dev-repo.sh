#!/usr/bin/env bash
# =============================================================================
# setup-shared-dev-repo.sh — geteilter Repo-Clone fuer patrick + gekko (T900104).
# =============================================================================
# Richtet auf der Work-VM (Debian 12, root) einen gemeinsamen Clone des
# Bachelorprojekt-Repos unter /srv/bachelorprojekt ein:
#   * Gruppe `dev` + beide Nutzer (DEV_USERS) in der Gruppe
#   * git clone --config core.sharedRepository=group (einmalig)
#   * setgid + Default-ACL (setfacl -d -m g::rwX), damit neue Dateien die
#     Gruppen-Schreibrechte erben; umask-002-Fallback in .bashrc/.profile
#   * git-crypt: Key bereitstellen + Clone entsperren
#   * Repo-Hooks (core.hooksPath=.githooks) + merge.ours-Driver
#   * main pull-only: systemd-Timer mit `git pull --ff-only` (kein Clobbern)
#   * flock-Wrapper /usr/local/sbin/repo-install (serialisierte npm/pnpm-Installs)
#
# Idempotent: jeder Schritt ist ein No-Op, wenn er bereits erledigt ist.
# Als root ausfuehren:
#     sudo bash scripts/setup-shared-dev-repo.sh
#
# git-crypt-Key: Auf einer entsperrten Maschine exportieren und bereitstellen:
#     git-crypt export-key bp-secrets.key
#     scp bp-secrets.key root@<work-vm>:/root/bp-secrets.key
#     GIT_CRYPT_KEY=/root/bp-secrets.key sudo bash scripts/setup-shared-dev-repo.sh
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Paddione/Bachelorprojekt.git}"
CLONE_DIR="${CLONE_DIR:-/srv/bachelorprojekt}"
DEV_GROUP="${DEV_GROUP:-dev}"
DEV_USERS="${DEV_USERS:-patrick gekko}"
GIT_CRYPT_KEY="${GIT_CRYPT_KEY:-}"
KEY_FILE="${CLONE_DIR}/.git-crypt-key"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "als root ausfuehren (sudo)."

# ---- 1. Gruppe `dev` + Nutzer ------------------------------------------------
if ! getent group "$DEV_GROUP" >/dev/null; then
  log "Gruppe $DEV_GROUP anlegen"
  groupadd "$DEV_GROUP"
else
  log "Gruppe $DEV_GROUP existiert bereits"
fi
for u in $DEV_USERS; do
  id "$u" >/dev/null 2>&1 || die "Nutzer '$u' existiert nicht (cloud-init legt ihn an)."
  if ! id -nG "$u" | grep -qw "$DEV_GROUP"; then
    usermod -aG "$DEV_GROUP" "$u"
    log "  $u zu Gruppe $DEV_GROUP hinzugefuegt"
  fi
done

# ---- 2. Shared Clone ---------------------------------------------------------
if [[ ! -d "$CLONE_DIR/.git" ]]; then
  log "Shared Clone anlegen: git clone --config core.sharedRepository=group $REPO_URL"
  git clone --config core.sharedRepository=group "$REPO_URL" "$CLONE_DIR"
else
  log "Clone existiert bereits: $CLONE_DIR"
fi
git -C "$CLONE_DIR" config core.sharedRepository group   # idempotent

# ---- 3. Gruppenrechte: setgid + Default-ACL ----------------------------------
log "Gruppenrechte setzen (g+rwX, setgid, Default-ACL)"
chmod -R g+rwX "$CLONE_DIR"
chmod g+s "$CLONE_DIR" "$CLONE_DIR/.git" "$CLONE_DIR/.git/objects"
if command -v setfacl >/dev/null 2>&1; then
  setfacl -m g::rwX "$CLONE_DIR"
  setfacl -d -m g::rwX "$CLONE_DIR"
else
  log "  setfacl nicht verfuegbar — umask-002-Fallback greift (Schritt 4)"
fi

# ---- 4. umask 002 pro Nutzer (idempotent) ------------------------------------
for u in $DEV_USERS; do
  for rc in "/home/$u/.bashrc" "/home/$u/.profile"; do
    [[ -f "$rc" ]] || continue
    if ! grep -q '^umask 002' "$rc"; then
      echo 'umask 002' >> "$rc"
      log "  umask 002 in $rc ergaenzt"
    fi
  done
done

# ---- 5. git-crypt: Key bereitstellen + Clone entsperren ----------------------
if git -C "$CLONE_DIR" crypt status >/dev/null 2>&1; then
  log "git-crypt bereits entsperrt"
elif [[ -n "$GIT_CRYPT_KEY" && -f "$GIT_CRYPT_KEY" ]]; then
  install -o root -g "$DEV_GROUP" -m 640 "$GIT_CRYPT_KEY" "$KEY_FILE"
  git -C "$CLONE_DIR" crypt unlock "$KEY_FILE"
  log "git-crypt entsperrt (Key $KEY_FILE, 640 root:$DEV_GROUP)"
elif [[ -f "$KEY_FILE" ]]; then
  git -C "$CLONE_DIR" crypt unlock "$KEY_FILE"
  log "git-crypt entsperrt (bestehender Key $KEY_FILE)"
elif git-crypt export-key "$KEY_FILE" 2>/dev/null; then
  # Nur moeglich, wenn das Skript auf einer Maschine mit entsperrtem Clone laeuft.
  chown root:"$DEV_GROUP" "$KEY_FILE"; chmod 640 "$KEY_FILE"
  git -C "$CLONE_DIR" crypt unlock "$KEY_FILE"
  log "git-crypt entsperrt (Key lokal exportiert)"
else
  die "git-crypt-Key fehlt. Auf einer entsperrten Maschine exportieren und bereitstellen:
    git-crypt export-key bp-secrets.key
    scp bp-secrets.key root@<work-vm>:/root/bp-secrets.key
  Dann erneut: GIT_CRYPT_KEY=/root/bp-secrets.key sudo bash scripts/setup-shared-dev-repo.sh"
fi

# ---- 6. Repo-Hooks + merge.ours-Driver (Repo-Konvention) ---------------------
if [[ -d "$CLONE_DIR/.githooks" ]]; then
  git -C "$CLONE_DIR" config core.hooksPath .githooks
  log "core.hooksPath=.githooks gesetzt"
fi
git -C "$CLONE_DIR" config merge.ours.driver true
log "merge.ours.driver=true registriert"

# ---- 7. ff-only-Timer (main pull-only, kein Clobbern) ------------------------
cat > /etc/systemd/system/bachelorprojekt-pull.service <<'UNIT'
[Unit]
Description=Pull Bachelorprojekt main (ff-only) in the shared clone
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/git -C /srv/bachelorprojekt pull --ff-only
UNIT
cat > /etc/systemd/system/bachelorprojekt-pull.timer <<'UNIT'
[Unit]
Description=Periodic ff-only pull of the shared Bachelorprojekt clone

[Timer]
OnCalendar=*-*-* 06,12,18,22:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now bachelorprojekt-pull.timer
log "ff-only-Timer aktiv (06/12/18/22 Uhr; divergiert der Baum, schlaegt der Pull laut fehl)"

# ---- 8. flock-Wrapper fuer npm/pnpm-Installs ---------------------------------
cat > /usr/local/sbin/repo-install <<'WRAPPER'
#!/usr/bin/env bash
# repo-install — flock-serialisierter Install im geteilten Clone (T900104).
# Schuetzt node_modules vor parallelen npm/pnpm-Installs beider Nutzer.
set -euo pipefail
LOCK=/var/lock/bachelorprojekt-install
COMPONENT="${1:-root}"
exec 9>"$LOCK"
flock 9
case "$COMPONENT" in
  root)    (cd /srv/bachelorprojekt && npm install) ;;
  brett)   (cd /srv/bachelorprojekt/components/brett && npm install) ;;
  website) (cd /srv/bachelorprojekt/components/website && pnpm install) ;;
  *) echo "usage: repo-install [root|brett|website]" >&2; exit 1 ;;
esac
WRAPPER
chmod +x /usr/local/sbin/repo-install
log "flock-Wrapper /usr/local/sbin/repo-install installiert (npm/pnpm serialisiert)"

# ---- 9. Endausgabe -----------------------------------------------------------
cat <<EOF

$(log "Fertig. Shared Clone: $CLONE_DIR (Gruppe $DEV_GROUP, git-crypt entsperrt).")

Naechste Schritte (pro Nutzer, jeweils im eigenen Login):
  1. gh auth login          # Browser/Device-Flow — gh braucht ein eigenes Token
  2. git config --global user.name  "<Name>"
     git config --global user.email "<email>"
  3. Pruefen: git -C $CLONE_DIR crypt status   # environments/.secrets/** entsperrt
  4. Install: repo-install root                # npm install (flock-serialisiert)
EOF