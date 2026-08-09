#!/usr/bin/env bash
# Scan tests/local/, tests/prod/, tests/e2e/specs/ and emit a requirement → test mapping.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${TEST_INVENTORY_OUT:-${REPO_ROOT}/website/src/data/test-inventory.json}"

declare -a entries=()

# Test-Discovery [T002664]. Innerhalb eines Git-Arbeitsbaums liefert `git ls-files`
# die Dateien unter Beachtung von .gitignore — gitignorierte oder verirrte Dateien
# verschmutzen das Inventar dadurch nicht.
#
# Ausserhalb eines Arbeitsbaums (Test-Fixture unter mktemp, Tarball-Export,
# Docker-Build-Kontext) liefert `git ls-files` jedoch NICHTS, und mit
# unterdruecktem stderr ist das ununterscheidbar von "keine Testdateien
# vorhanden": das Skript schriebe stillschweigend 0 Eintraege und beendete sich
# mit Exit 0 — die Duplikat-Erkennung koennte nie ausloesen. Eine leere Antwort
# ist kein Urteil, deshalb wird der Arbeitsbaum hier EXPLIZIT geprueft statt den
# Fehler zu verschlucken, und ohne Git faellt die Discovery auf `find` zurueck.
if git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  _discover_tests() {
    git -C "$REPO_ROOT" ls-files -z --cached --others --exclude-standard "$1" \
      | grep -z -E '\.(sh|bats)$' | sort -z
  }
else
  # maxdepth 2 [T002416]: Spec-Tests liegen seit der Verzeichniskonvention auch
  # unter tests/spec/<spec-slug>/.
  _discover_tests() {
    find "$1" -maxdepth 2 \( -name '*.sh' -o -name '*.bats' \) -print0 | sort -z
  }
fi

for dir in "${REPO_ROOT}/tests/local" "${REPO_ROOT}/tests/prod" "${REPO_ROOT}/tests/spec"; do
  [[ -d "$dir" ]] || continue
  tier="$(basename "$dir")"
  while IFS= read -r -d '' item; do
    f="${REPO_ROOT}/${item#${REPO_ROOT}/}"
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
      found_structured_id=0
      while IFS= read -r test_id; do
        found_structured_id=1
        entries+=("$(jq -nc --arg id "$test_id" --arg path "$rel" --arg category "${test_id%%-*}" --arg tier "$tier" '{id:$id, file:$path, category:$category, kind:"shell", tier:$tier}')")
      done < <(grep -oP '@test\s+"\K[A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+(?=)' "$f" 2>/dev/null | sort -u || true)
      if [[ "$found_structured_id" -eq 1 ]]; then
        continue
      fi
      # Path-derived fallback [T002445]: neither the filename nor the @test titles carry a
      # structured ID. This is reached ONLY when both detection paths above found nothing —
      # they keep precedence, so software-factory.bats still yields its 54 FA-SF-* entries.
      # Derive id/category from the path relative to the tier directory, extension stripped.
      # T002416 convention: tests/spec/<ssot-spec-slug>/<short-slug>.bats — the directory
      # name is the SSOT spec slug, so category becomes that slug. Top-level files (no
      # subdirectory) use the bare filename for both id and category.
      rel_to_tier="${f#${dir}/}"
      fallback_id="${rel_to_tier%.*}"
      if [[ "$fallback_id" == */* ]]; then
        fallback_category="${fallback_id%%/*}"
      else
        fallback_category="$fallback_id"
      fi
      entries+=("$(jq -nc --arg id "$fallback_id" --arg path "$rel" --arg category "$fallback_category" --arg tier "$tier" '{id:$id, file:$path, category:$category, kind:"shell", tier:$tier}')")
      continue
    fi
    entries+=("$(jq -nc --arg id "$id" --arg path "$rel" --arg category "${id%%-*}" --arg tier "$tier" '{id:$id, file:$path, category:$category, kind:"shell", tier:$tier}')")
  done < <(_discover_tests "$dir")
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

# Fail-closed guard [T002445]: every shell test file discovered in the three tier
# directories must have produced at least one inventory entry. After the path-derived
# fallback above, no file can currently reach this branch — it is deliberate regression
# protection for future changes to the discovery logic, not a case exercised today. It is
# intentionally NOT covered by its own test: such a test could only pass vacuously (it
# would need a file that defeats all three detection paths, which by construction cannot
# exist), which is exactly the defect class this change removes.
missing=()
for dir in "${REPO_ROOT}/tests/local" "${REPO_ROOT}/tests/prod" "${REPO_ROOT}/tests/spec"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r -d '' item; do
    f="${REPO_ROOT}/${item#${REPO_ROOT}/}"
    rel="${f#${REPO_ROOT}/}"
    if [[ "$(jq --arg p "$rel" '[.[] | select(.file == $p)] | length' "$OUT")" -eq 0 ]]; then
      missing+=("$rel")
    fi
  done < <(_discover_tests "$dir")
done
if [[ "${#missing[@]}" -gt 0 ]]; then
  echo "Error: the following shell test files produced no inventory entry:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi
