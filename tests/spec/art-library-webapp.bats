#!/usr/bin/env bats
# Regression tests for T001033: art-library webapp integration.
# Locks sprite health, avatarSrc path, and iconSpriteId coverage for mentolder.

REPO="${BATS_TEST_DIRNAME}/../.."
SPRITE="${REPO}/website/public/brand/mentolder/icons.svg"
CONFIG="${REPO}/website/src/config/brands/mentolder.ts"

@test "mentolder icons.svg has exactly 6 symbol elements" {
  run grep -c '<symbol id=' "${SPRITE}"
  echo "count: $output"
  [ "$status" -eq 0 ]
  [ "$output" -eq 6 ]
}

@test "mentolder icons.svg has no duplicate symbol ids" {
  total=$(grep -o 'id="[^"]*"' "${SPRITE}" | wc -l | tr -d ' ')
  unique=$(grep -o 'id="[^"]*"' "${SPRITE}" | sort -u | wc -l | tr -d ' ')
  echo "total=$total unique=$unique"
  [ "$total" -eq "$unique" ]
}

@test "mentolder avatarSrc leadership.portrait.svg exists in website/public" {
  local path="${REPO}/website/public/brand/mentolder/characters/leadership.portrait.svg"
  [ -f "$path" ]
}

@test "all mentolder service iconSpriteId values exist as symbol ids in icons.svg" {
  mapfile -t ids < <(grep "iconSpriteId:" "${CONFIG}" | grep -o "'[^']*'" | tr -d "'")
  echo "found iconSpriteIds: ${ids[*]}"
  [ "${#ids[@]}" -gt 0 ]
  for id in "${ids[@]}"; do
    run grep -q "id=\"${id}\"" "${SPRITE}"
    echo "checking ${id}: status=$status"
    [ "$status" -eq 0 ]
  done
}

@test "mentolder props are committed as static files in website/public" {
  local props_dir="${REPO}/website/public/brand/mentolder/props"
  local count
  count=$(find "${props_dir}" -name "*.svg" | wc -l | tr -d ' ')
  echo "props count: $count"
  [ "$count" -ge 6 ]
}
