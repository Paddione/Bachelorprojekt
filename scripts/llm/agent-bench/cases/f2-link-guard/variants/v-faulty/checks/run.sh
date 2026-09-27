#!/usr/bin/env bash
# Wie v-clean (der Fehlversuch ist Sache des Orchestrators, nicht der Checks).
set -u
fail=0
cleanup() {
  rm -f links/broken links/stray
  [ -e links/good ] || mv "$BACKUP/good" links/good 2>/dev/null || true
}
BACKUP="$(mktemp -d)"
trap cleanup EXIT
./check-links.sh links/ >/dev/null 2>&1 || fail=1
ln -s nowhere links/broken
./check-links.sh links/ >/dev/null 2>&1 && fail=1
rm -f links/broken
ln -s target links/stray
./check-links.sh links/ >/dev/null 2>&1 && fail=1
rm -f links/stray
mv links/good "$BACKUP/good"
./check-links.sh links/ >/dev/null 2>&1 && fail=1
mv "$BACKUP/good" links/good
trap - EXIT
rm -rf "$BACKUP"
exit $fail
