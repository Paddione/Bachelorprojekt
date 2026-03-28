#!/usr/bin/env bash
# AK-03: Technische Machbarkeit — compose starts, stable image tags
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: All services running
RUNNING=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" ps --format json 2>/dev/null | jq -s 'length')
assert_gt "$RUNNING" 0 "AK-03" "T1" "docker compose up: Services laufen"

# T2: All images use stable release tags (no :latest except curl)
IMAGES=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" config --images 2>/dev/null)
UNSTABLE=""
while IFS= read -r img; do
  tag="${img##*:}"
  if [[ "$tag" == "latest" && "$img" != *"curlimages"* ]]; then
    UNSTABLE+="${img} "
  fi
done <<< "$IMAGES"
assert_eq "${UNSTABLE:-}" "" "AK-03" "T2" "Alle Images haben stabile Release-Tags"
