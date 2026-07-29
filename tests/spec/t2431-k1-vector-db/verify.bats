#!/usr/bin/env bats

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "T002431: K1 Vector DB documentation exists and contains expected content" {
  [ -f "$PROJECT_DIR/docs/diagrams/k1-vector-db.md" ]
  grep -q "code_embeddings" "$PROJECT_DIR/docs/diagrams/k1-vector-db.md"
  grep -q "knowledge.chunks" "$PROJECT_DIR/docs/diagrams/k1-vector-db.md"
}
