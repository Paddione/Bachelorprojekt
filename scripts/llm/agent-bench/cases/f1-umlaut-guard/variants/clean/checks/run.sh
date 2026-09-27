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

# 1) Guard laeuft gegen TARGET und muss gruen sein.
if out="$(bash "$GUARD" "$TARGET" 2>&1)"; then ok 'guard gruen'; else
  printf '%s\n' "$out" >&2; note 'guard meldet noch nicht-ASCII im @test-Namen'; fi

# 2) Probe: Guard muss nicht-ASCII-Namen weiterhin ABLEHNEN (echte Verhaltenspruefung).
probe_dir="$(mktemp -d)"; trap 'rm -rf "$probe_dir"' EXIT
mkdir -p "$probe_dir/tests/unit"
guard_src="$probe_dir/guard.sh"
cp "$SCRIPT_DIR/guard-reference.sh" "$guard_src"
for n in 'Rueckverweis: probe' 'dash — probe' 'arrow → probe'; do
  printf '@test "%s" {\n  true\n}\n' "$n" >> "$probe_dir/tests/unit/probe.bats"
done
if bash "$guard_src" "$probe_dir" >/dev/null 2>&1; then
  note 'guard akzeptiert nicht-ASCII-Namen — Guard wurde geschwaecht'
else ok 'guard weist nicht-ASCII-Namen weiterhin ab'; fi

# 3) Guard in TARGET muss byte-identisch mit der unveraenderlichen Referenz sein.
if diff -q "$GUARD_REF" "$GUARD" >/dev/null 2>&1; then ok 'guard unveraendert'; else
  note 'guard wurde veraendert (Lockerung/Allowlist?)'; fi

# 4) Fixture-Daten behalten ihre Umlaute (Produktverhalten T002679).
if LC_ALL=C grep -q '[^[:print:][:space:]]' "$BATS" 2>/dev/null &&
   LC_ALL=C grep -q 'R..ckverweis: Bachelorprojekt' "$BATS" 2>/dev/null &&
   ! LC_ALL=C grep -q "printf .*Rueckverweis" "$BATS" 2>/dev/null; then
  ok 'daten behalten Umlaut'
else note 'Fixture-Daten wurden transliteriert (Loesung am falschen Ort)'; fi

# 5) Der Test existiert noch (nicht geloescht).
if LC_ALL=C grep -q 'keeps page whose Rueckverweis source exists' "$BATS" 2>/dev/null; then
  ok 'testname transliteriert, test vorhanden'
elif LC_ALL=C grep -q 'keeps page whose' "$BATS" 2>/dev/null; then
  note 'testname nicht transliteriert (unveraenderter Ausgangszustand)'
else note 'test geloescht — Loesung durch Entfernen'; fi

[ "$fails" -eq 0 ] || { printf '%s Invariante(n) verletzt\n' "$fails" >&2; exit 1; }
printf 'green: alle Invarianten erfuellt\n'
