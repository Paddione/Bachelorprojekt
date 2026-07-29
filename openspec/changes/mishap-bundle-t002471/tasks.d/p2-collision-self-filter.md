# Partial p2 — agent-collision.sh: Self-Filter + Dedup

**Ticket:** T002471
**Rolle:** `collision-fix`
**Ziel-Dateien:** `scripts/agent-collision.sh`
**Mishaps:** M5 (false in-flight), M9 (self-filter SID mismatch)

## Mishap 9: Self-Filter compares UUID with number

Line 105: `[ "$sid" = "$mysid" ] && continue`
- `owner_sid` in lock file is a UUID (e.g. `2cced291-...`)
- `_my_sid()` returns a number (from `/proc/self/stat`) when `AGENT_LOCK_SID` is unset
- UUID != number → self-filter always fails

**Fix:** Compare by `owner_pid` instead:
```bash
# Replace line 104-105:
pid="$(_field "$f" owner_pid)"
[ -n "$pid" ] && [ "$pid" = "$$" ] && continue
```
This catches the self-case because `owner_pid` is the process PID, which matches `$$`.

## Mishap 5: False in-flight (dedup missing)

Same file can be reported multiple times when multiple lock files exist for the same session.

**Fix:** Collect in an associative array, deduplicate before print:
```bash
# Replace the print block (lines 136-141):
declare -A seen
# ... after line 135 (the grep check):
if [[ -z "${seen[$file]:-}" ]]; then
  seen[$file]=1
  found=1
  if [ "$quiet" -eq 0 ]; then
    printf '⚠ COLLISION: %s — auch in-flight bei %s/%s (sid %s, worktree %s)\n' \
      "$file" "$(_field "$f" tool)" "$(_field "$f" label)" "$sid" "$wt" >&2
  fi
fi
```

## Abnahmekriterien

1. Self-Filter: commit im eigenen Worktree erzeugt keine COLLISION-Warnung mehr
2. Dedup: dieselbe Datei wird nur einmal pro Lauf gemeldet
