#!/usr/bin/env bats
# tests/spec/openspec-embedding.bats
# SSOT: openspec/specs/openspec-pgvector.md (delta in openspec/changes/openspec-pgvector/)
# Verifies the embed hook is best-effort and dry-run never writes.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TMP="$(mktemp -d)"
  export OPENSPEC_ROOT="$TMP/openspec"
  export TICKET_OFFLINE=1
  mkdir -p "$OPENSPEC_ROOT/changes/demo/specs"
  printf -- '---\nticket_id: T000001\nstatus: planning\n---\n# Proposal: demo\n' > "$OPENSPEC_ROOT/changes/demo/proposal.md"
  printf -- '---\nticket_id: T000001\nstatus: planning\n---\n# Tasks: demo\n\n## One\n\nstep\n' > "$OPENSPEC_ROOT/changes/demo/tasks.md"
  printf '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL …\n' > "$OPENSPEC_ROOT/changes/demo/specs/demo.md"
}

teardown() { rm -rf "$TMP"; }

@test "apply triggers the embed hook without aborting on embed failure" {
  # No DB/TEI reachable in CI → embed CLI must exit 0 and apply must succeed.
  run bash "$REPO/scripts/openspec.sh" apply demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"applied: demo"* ]]
}

@test "openspec.sh apply references the embed CLI" {
  run grep -q 'openspec-embed.mjs' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

@test "openspec.sh archive references the embed CLI" {
  run bash -c "grep -c 'openspec-embed.mjs' '$REPO/scripts/openspec.sh'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}

@test "embed CLI dry-run writes nothing and exits 0" {
  run bash -c "OPENSPEC_EMBED_REPO='$TMP' node '$REPO/scripts/openspec-embed.mjs' --slug demo --dry-run"
  [ "$status" -eq 0 ]
  [[ "$output" == *"dry-run"* ]]
}
