#!/usr/bin/env bats
# tests/spec/brain-gekko-inbox.bats
# SSOT: openspec/changes/brain-llm-wiki/proposal.md (Change 6: brain-gekko-inbox)
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  INBOX="$REPO_ROOT/scripts/brain-gekko-inbox.sh"
  WORK="$(mktemp -d)"
  mkdir -p "$WORK/inbox" "$WORK/wiki"
}
teardown() { rm -rf "$WORK"; }

@test "inbox creates a new wiki page from input" {
  echo "# My New Note\n\ncontent here" > "$WORK/inbox/new-note.md"
  run bash "$INBOX" "$WORK/inbox/new-note.md" "$WORK/wiki" --title "My New Note" --tags test,gekko
  [ "$status" -eq 0 ]
  [ -f "$WORK/wiki/new-note.md" ]
  grep -q "type: note" "$WORK/wiki/new-note.md"
}

@test "inbox rejects missing source file" {
  run bash "$INBOX" "$WORK/inbox/nonexistent.md" "$WORK/wiki"
  [ "$status" -ne 0 ]
}
