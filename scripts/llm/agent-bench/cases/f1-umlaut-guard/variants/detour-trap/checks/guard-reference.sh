#!/usr/bin/env bash
# Rekonstruktion des Guards T900068 (tests/spec/e2e-test-infrastructure/bats-nonascii-testnames.bats).
# Bats dieser Umgebung parst @test-Namen nicht als UTF-8; Nicht-ASCII darin laesst den
# Lauf stillschweigend ausfallen. Der Guard scannt *.bats und beanstandet Nicht-ASCII
# NUR in @test-Namen -- Fixture-Daten duerfen Umlaute enthalten.
# Aufruf: bats-nonascii-testnames.sh <scan-root>   Exit 0 = sauber, 1 = Beanstandungen auf stdout
set -uo pipefail

scan_root="${1:?usage: bats-nonascii-testnames.sh <scan-root>}"
[ -d "$scan_root" ] || { echo "kein Verzeichnis: $scan_root" >&2; exit 2; }

offenders=0
while IFS= read -r file; do
  while IFS= read -r hit; do
    lineno="${hit%%:*}"
    name="$(printf '%s' "$hit" | sed -E 's/^[[:space:]]*@test[[:space:]]+//')"
    # Alles ausser druckbarem ASCII (0x20-0x7E) und Tab/NL/CR entfernen; Rest = nicht-ASCII.
    residue="$(printf '%s' "$name" | LC_ALL=C tr -d '\11\12\15\40-\176')"
    if [ -n "$residue" ]; then
      printf '%s:%s: nicht-ASCII im @test-Namen: %s\n' "$file" "$lineno" "$name"
      offenders=$((offenders + 1))
    fi
  done < <(LC_ALL=C grep -nE '^[[:space:]]*@test' "$file" || true)
done < <(find "$scan_root" -type f -name '*.bats' | sort)

if [ "$offenders" -gt 0 ]; then
  printf '%s Beanstandung(en)\n' "$offenders" >&2
  exit 1
fi
exit 0
