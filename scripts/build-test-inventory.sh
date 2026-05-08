#!/usr/bin/env bash
# Scan tests/local/, tests/prod/, tests/e2e/specs/ and emit a requirement → test mapping.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO_ROOT}/website/src/data/test-inventory.json"

declare -a entries=()

for dir in "${REPO_ROOT}/tests/local" "${REPO_ROOT}/tests/prod"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    id="$(echo "$base" | sed -E 's/^(FA|SA|NFA|AK)-([0-9]+).*/\1-\2/')"
    [[ "$id" == "$base" ]] && continue
    rel="${f#${REPO_ROOT}/}"
    entries+=("$(jq -nc --arg id "$id" --arg path "$rel" --arg category "${id%%-*}" '{id:$id, file:$path, category:$category, kind:"shell"}')")
  done < <(find "$dir" -maxdepth 1 \( -name '*.sh' -o -name '*.bats' \) -print0 | sort -z)
done

for f in "${REPO_ROOT}"/tests/e2e/specs/*.spec.ts; do
  [[ -e "$f" ]] || continue
  rel="${f#${REPO_ROOT}/}"
  base="$(basename "$f" .spec.ts)"
  if [[ "$base" =~ ^(fa|sa|nfa|ak)-([0-9]+) ]]; then
    id="$(echo "$base" | sed -E 's/^(fa|sa|nfa|ak)-([0-9]+).*/\1-\2/' | tr 'a-z' 'A-Z')"
    category="${id%%-*}"
  else
    id="E2E:$base"
    category="E2E"
  fi
  entries+=("$(jq -nc --arg id "$id" --arg path "$rel" --arg category "$category" '{id:$id, file:$path, category:$category, kind:"playwright"}')")
done

printf '%s\n' "${entries[@]}" | jq -s 'sort_by(.id)' > "$OUT"
echo "Wrote $(jq 'length' "$OUT") inventory entries to $OUT"
