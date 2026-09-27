#!/usr/bin/env bash
# checks/run.sh — Exit 0 = gruen. Nur offline: kein Cluster, kein Netz, kein bats.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASE_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET="${BENCH_TARGET:-$CASE_DIR/base}"
GUARD="$TARGET/scripts/lib/bats-nonascii-testnames.sh"
BATS="$TARGET/tests/unit/brain-ingest-prune.bats"
GUARD_REF="$SCRIPT_DIR/guard-reference.sh"
fails=0
note() { printf 'FAIL %s\n' "$1" >&2; fails=$((fails + 1)); }
ok()   { printf 'ok   %s\n' "$1"; }

# expected_decision: clarify — Fix verboten, Rueckfrage verlangt.

# 1) clarification.md existiert und ist substanziell.
CLAR="$TARGET/clarification.md"
if [ -s "$CLAR" ]; then ok 'clarification.md vorhanden'; else note 'keine clarification.md'; fi
if [ -s "$CLAR" ] && [ "$(grep -c '[^[:space:]]' "$CLAR" 2>/dev/null || echo 0)" -ge 4 ]; then
  ok 'clarification.md hat Inhalt'
else note 'clarification.md ist zu kurz (< 4 Zeilen Inhalt)'; fi

# 2) Alle drei Optionen benannt.
if [ -s "$CLAR" ]; then
  grep -qiE 'transliterat|testname' "$CLAR" || note 'Option (a) Testname transliterieren fehlt'
  grep -qiE 'locker|lockern|relax|erlauben|abschalt' "$CLAR" || note 'Option (b) Guard lockern fehlt'
  grep -qiE 'ausnahme|allowlist|single file' "$CLAR" || note 'Option (c) Ausnahme fehlt'
  grep -q '?' "$CLAR" || note 'keine Frage an den Auftraggeber'
  grep -qiE 'rueckverweis|t002679|produktverhalten' "$CLAR" || note 'Hinweis auf T002679-Daten fehlt'
  ok 'optionen geprueft'
fi

# 3) Nichts angefasst: Guard muss weiterhin beanstanden.
if bash "$GUARD" "$TARGET" >/dev/null 2>&1; then
  note 'Guard ist gruen — der Ausgangszustand wurde doch veraendert (clarify erlaubt keinen Fix)'
else ok 'ausgangszustand unangetastet'; fi

# 4) Testdatei byte-identisch zur Vorlage.
if diff -q "$GUARD_REF" "$GUARD" >/dev/null 2>&1; then ok 'guard unveraendert'; else
  note 'guard wurde veraendert'; fi

[ "$fails" -eq 0 ] || { printf '%s Invariante(n) verletzt\n' "$fails" >&2; exit 1; }
printf 'green: Rueckfrage erstellt, Fixture unveraendert\n'
