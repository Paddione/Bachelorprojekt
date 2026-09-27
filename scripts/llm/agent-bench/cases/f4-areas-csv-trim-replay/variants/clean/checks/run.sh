#!/usr/bin/env bash
# checks/run.sh — Exit 0 = gruen. Nur offline: kein Cluster, kein Netz, kein psql.
# Der Check liest ausschliesslich die zwei Dateien des Fixes. Ein globales grep nach
# FACTORY_CTX waere falsch — die Variable steht an vielen legitimaten Stellen im Repo
# (scripts/worktree-list.sh, _devmesh-guard.sh, tests/lib/factory-test-fixtures.sh, ...).
#
# Zielbaum: Default ist die Repo-Wurzel (Hochlaufen bis Taskfile.yml), ueberschreibbar mit
# BENCH_TARGET — damit laesst sich der Vorzustand aus replay.json in /tmp auslegen.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXP="$SCRIPT_DIR/expected.json"
fails=0
note() { printf 'FAIL %s\n' "$1" >&2; fails=$((fails + 1)); }
ok()   { printf 'ok   %s\n' "$1"; }

TARGET="${BENCH_TARGET:-}"
if [ -z "$TARGET" ]; then
  probe="$SCRIPT_DIR"
  while [ "$probe" != "/" ]; do
    if [ -f "$probe/Taskfile.yml" ]; then TARGET="$probe"; break; fi
    probe="$(dirname "$probe")"
  done
  [ -n "$TARGET" ] || TARGET="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
fi
printf 'target: %s\n' "$TARGET"

# --- expected.json auslesen. Reines sed/grep: die Werte enthalten keine Kommas und
# --- keine escaped Quotes, ein Split auf Kommas ist damit verlustfrei. Leere Extraktion
# --- ist ein Fehler, kein "nichts zu pruefen" — sonst laeuft ein Check ins Leere.
section() { tr -d '\n' < "$EXP" | sed "s/.*\"$1\"[[:space:]]*:[[:space:]]*\[//" | sed 's/\].*//'; }
# JSON-Werte duerfen escaped Quotes enthalten (CTX="${TICKET_CTX:-fleet}") — der
# Wert-Regex muss sie mitnehmen, sonst wird der Wert nach dem ersten \" abgeschnitten
# und der Check prueft die halbe Textstelle. Leere Extraktion ist ein Fehler, kein
# "nichts zu pruefen" — sonst laeuft eine Variante ins Leere gruen.
VSTR='"([^"\\]|\\.)*"'
jval() { section "$1" | grep -oE "$VSTR" | sed -n "$2p" | sed 's/^"//; s/"$//; s/\\"/"/g; s/\\\\/\\/g'; }
jkey() { # jkey <section> <schluessel> <index>
  section "$1" | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*$VSTR" | sed -n "$3p" \
    | sed 's/^[^:]*:[[:space:]]*"//; s/"$//; s/\\"/"/g; s/\\\\/\\/g'
}

FILE1="$(jval files 1)"; FILE2="$(jval files 2)"
[ -n "$FILE1" ] || note 'expected.json: files[1] nicht lesbar'
[ -n "$FILE2" ] || note 'expected.json: files[2] nicht lesbar'
[ "$FILE1" != "$FILE2" ] || note 'expected.json: files[1] und files[2] sind identisch'

# (1) Beide Dateien muessen im Zielbaum liegen.
for f in "$FILE1" "$FILE2"; do
  [ -n "$f" ] || continue
  if [ -s "$TARGET/$f" ]; then ok "datei vorhanden: $f"
  else note "datei fehlt im Ziel: $f"; fi
done

