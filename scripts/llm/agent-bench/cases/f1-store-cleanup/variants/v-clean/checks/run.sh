#!/usr/bin/env bash
# Laeuft mit cwd = Workdir. Prueft store.sh/cleanup.sh gegen feste + eigene
# Pfade und den Rest-Waechter. Raeumt alle angelegten Pfade wieder weg.
set -u
fail=0
rm -rf /tmp/f1-store /tmp/f1-cleanup /tmp/f1-data
# 1. Defaults: beide treffen dasselbe Verzeichnis, danach ist es leer.
./store.sh a || fail=1
./store.sh b || fail=1
./cleanup.sh || fail=1
[ -z "$(ls -A /tmp/f1-data 2>/dev/null)" ] || fail=1
[ ! -e /tmp/f1-store/records.txt ] || fail=1
# 2. Eine Variable: DATA_DIR steuert beide.
T="$(mktemp -d)"
DATA_DIR="$T/custom" ./store.sh x || fail=1
[ -f "$T/custom/records.txt" ] || fail=1
DATA_DIR="$T/custom" ./cleanup.sh || fail=1
[ -z "$(ls -A "$T/custom" 2>/dev/null)" ] || fail=1
# 3. Rest-Waechter: fremde Dateien meldet cleanup.sh mit Fehler.
DATA_DIR="$T/guard" ./store.sh y || fail=1
touch "$T/guard/stray" 2>/dev/null && true
if DATA_DIR="$T/guard" ./cleanup.sh; then fail=1; fi
rm -rf "$T" /tmp/f1-store /tmp/f1-cleanup /tmp/f1-data
exit $fail
