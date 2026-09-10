#!/bin/sh
# docker/dev-shell/entrypoint.sh — Startpfad des dev-shell-Containers [T900108]
# Kein Paketmanager, kein Netzzugriff: nur Host-Key, Keys, sshd.
# dev-shell ist optional: ein fehlender Key darf den Container nicht in einen
# CrashLoop treiben, deshalb Warnung statt Abbruch.
set -eu
HOSTKEY_DIR=/home/dev/.ssh-host
KEY_SRC=/etc/dev-shell/keys
KEY_DST=/var/lib/dev-shell/authorized_keys

# Frisches Home-PVC: Shell-Grundkonfiguration aus /etc/skel, ohne Fehlerabbruch.
if [ ! -f /home/dev/.bashrc ]; then
  cp -R /etc/skel/. /home/dev/ 2>/dev/null || echo "dev-shell: /etc/skel nicht kopiert" >&2
fi

mkdir -p "$HOSTKEY_DIR"
chmod 700 "$HOSTKEY_DIR"
if [ ! -s "$HOSTKEY_DIR/ssh_host_ed25519_key" ]; then
  ssh-keygen -q -t ed25519 -N '' -f "$HOSTKEY_DIR/ssh_host_ed25519_key"
fi
chmod 600 "$HOSTKEY_DIR/ssh_host_ed25519_key"

found=0
for u in patrick gekko; do
  if [ -s "$KEY_SRC/$u" ]; then
    cp "$KEY_SRC/$u" "$KEY_DST/$u"
    chmod 600 "$KEY_DST/$u"
    found=$((found + 1))
  else
    echo "dev-shell: WARNUNG kein Key fuer $u unter $KEY_SRC - Login $u uebersprungen" >&2
    rm -f "$KEY_DST/$u"
  fi
done
if [ "$found" -eq 0 ]; then
  echo "dev-shell: WARNUNG keine authorized_keys vorhanden - sshd startet, aber niemand kann sich anmelden" >&2
fi

exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config
