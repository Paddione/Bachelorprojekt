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

# ── T002261-M2: index-repo-incremental.sh must not suppress errors ────#
#
# The incremental reindex script must not silently swallow errors via
# `2>/dev/null` or `|| true`. Errors should be logged with a warning
# (matching the pattern in .githooks/post-commit-index) so operators
# can see when reindexing fails.

@test "T002261-M2: index-repo-incremental.sh does not suppress stderr with 2>/dev/null" {
  # The npx tsx call must NOT redirect stderr to /dev/null
  run grep -n '2>/dev/null' "$PROJECT_DIR/scripts/index-repo-incremental.sh"
  [[ "$status" -ne 0 ]]
}

@test "T002261-M2: index-repo-incremental.sh does not discard exit codes with || true" {
  # The npx tsx call must NOT be followed by || true to discard failures
  run grep -n '|| true' "$PROJECT_DIR/scripts/index-repo-incremental.sh"
  [[ "$status" -ne 0 ]]
}

@test "SCS-1: index-repo.ts classifies infrastructure errors (T002292)" {
  run grep -c 'isInfrastructureError' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 2 ]]
}

@test "SCS-1: index-repo.ts reports unchanged and failed files separately (T002292)" {
  run grep -c 'unchanged_files' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
  run grep -c 'failed_files' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: scs:index does not use fuser -k, which kills its own shell (T002292)" {
  # fuser -k signalisiert die eigene Prozessgruppe mit und beendet damit die
  # aufrufende Shell — im Taskfile faellt das nur deshalb nicht auf, weil
  # go-task jeden cmds-Block in einer eigenen Shell startet.
  #
  # Geprueft werden nur ausfuehrbare Zeilen: der Task erklaert in einem
  # Kommentar, WARUM hier kein fuser steht, und dieser Kommentar darf den
  # Guard nicht ausloesen.
  run bash -c "sed -n '/^  scs:index:/,/^  scs:search:/p' '$PROJECT_DIR/Taskfile.yml' \
    | grep -v '^[[:space:]]*#' | grep -c 'fuser -k'"
  [[ "$output" -eq 0 ]]
}

@test "SCS-1: scs:index retry loop captures exit code with || (T002292)" {
  # go-task fuehrt jeden cmds-Block mit set -e-Semantik aus. Ohne `|| rc=$?`
  # bricht die Shell beim ersten fehlschlagenden Indexer-Lauf ab, bevor der
  # Exit-Code gelesen wird — die Retry-Schleife kaeme nie zum Zug.
  run bash -c "sed -n '/^  scs:index:/,/^  scs:search:/p' '$PROJECT_DIR/Taskfile.yml' | grep -c 'npx tsx scripts/index-repo.ts || rc='"
  [[ "$output" -eq 1 ]]
}

@test "SCS-1: ensureSchema detects the vector index by access method, not by name (T002315)" {
  # Die alte Pruefung lief ueber `indexname LIKE '%ivfflat%'` und traf nie zu:
  # Postgres benennt einen namenlosen CREATE INDEX nach Tabelle und Spalte
  # (code_embeddings_embedding_idx, _idx1, _idx2 …), nie nach der
  # Zugriffsmethode. Jeder Lauf legte deshalb einen weiteren Index an — am
  # 2026-07-27 lagen drei identische ivfflat-Indizes auf der Tabelle.
  # Nur ausfuehrbare Zeilen pruefen — der Kommentar im Code zitiert die alte
  # Abfrage absichtlich und darf den Guard nicht ausloesen.
  run bash -c "grep -v '^\\s*//' '$PROJECT_DIR/scripts/index-repo.ts' | grep -c \"indexname LIKE '%ivfflat%'\" || true"
  [[ "$output" -eq 0 ]]
  run grep -c "am.amname IN ('hnsw', 'ivfflat')" "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -eq 1 ]]
}

@test "SCS-1: vector index is HNSW, not ivfflat (T002315)" {
  run grep -c "USING hnsw (embedding vector_cosine_ops)" "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
  # kein CREATE eines ivfflat-Index mehr
  run bash -c "grep -c 'CREATE INDEX.*USING ivfflat' '$PROJECT_DIR/scripts/index-repo.ts' || true"
  [[ "$output" -eq 0 ]]
}

@test "SCS-1: chunks are written in multi-row inserts (T002315)" {
  # Ein INSERT pro Chunk kostete ~30ms Roundtrip — bei 18.549 Chunks rund neun
  # Minuten, waehrend das Einbetten derselben Menge ~110s braucht.
  run grep -c 'INSERT_BATCH' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 2 ]]
}

@test "SCS-1: parallelism defaults to one worker (T002315)" {
  # Der Regelfall ist der inkrementelle Lauf aus dem git-Hook; Nebenlaeufigkeit
  # lohnt nur beim Voll-Neuaufbau (SCS_WORKERS=4).
  run grep -c "process.env.SCS_WORKERS ?? 1" "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -eq 1 ]]
}

@test "SCS-1: files containing NUL bytes are skipped before the insert (T002315)" {
  # Postgres laesst 0x00 in einer TEXT-Spalte strukturell nicht zu.
  run grep -c "u0000" "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: chunking lives in its own module (T002315)" {
  [[ -f "$PROJECT_DIR/scripts/lib/scs-chunking.ts" ]]
  run grep -c "from './lib/scs-chunking.js'" "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}
