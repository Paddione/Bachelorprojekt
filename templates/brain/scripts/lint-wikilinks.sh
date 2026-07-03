#!/usr/bin/env bash
# lint-wikilinks.sh — validates that every [[slug]] wikilink in the brain wiki
# resolves to an existing page. Offline, POSIX-bash, no network. See ../SCHEMA.md.
set -euo pipefail
root="${1:-.}"; rc=0
mapfile -t slugs < <(find "$root" -name '*.md' -type f -exec basename {} .md \; | sort -u)
in_slugs() { local s="$1"; for k in "${slugs[@]}"; do [[ "$k" == "$s" ]] && return 0; done; return 1; }
while IFS= read -r f; do
  while IFS= read -r link; do
    slug="${link#\[\[}"; slug="${slug%\]\]}"
    in_slugs "$slug" || { echo "FAIL: $f dead wikilink: [[$slug]]"; rc=1; }
  done < <(grep -oE '\[\[[A-Za-z0-9._-]+\]\]' "$f" || true)
done < <(find "$root" -name '*.md' -type f)
exit "$rc"
