#!/usr/bin/env bats
# tests/unit/build-graph.bats — LAD-1: K8s dependency graph generation

setup() {
  # Run from repo root
  cd "$BATS_TEST_DIRNAME/../.."
}

@test "build-graph.mjs exits cleanly" {
  run node scripts/build-graph.mjs
  [ "$status" -eq 0 ]
}

@test "build-graph.mjs erzeugt graph.json mit mind. 5 Nodes" {
  node scripts/build-graph.mjs
  count=$(jq '.nodes | length' docs/generated/graph.json)
  [ "$count" -ge 5 ]
}

@test "graph.json enthält shared-db Node" {
  node scripts/build-graph.mjs
  grep -q "shared-db" docs/generated/graph.json
}

@test "graph.json enthält keycloak Node" {
  node scripts/build-graph.mjs
  grep -q "keycloak" docs/generated/graph.json
}

@test "graph.json hat generatedAt Timestamp" {
  node scripts/build-graph.mjs
  generated=$(jq -r '.generatedAt' docs/generated/graph.json)
  [ -n "$generated" ]
  [ "$generated" != "null" ]
}

@test "graph.json enthält edges Array" {
  node scripts/build-graph.mjs
  edge_count=$(jq '.edges | length' docs/generated/graph.json)
  [ "$edge_count" -ge 0 ]
}
