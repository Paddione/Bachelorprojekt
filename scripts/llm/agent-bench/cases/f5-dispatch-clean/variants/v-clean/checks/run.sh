#!/usr/bin/env bash
# Laeuft mit cwd = Workdir. Prueft, dass alle drei Notizen ausgetragen sind.
set -u
fail=0
for f in notes/a.txt notes/b.txt notes/c.txt; do
  [ -f "$f" ] || fail=1
done
grep -q '^DONE a$' notes/a.txt 2>/dev/null || fail=1
grep -q '^DONE b$' notes/b.txt 2>/dev/null || fail=1
grep -q '^DONE c$' notes/c.txt 2>/dev/null || fail=1
# Kein TODO darf uebrig sein.
if grep -rq '^TODO' notes/ 2>/dev/null; then fail=1; fi
exit $fail
