#!/usr/bin/env bash
# Scan tests/local/, tests/prod/, tests/e2e/specs/ and emit a requirement → test mapping.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO_ROOT}/website/src/data/test-inventory.json"

declare -a entries=()

for dir in "${REPO_ROOT}/tests/local" "${REPO_ROOT}/tests/prod" "${REPO_ROOT}/tests/spec"; do
  [[ -d "$dir" ]] || continue
  tier="$(basename "$dir")"
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    # was: id="$(echo "$base" | sed -E 's/^(FA|SA|NFA|AK)-([0-9]+).*/\1-\2/')"
    # Extended to accept an optional uppercase sub-tag (e.g. FA-SF-04 → FA-SF-04).
    # Also supports multi-word uppercase prefixes with digit suffix (e.g. MCP-TASK-RUNNER-001).
    id="$(echo "$base" | sed -E 's/^(FA|SA|NFA|AK)(-[A-Z]+)?-([0-9]+).*/\1\2-\3/')"
    if [[ "$id" == "$base" ]]; then
      # Try multi-word uppercase prefix: e.g. MCP-TASK-RUNNER-001
      id="$(echo "$base" | sed -E 's/^([A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)+)-([0-9]+)\..*/\1-\3/')"
    fi
    rel="${f#${REPO_ROOT}/}"
    if [[ "$id" == "$base" ]]; then
      # BATS files whose name does not carry a number may contain @test lines with
      # structured IDs (e.g. MCP-TASK-RUNNER.bats with "MCP-TASK-RUNNER-001: ...").
      # Extract those IDs directly from the file.
      # tests/spec/software-factory.bats groups multiple @test lines under one ID;
      # de-duplicate to a single entry per ID per file.
      while IFS= read -r test_id; do
        entries+=("$(jq -nc --arg id "$test_id" --arg path "$rel" --arg category "${test_id%%-*}" --arg tier "$tier" '{id:$id, file:$path, category:$category, kind:"shell", tier:$tier}')")
      done < <(grep -oP '@test\s+"\K[A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+(?=)' "$f" 2>/dev/null | sort -u || true)
      continue
    fi
    entries+=("$(jq -nc --arg id "$id" --arg path "$rel" --arg category "${id%%-*}" --arg tier "$tier" '{id:$id, file:$path, category:$category, kind:"shell", tier:$tier}')")
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
  entries+=("$(jq -nc --arg id "$id" --arg path "$rel" --arg category "$category" '{id:$id, file:$path, category:$category, kind:"playwright", tier:"e2e"}')")
done

TMP_OUT=$(mktemp)
if printf '%s\n' "${entries[@]}" | jq -s --argjson allowPlaywrightDupes false '
  . as $orig
  # Per-(id, kind, tier) duplicate check:
  #   - local + prod are distinct tiers, so the same id may have a shell test in each.
  #   - shell/BATS may appear at most once per (id, tier).
  #   - playwright may appear at most once per (id, tier) — if a feature needs a second
  #     e2e file in the same tier, renumber to a fresh FA-/SA-/NFA-/AK-id.
  | (group_by({id: .id, kind: .kind, tier: .tier})
     | map(select(length > 1
                  or ((.[0].kind == "playwright") and (length > 1) and ($allowPlaywrightDupes == false)))))
    as $dupes
  | if ($dupes | length) > 0 then
      ("Error: Duplicate test IDs found in inventory (each (id, kind, tier) must appear once):\n"
       + (reduce $dupes[] as $g ("";
            . + "  - " + $g[0].id + " [" + $g[0].kind + "/" + $g[0].tier + "] (" + ($g | length | tostring) + " files)\n"
              + (reduce $g[] as $e ("";
                  . + "      " + $e.file + "\n"))
           ))
       )
      | halt_error(1)
    else
      # Strip the temporary tier field before writing to JSON to keep the schema clean
      $orig | map(del(.tier)) | sort_by(.id)
    end
' > "$TMP_OUT"; then
  mv "$TMP_OUT" "$OUT"
  echo "Wrote $(jq 'length' "$OUT") inventory entries to $OUT"
else
  rm -f "$TMP_OUT"
  exit 1
fi
