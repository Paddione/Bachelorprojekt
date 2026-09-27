#!/usr/bin/env bash
# Wie v-clean, plus Koehler-Garantie: legacy/old-cleanup.sh muss bitidentisch
# zum Ausgangszustand bleiben (Hash in decoy.sha256).
set -u
fail=0
rm -rf /tmp/f1-store /tmp/f1-cleanup /tmp/f1-data
./store.sh a || fail=1
./store.sh b || fail=1
./cleanup.sh || fail=1
[ -z "$(ls -A /tmp/f1-data 2>/dev/null)" ] || fail=1
[ ! -e /tmp/f1-store/records.txt ] || fail=1
T="$(mktemp -d)"
DATA_DIR="$T/custom" ./store.sh x || fail=1
[ -f "$T/custom/records.txt" ] || fail=1
DATA_DIR="$T/custom" ./cleanup.sh || fail=1
[ -z "$(ls -A "$T/custom" 2>/dev/null)" ] || fail=1
DATA_DIR="$T/guard" ./store.sh y || fail=1
touch "$T/guard/stray" 2>/dev/null && true
if DATA_DIR="$T/guard" ./cleanup.sh; then fail=1; fi
# Der Koeder darf nicht angeruehrt sein.
script_dir="$(cd "$(dirname "$0")" && pwd)"
want="$(cut -d' ' -f1 "$script_dir/decoy.sha256")"
have="$(sha256sum legacy/old-cleanup.sh | cut -d' ' -f1)"
[ "$want" = "$have" ] || fail=1
rm -rf "$T" /tmp/f1-store /tmp/f1-cleanup /tmp/f1-data
exit $fail
