#!/usr/bin/env bats

# Validates every art-library set's manifest.json against the JSON Schema
# and asserts every referenced SVG file exists on disk.

REPO="${BATS_TEST_DIRNAME}/../.."

# Die Installation der Abhängigkeiten erfolgt ueber einen CI-Step
# ('Install art-library tooling dependencies' in .github/workflows/ci.yml).
# Fehlt das Verzeichnis lokal, ist das ein fehlgeschlagener CI-Step — der Test
# schlägt hart fehl statt still zu überspringen.
setup_file() {
  if [[ ! -d "${REPO}/assets/art-library/_tooling/node_modules" ]]; then
    echo "art-library tooling dependencies missing — run: npm install --prefix assets/art-library/_tooling" >&2
    exit 1
  fi
}

@test "art-library validator script runs and exits zero" {
  run node "${REPO}/assets/art-library/_tooling/validate-manifest.mjs"
  echo "stdout: $output"
  [ "$status" -eq 0 ]
}

@test "korczewski set has at least one character, prop, terrain, and logo" {
  manifest="${REPO}/assets/art-library/sets/korczewski/manifest.json"
  for kind in character prop terrain logo; do
    run jq -e --arg k "$kind" '.assets | map(select(.kind == $k)) | length >= 1' "$manifest"
    [ "$status" -eq 0 ]
  done
}

@test "mentolder set has at least one character, prop, terrain, and logo" {
  manifest="${REPO}/assets/art-library/sets/mentolder/manifest.json"
  for kind in character prop terrain logo; do
    run jq -e --arg k "$kind" '.assets | map(select(.kind == $k)) | length >= 1' "$manifest"
    [ "$status" -eq 0 ]
  done
}

@test "mentolder manifest declares at least 19 assets" {
  manifest="${REPO}/assets/art-library/sets/mentolder/manifest.json"
  run jq -e '.assets | length >= 19' "$manifest"
  [ "$status" -eq 0 ]
}
