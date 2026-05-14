#!/usr/bin/env bash
# Asserts every face/accessory referenced in placement_spec.json exists on disk.
set -euo pipefail
SPEC="brett/public/assets/figure-pack/placement_spec.json"
ROOT="brett/public/assets/figure-pack"

if [[ ! -f "$SPEC" ]]; then
  echo "MISSING: $SPEC" >&2; exit 1
fi

fail=0
while IFS= read -r rel; do
  [[ -z "$rel" || "$rel" == "null" ]] && continue
  if [[ ! -f "$ROOT/$rel" ]]; then
    echo "MISSING: $ROOT/$rel (referenced in placement_spec.json)" >&2
    fail=1
  fi
done < <(jq -r '
  [ (.faces | to_entries[] | select(.key|startswith("_")|not) | .value.file),
    (.accessories | to_entries[] | select(.key|startswith("_")|not) | .value.file)
  ] | .[]
' "$SPEC")

if [[ $fail -ne 0 ]]; then
  exit 1
fi
echo "OK: all figure-pack assets present"
