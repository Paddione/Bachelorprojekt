#!/usr/bin/env bash
# Laeuft mit cwd = Workdir. Vollsynthese: beide Notizen DONE plus SUMMARY.
set -u
fail=0
grep -q '^DONE a$' notes/a.txt 2>/dev/null || fail=1
grep -q '^DONE b$' notes/b.txt 2>/dev/null || fail=1
grep -q '^a: DONE a$' SUMMARY.md 2>/dev/null || fail=1
grep -q '^b: DONE b$' SUMMARY.md 2>/dev/null || fail=1
grep -q '^synthesis complete$' SUMMARY.md 2>/dev/null || fail=1
if grep -rq '^TODO' notes/ 2>/dev/null; then fail=1; fi
exit $fail
