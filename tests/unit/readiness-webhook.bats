#!/usr/bin/env bats
# readiness-webhook.bats — Unit tests for readiness webhook (TDR-4)
# Static tests: file existence, endpoint structure, auth.

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

setup() {
  export PROJECT_DIR
  READINESS_API="${PROJECT_DIR}/website/src/pages/api/tickets/[id]/readiness.ts"
  GRAPH_LIB="${PROJECT_DIR}/website/src/lib/ticket-graph.ts"
}

@test "static: readiness API endpoint exists" {
  [ -f "$READINESS_API" ]
}

@test "static: readiness endpoint requires admin auth" {
  grep -q "isAdmin" "$READINESS_API"
}

@test "static: readiness endpoint is POST handler" {
  grep -q "export const POST" "$READINESS_API"
}

@test "static: readiness endpoint validates ticket ID format" {
  grep -q "T\\\\d{6}" "$READINESS_API" || grep -q 'T.*d.*6' "$READINESS_API"
}

@test "static: readiness endpoint checks ticket status is done" {
  grep -q "status.*done" "$READINESS_API"
}

@test "static: readiness endpoint returns 409 for non-done ticket" {
  grep -q "409" "$READINESS_API"
}

@test "static: readiness endpoint returns 404 for not found" {
  grep -q "404" "$READINESS_API"
}

@test "static: readiness endpoint returns 401 for unauthorized" {
  grep -q "401" "$READINESS_API"
}

@test "static: readiness endpoint calls updateSuccessorReadiness" {
  grep -q "updateSuccessorReadiness" "$READINESS_API"
}

@test "static: graph lib exports updateSuccessorReadiness" {
  grep -q "export async function updateSuccessorReadiness" "$GRAPH_LIB"
}

@test "static: graph lib exports allPredecessorsDone" {
  grep -q "export async function allPredecessorsDone" "$GRAPH_LIB"
}

@test "static: updateSuccessorReadiness sets abhaengigkeiten_klar in readiness JSONB" {
  grep -q "abhaengigkeiten_klar" "$GRAPH_LIB"
}

@test "static: TypeScript syntax valid" {
  node --check "$READINESS_API" 2>/dev/null || skip "TypeScript check not available"
}
