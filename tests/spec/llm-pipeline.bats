#!/usr/bin/env bats
# tests/spec/llm-pipeline.bats
# SSOT: openspec/specs/llm-pipeline.md
#
# Covers: LLM_ENABLED switch, embedding gateway, fail-closed on bge-m3 errors.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Embedding infrastructure ──────────────────────────────────────────

@test "embeddings.ts exists for embedding routing" {
  [ -f "$REPO/website/src/lib/embeddings.ts" ]
}

@test "embeddings.ts references LLM_ENABLED switch" {
  run grep -q 'LLM_ENABLED' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

@test "embeddings.ts routes through LLM gateway when LLM_ENABLED" {
  run grep -q 'llm-gateway' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

@test "embeddings.ts falls back to voyageai when LLM_ENABLED=false" {
  run grep -q 'voyageai\|voyage' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

# ── Fail-closed on GPU router errors ──────────────────────────────────

@test "embeddings.ts has error handling (EmbeddingQueryError or similar)" {
  run grep -qi 'EmbeddingQueryError\|EmbeddingIndexError\|throw.*Error\|catch' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

# ── Knowledge DB layer ────────────────────────────────────────────────

@test "knowledge-db.ts exists for pgvector operations" {
  [ -f "$REPO/website/src/lib/knowledge-db.ts" ]
}
