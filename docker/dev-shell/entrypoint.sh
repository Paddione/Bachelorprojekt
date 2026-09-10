#!/bin/sh
# docker/dev-shell/entrypoint.sh — Startpfad des dev-shell-Containers [T900108]
# Kein Paketmanager, kein Netzzugriff: nur Host-Key, Keys, sshd.
set -eu
HOSTKEY_DIR=/home/dev/.ssh-host
KEY_SRC=/etc/dev-shell/keys
KEY_DST=/var/lib/dev-shell/authorized_keys

mkdir -p "$HOSTKEY_DIR"
chmod 700 "$HOSTKEY_DIR"
if [ ! -s "$HOSTKEY_DIR/ssh_host_ed25519_key" ]; then
  ssh-keygen -q -t ed25519 -N '' -f "$HOSTKEY_DIR/ssh_host_ed25519_key"
fi
chmod 600 "$HOSTKEY_DIR/ssh_host_ed25519_key"

for u in patrick gekko; do
  [ -s "$KEY_SRC/$u" ] || { echo "dev-shell: kein Key fuer $u unter $KEY_SRC" >&2; exit 1; }
  cp "$KEY_SRC/$u" "$KEY_DST/$u"
  chmod 600 "$KEY_DST/$u"
done

exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config