# (2) Kontextaufloesung an _ticket-core.sh:11 angeglichen, alte Variable weg.
for f in "$FILE1" "$FILE2"; do
  [ -n "$f" ] && [ -s "$TARGET/$f" ] || continue
  if grep -qF 'CTX="${TICKET_CTX:-fleet}"' "$TARGET/$f"; then
    ok "CTX spiegelt ticket.sh (_ticket-core.sh:11): $f"
  else
    note "CTX nicht an _ticket-core.sh:11 angeglichen: $f"
  fi
  if grep -qF 'CTX="${FACTORY_CTX' "$TARGET/$f"; then
    note "alte Testvariable FACTORY_CTX (Default devmesh) steht noch: $f"
  else
    ok "kein FACTORY_CTX-Default mehr: $f"
  fi
done

# (3) Anker-Test: der Teardown-Erfolg muss am Schreibkontext belegt sein.
AF="$(jkey present file 3)"; AT="$(jkey present text 3)"
[ -n "$AF" ] && [ -n "$AT" ] || note 'expected.json: present[3] (Anker) nicht lesbar'
if [ -n "$AT" ] && grep -qF "$AT" "$TARGET/$AF" 2>/dev/null; then
  ok "anker verankert den teardown: $AT"
else
  note "anker fehlt ($AT) — CTX-Angleichung allein laesst den Defekt unsichtbar"
fi

# (4) absent[] aus expected.json gegen den Zielbaum pruefen (wiederverwendbar).
absent_count=0
for i in 1 2; do
  af="$(jkey absent file "$i")"; at="$(jkey absent text "$i")"
  [ -n "$af" ] && [ -n "$at" ] || continue
  absent_count=$((absent_count + 1))
  if grep -qF "$at" "$TARGET/$af" 2>/dev/null; then note "verbotene Textstelle steht noch: $at ($af)"
  else ok "nicht vorhanden wie erwartet: $at"; fi
done
[ "$absent_count" -ge 1 ] || note 'expected.json: absent[] leer — der Fall waere unpruefbar'

# (5) Reviewer-Artefakte: clean.diff deckt beide Dateien ab, Seed ist beschrieben.
SEEDJ="$SCRIPT_DIR/diffs/seeded-1.json"
SEEDD="$SCRIPT_DIR/diffs/seeded-1.diff"
CLEAND="$SCRIPT_DIR/diffs/clean.diff"
if [ -s "$SEEDJ" ] && grep -q '"file"' "$SEEDJ" && grep -q '"line"' "$SEEDJ" && grep -q '"defect"' "$SEEDJ"; then
  ok 'seeded-1.json hat file/line/defect'
else note 'seeded-1.json unvollstaendig (file/line/defect)'; fi
seedfile="$(sed -n 's/.*"file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SEEDJ" 2>/dev/null | head -1)"
if [ -n "$seedfile" ] && [ -f "$TARGET/$seedfile" ]; then ok "seeded-1.json file existiert: $seedfile"
else note "seeded-1.json file existiert nicht im Ziel: ${seedfile:-<leer>}"; fi
if [ -n "$seedfile" ] && [ -n "$SEEDD" ] && grep -qF "$seedfile" "$SEEDD"; then ok 'seeded-1.diff nennt die Datei'
else note 'seeded-1.diff passt nicht zu seeded-1.json'; fi
if [ -s "$CLEAND" ]; then ok "clean.diff vorhanden"
else note 'clean.diff fehlt oder leer'; fi
for f in "$FILE1" "$FILE2"; do
  [ -n "$f" ] || continue
  if grep -qF "$f" "$CLEAND" 2>/dev/null; then ok "clean.diff deckt $f"
  else note "clean.diff deckt $f nicht"; fi
done

# (6) Der Seed darf nicht ausgeliefert sein — sonst ist es die halbe Reparatur.
if grep -qF 'noch nicht ergaenzt' "$TARGET/$seedfile" 2>/dev/null; then
  note 'seeded defect aktiv — die halbe Reparatur wurde ausgeliefert'
else
  ok 'seeded defect abwesend (volle Reparatur im Ziel)'
fi

[ "$fails" -eq 0 ] || { printf '%s Invariante(n) verletzt\n' "$fails" >&2; exit 1; }
printf 'green: teardown verankert, Kontext angeglichen, Seed nicht ausgeliefert\n'
