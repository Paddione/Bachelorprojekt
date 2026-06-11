#!/usr/bin/env bats
# tests/unit/freshness-graph.bats — LAD-4: freshness gate for K8s graph artifacts

setup() {
  cd "$BATS_TEST_DIRNAME/../.."
}

@test "build-graph.mjs und build-api-map.mjs laufen ohne Fehler" {
  run node scripts/build-graph.mjs
  [ "$status" -eq 0 ]
  run node scripts/build-api-map.mjs
  [ "$status" -eq 0 ]
}

@test "freshness:graph-check besteht wenn graph.json committed ist" {
  # Regenerate artifacts
  node scripts/build-graph.mjs
  node scripts/build-api-map.mjs
  # The committed graph.json must be parseable and have the same node count as freshly generated
  committed_count=$(git show HEAD:docs/generated/graph.json 2>/dev/null | jq '.nodes | length' || echo "0")
  fresh_count=$(jq '.nodes | length' docs/generated/graph.json)
  [ "$committed_count" -eq "$fresh_count" ]
}

@test "graph.json enthält mind. 20 Nodes" {
  node scripts/build-graph.mjs
  count=$(jq '.nodes | length' docs/generated/graph.json)
  [ "$count" -ge 20 ]
}

@test "api-map.json enthält mind. 15 Endpoints" {
  node scripts/build-api-map.mjs
  count=$(jq '.endpoints | length' docs/generated/api-map.json)
  [ "$count" -ge 15 ]
}

@test "graph.json und api-map.json haben gültige generatedAt Felder" {
  node scripts/build-graph.mjs
  node scripts/build-api-map.mjs
  g_ts=$(jq -r '.generatedAt' docs/generated/graph.json)
  a_ts=$(jq -r '.generatedAt' docs/generated/api-map.json)
  [ -n "$g_ts" ]
  [ "$g_ts" != "null" ]
  [ -n "$a_ts" ]
  [ "$a_ts" != "null" ]
}
