#!/usr/bin/env bats

# Validates every art-library set's manifest.json against the JSON Schema
# and asserts every referenced SVG file exists on disk.

REPO="${BATS_TEST_DIRNAME}/../.."

@test "art-library validator script runs and exits zero" {
  run node "${REPO}/art-library/_tooling/validate-manifest.mjs"
  echo "stdout: $output"
  [ "$status" -eq 0 ]
}

@test "korczewski set has at least one character, prop, terrain, and logo" {
  manifest="${REPO}/art-library/sets/korczewski/manifest.json"
  for kind in character prop terrain logo; do
    run jq -e --arg k "$kind" '.assets | map(select(.kind == $k)) | length >= 1' "$manifest"
    [ "$status" -eq 0 ]
  done
}
