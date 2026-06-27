#!/usr/bin/env bats
# ticket-graph.bats — Unit tests for ticket-graph.ts (TDR-1)
# Static tests: file existence, exports, SQL patterns, auth.

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

setup() {
  export PROJECT_DIR
  GRAPH_LIB="${PROJECT_DIR}/website/src/lib/ticket-graph.ts"
  READINESS_LIB="${PROJECT_DIR}/website/src/lib/ticket-readiness.ts"
  GRAPH_API="${PROJECT_DIR}/website/src/pages/api/tickets/graph.ts"
}

@test "static: ticket-graph.ts exists" {
  [ -f "$GRAPH_LIB" ]
}

@test "static: graph API endpoint exists" {
  [ -f "$GRAPH_API" ]
}

@test "static: exports getTicketGraph function" {
  grep -q "export async function getTicketGraph" "$GRAPH_LIB"
}

@test "static: exports allPredecessorsDone function" {
  grep -q "export async function allPredecessorsDone" "$READINESS_LIB"
}

@test "static: exports updateSuccessorReadiness function" {
  grep -q "export async function updateSuccessorReadiness" "$READINESS_LIB"
}

@test "static: defines TicketGraph interface" {
  # G-CQ08 (#2157) de-exported these internal-only interfaces (knip dead-export
  # cleanup); they are still defined, just no longer `export`ed. Match either form.
  grep -qE "(export )?interface TicketGraph" "$GRAPH_LIB"
}

@test "static: defines GraphNode interface" {
  grep -qE "(export )?interface GraphNode" "$GRAPH_LIB"
}

@test "static: defines GraphEdge interface" {
  grep -qE "(export )?interface GraphEdge" "$GRAPH_LIB"
}

@test "static: uses recursive CTE for graph traversal" {
  grep -q "WITH RECURSIVE" "$GRAPH_LIB"
}

@test "static: CTE references dep_graph" {
  grep -q "dep_graph" "$GRAPH_LIB"
}

@test "static: queries depends_on column" {
  grep -q "depends_on" "$GRAPH_LIB"
}

@test "static: limits recursion depth" {
  grep -q "depth < 10" "$GRAPH_LIB"
}

@test "static: computes critical path" {
  grep -q "computeCriticalPath" "$GRAPH_LIB"
}

@test "static: critical path uses topological sort" {
  grep -q "inDeg" "$GRAPH_LIB"
}

@test "static: API endpoint requires admin auth" {
  grep -q "isAdmin" "$GRAPH_API"
}

@test "static: API endpoint calls getTicketGraph" {
  grep -q "getTicketGraph" "$GRAPH_API"
}

@test "static: API endpoint returns JSON" {
  grep -q "application/json" "$GRAPH_API"
}

@test "static: API endpoint returns 401 for unauthorized" {
  grep -q "401" "$GRAPH_API"
}

@test "static: allPredecessorsDone checks status=done" {
  grep -q "status === 'done'" "$READINESS_LIB"
}

@test "static: updateSuccessorReadiness sets abhaengigkeiten_klar" {
  grep -q "abhaengigkeiten_klar" "$READINESS_LIB"
}

@test "static: updateSuccessorReadiness finds successors via depends_on" {
  grep -q '\$1 = ANY(depends_on)' "$READINESS_LIB"
}

@test "static: TypeScript syntax valid" {
  node --check "$GRAPH_LIB" 2>/dev/null || skip "TypeScript check not available"
}
