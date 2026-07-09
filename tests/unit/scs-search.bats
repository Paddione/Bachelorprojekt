#!/usr/bin/env bats
# scs-search.bats — Tests for the Semantic Code Search API (SCS-2 + SCS-3).
# Verifies API route, codesearch-db module, and augmented search structure.
# Does NOT require a live DB connection (offline-safe).

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

@test "SCS-2: website/src/pages/api/codesearch.ts exists" {
  [[ -f "$PROJECT_DIR/website/src/pages/api/codesearch.ts" ]]
}

@test "SCS-2: codesearch API requires admin auth" {
  run grep -c 'isAdmin' "$PROJECT_DIR/website/src/pages/api/codesearch.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-2: codesearch API validates query parameter q" {
  run grep -c "searchParams.get('q')" "$PROJECT_DIR/website/src/pages/api/codesearch.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-2: codesearch API returns 503 when embedding service unavailable" {
  run grep -c 'embedding service unavailable' "$PROJECT_DIR/website/src/pages/api/codesearch.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-2: codesearch API supports augmented query parameter" {
  run grep -c 'augmented' "$PROJECT_DIR/website/src/pages/api/codesearch.ts"
  [[ "$output" -ge 2 ]]
}

@test "SCS-2: website/src/lib/codesearch-db.ts exists" {
  [[ -f "$PROJECT_DIR/website/src/lib/codesearch-db.ts" ]]
}

@test "SCS-2: codesearch-db.ts has searchCode function" {
  run grep -c 'export async function searchCode' "$PROJECT_DIR/website/src/lib/codesearch-db.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-2: codesearch-db.ts uses pgvector cosine distance operator" {
  run grep -c '<=>' "$PROJECT_DIR/website/src/lib/codesearch-db.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-3: codesearch-db.ts has searchCodeAugmented function" {
  run grep -c 'export async function searchCodeAugmented' "$PROJECT_DIR/website/src/lib/codesearch-db.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-3: searchCodeAugmented queries file_dependencies for 1-hop neighbors" {
  run grep -c 'file_dependencies' "$PROJECT_DIR/website/src/lib/codesearch-db.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-3: augmented neighbors get score=0.7" {
  run grep 'score: 0.7' "$PROJECT_DIR/website/src/lib/codesearch-db.ts"
  [[ "$status" -eq 0 ]]
}

@test "SCS-4: DetailPanel.svelte has suggested_files section" {
  run grep -c 'suggested_files' "$PROJECT_DIR/website/src/components/factory/DetailPanelSidebar.svelte"
  [[ "$output" -ge 2 ]]
}

@test "SCS-4: DetailPanel.svelte has scoreColor function" {
  run grep -c 'scoreColor' "$PROJECT_DIR/website/src/components/factory/SuggestedFiles.svelte"
  [[ "$output" -ge 1 ]]
}

@test "SCS-4: factory-floor.ts TicketDetail has suggested_files field" {
  run grep -c 'suggested_files' "$PROJECT_DIR/website/src/lib/factory-floor.ts"
  [[ "$output" -ge 2 ]]
}

@test "SCS-4: pipeline.js has SCS query in Scout phase" {
  run grep -c 'codesearch' "$PROJECT_DIR/scripts/factory/pipeline.js"
  [[ "$output" -ge 1 ]]
}

@test "SCS-4: pipeline.js SCS has graceful degradation (try/catch)" {
  run grep -c 'graceful degradation' "$PROJECT_DIR/scripts/factory/pipeline.js"
  [[ "$output" -ge 1 ]]
}

@test "SCS-5: .githooks/post-commit-index exists and is executable" {
  [[ -f "$PROJECT_DIR/.githooks/post-commit-index" ]]
  [[ -x "$PROJECT_DIR/.githooks/post-commit-index" ]]
}

@test "SCS-5: post-commit-index filters for indexable file extensions" {
  run grep -c 'ts\|svelte\|astro\|yaml' "$PROJECT_DIR/.githooks/post-commit-index"
  [[ "$output" -ge 1 ]]
}

@test "SCS-5: scripts/index-repo-incremental.sh exists and is executable" {
  [[ -f "$PROJECT_DIR/scripts/index-repo-incremental.sh" ]]
  [[ -x "$PROJECT_DIR/scripts/index-repo-incremental.sh" ]]
}

@test "SCS-5: Taskfile.yml has scs:index task" {
  run grep -c 'scs:index' "$PROJECT_DIR/Taskfile.yml"
  [[ "$output" -ge 1 ]]
}

@test "SCS-5: Taskfile.yml has scs:search task" {
  run grep -c 'scs:search' "$PROJECT_DIR/Taskfile.yml"
  [[ "$output" -ge 1 ]]
}

@test "SCS-5: secrets:install-hooks includes post-commit-index" {
  run grep -c 'post-commit-index' "$PROJECT_DIR/Taskfile.yml"
  [[ "$output" -ge 1 ]]
}

@test "SCS-5: .githooks/post-commit exists, is executable, and dispatches to post-commit-index" {
  # git only ever auto-invokes a hook file named exactly "post-commit" —
  # "post-commit-index" alone is never picked up regardless of
  # core.hooksPath [T001692]. This dispatcher is the real entrypoint.
  [[ -f "$PROJECT_DIR/.githooks/post-commit" ]]
  [[ -x "$PROJECT_DIR/.githooks/post-commit" ]]
  run grep -c 'post-commit-index' "$PROJECT_DIR/.githooks/post-commit"
  [[ "$output" -ge 1 ]]
}

@test "SCS-5: secrets:install-hooks chmods post-commit" {
  run grep -c 'chmod +x .githooks/post-commit$' "$PROJECT_DIR/Taskfile.yml"
  [[ "$output" -ge 1 ]]
}
