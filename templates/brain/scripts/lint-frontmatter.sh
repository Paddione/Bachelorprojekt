#!/usr/bin/env bash
# lint-frontmatter.sh — validates required frontmatter fields on every .md page
# in the brain wiki. Offline, POSIX-bash, no network. See ../SCHEMA.md.
set -euo pipefail
root="${1:-.}"; rc=0
while IFS= read -r f; do
  fm="$(awk 'NR==1&&$0!="---"{exit} /^---$/{c++; if(c==2) exit; next} c==1' "$f")"
  for field in type tags status; do
    grep -qE "^${field}:" <<<"$fm" || { echo "FAIL: $f missing required frontmatter field: $field"; rc=1; }
  done
  t="$(grep -oE '^type: *[a-z]+' <<<"$fm" | awk '{print $2}')"
  [[ -z "$t" || "$t" =~ ^(note|moc|entity|decision|runbook)$ ]] || { echo "FAIL: $f invalid type: $t"; rc=1; }
  s="$(grep -oE '^status: *[a-z]+' <<<"$fm" | awk '{print $2}')"
  [[ -z "$s" || "$s" =~ ^(draft|active|archived)$ ]] || { echo "FAIL: $f invalid status: $s"; rc=1; }
done < <(find "$root" -name '*.md' -type f)
exit "$rc"
