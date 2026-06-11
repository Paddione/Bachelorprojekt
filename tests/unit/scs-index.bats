#!/usr/bin/env bats
# scs-index.bats — Tests for the Semantic Code Search indexer (SCS-1).
# Verifies script existence, schema SQL, chunking logic, and file structure.
# Does NOT require a live DB connection (offline-safe).

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

@test "SCS-1: scripts/index-repo.ts exists and is non-empty" {
  [[ -f "$PROJECT_DIR/scripts/index-repo.ts" ]]
  [[ -s "$PROJECT_DIR/scripts/index-repo.ts" ]]
}

@test "SCS-1: index-repo.ts contains code_embeddings table DDL" {
  run grep -c 'code_embeddings' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 3 ]]
}

@test "SCS-1: index-repo.ts contains file_dependencies table DDL" {
  run grep -c 'file_dependencies' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 2 ]]
}

@test "SCS-1: index-repo.ts uses vector(1024) for bge-m3 dimension" {
  run grep -c 'EMBED_DIM' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 2 ]]
}

@test "SCS-1: index-repo.ts supports --file flag for incremental reindex" {
  run grep -c '\-\-file' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: index-repo.ts uses bge-m3 model" {
  run grep -c 'bge-m3' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: index-repo.ts extracts imports for dependency graph" {
  run grep -c 'extractImports' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: index-repo.ts ignores node_modules and dist" {
  run grep 'node_modules' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$status" -eq 0 ]]
  run grep "'dist'" "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$status" -eq 0 ]]
}

@test "SCS-1: index-repo.ts chunks YAML separately from source" {
  run grep -c 'chunkYaml' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: index-repo.ts has sha256 file hashing for incremental" {
  run grep -c 'sha256' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: index-repo.ts uses ivfflat index for cosine similarity" {
  run grep -c 'ivfflat' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: schema SQL creates UNIQUE constraint on file_path + chunk_index" {
  run grep 'UNIQUE(file_path, chunk_index)' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$status" -eq 0 ]]
}
