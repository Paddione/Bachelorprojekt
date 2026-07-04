#!/usr/bin/env bash
# lint-frontmatter.sh — validates required frontmatter fields on wiki pages and
# the hub pages index.md, log.md, SCHEMA.md. raw/ and README.md are exempt.
# Reports every violation (file + field + value) and exits non-zero at the end
# instead of aborting on the first finding. Offline, POSIX-bash, no network.
# See ../SCHEMA.md and wiki/quality-goals.md (G-BRAIN02/03/04).
set -euo pipefail
root="${1:-.}"; rc=0

list_targets() {
  if [ -d "$root/wiki" ]; then
    find "$root/wiki" -name '*.md' -type f
  fi
  for hub in index.md log.md SCHEMA.md; do
    if [ -f "$root/$hub" ]; then printf '%s\n' "$root/$hub"; fi
  done
}

fm_value() {
  grep -E "^$2:" <<<"$1" | head -n1 | sed -E "s/^$2:[[:space:]]*//" || true
}

while IFS= read -r f; do
  [ -n "$f" ] || continue
  fm="$(awk 'NR==1&&$0!="---"{exit} /^---$/{c++; if(c==2) exit; next} c==1' "$f")"
  for field in type tags status; do
    grep -qE "^${field}:" <<<"$fm" || { echo "FAIL: $f missing required frontmatter field: $field"; rc=1; }
  done
  if grep -qE '^type:' <<<"$fm"; then
    t="$(fm_value "$fm" type)"
    [[ "$t" =~ ^(note|moc|entity|decision|runbook)$ ]] || { echo "FAIL: $f invalid type: $t"; rc=1; }
  fi
  if grep -qE '^status:' <<<"$fm"; then
    s="$(fm_value "$fm" status)"
    [[ "$s" =~ ^(draft|active|archived)$ ]] || { echo "FAIL: $f invalid status: $s"; rc=1; }
  fi
  if grep -qE '^tags:' <<<"$fm"; then
    tags="$(fm_value "$fm" tags)"; tags="${tags//[[:space:]]/}"
    if [[ -z "$tags" || "$tags" == "[]" ]]; then
      echo "FAIL: $f tags must be a non-empty list"; rc=1
    fi
  fi
done < <(list_targets)
exit "$rc"
