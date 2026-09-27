#!/usr/bin/env bash
# Prueft die Symlinks in $1. SCHWACH: ueberspringt Nicht-Verzeichnis-Ziele
# still (`[ -d ... ] || continue`), kennt kein Manifest und zaehlt nur —
# ein leergeraumtes Verzeichnis bleibt unbemerkt, solange ein Link steht.
set -u
dir="${1:?Verzeichnis fehlt}"
count=0
for link in "$dir"/*; do
  [ -L "$link" ] || continue
  [ -d "$link" ] || continue
  count=$((count + 1))
done
[ "$count" -gt 0 ]
