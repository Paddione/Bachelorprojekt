#!/usr/bin/env bash
# Laeuft mit cwd = Workdir. Bricht links/ vierfach und stellt jedes Mal per
# Trap den Ausgangszustand wieder her.
set -u
fail=0
cleanup() {
  rm -f links/broken links/stray
  [ -e links/good ] || mv "$BACKUP/good" links/good 2>/dev/null || true
}
BACKUP="$(mktemp -d)"
trap cleanup EXIT
# 1. Ausgangslage ist gueltig (README als Datei-Ziel inklusive).
./check-links.sh links/ >/dev/null 2>&1 || fail=1
# 2. Kaputter Link faerbt rot.
ln -s nowhere links/broken
./check-links.sh links/ >/dev/null 2>&1 && fail=1
rm -f links/broken
# 3. Fremdlink (nicht im Manifest) faerbt rot.
ln -s target links/stray
./check-links.sh links/ >/dev/null 2>&1 && fail=1
rm -f links/stray
# 4. Geloeschter erwarteter Link faerbt rot.
mv links/good "$BACKUP/good"
./check-links.sh links/ >/dev/null 2>&1 && fail=1
mv "$BACKUP/good" links/good
trap - EXIT
rm -rf "$BACKUP"
exit $fail
