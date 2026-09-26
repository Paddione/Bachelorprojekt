#!/usr/bin/env bats
# Tests for scripts/brain-verify-refs.sh (T900403): dangling file refs found,
# live refs/URLs/wikilinks/own-source skipped; report-only exit 0.

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brain-verify-refs.sh"
TICKET="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"

setup() {
  TESTDIR="$(mktemp -d)"
  mkdir -p "$TESTDIR/root/docs" "$TESTDIR/brain/wiki"
  echo "# ok" > "$TESTDIR/root/docs/ok.md"
  cat > "$TESTDIR/brain/wiki/page.md" <<'EOF'
---
type: note
tags: [note]
status: active
---

# Page

Live `docs/ok.md` und tot `docs/gone.md` sowie kahl scripts/missing.sh.
State-Key `docs/ok.md#1` löst auf die Datei auf.
Schema `docs/*` und `openspec/changes/<slug>/` sind keine Befunde.
Kommando `docs/ok.md --flag` löst auf die Datei auf.
Prosa tools/list und k3d/k3s sind keine Befunde.
MCP-Methode `tools/call` ist kein Pfad.
URL https://example.com/docs/gone.md ist kein Befund.
Siehe [[docs-gone]] und T123456 ohne Flag.

source:: Bachelorprojekt docs/ok.md
EOF
}

teardown() {
  rm -rf "$TESTDIR"
}

@test "finds dangling paths, skips live/URL/wikilink/own-source/ticket" {
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --slugs page
  [ "$status" -eq 0 ]
  [[ "$output" == *"DANGLING-REF: wiki/page.md"* ]]
  [[ "$output" == *"docs/gone.md"* ]]
  [[ "$output" == *"scripts/missing.sh"* ]]
  [[ "$output" != *"docs/ok.md"* ]]
  [[ "$output" != *"example.com"* ]]
  [[ "$output" != *"docs-gone"* ]]
  [[ "$output" != *"T123456"* ]]
  [[ "$output" == *"2 dangling"* ]]
}

@test "default scope diffs the delivery branch" {
  git -C "$TESTDIR/brain" init -q -b main 2>/dev/null
  git -C "$TESTDIR/brain" -c user.email=t@t -c user.name=t add wiki/page.md
  git -C "$TESTDIR/brain" -c user.email=t@t -c user.name=t commit -qm init
  git -C "$TESTDIR/brain" checkout -qb delivery 2>/dev/null
  echo "tot docs/gone2.md" >> "$TESTDIR/brain/wiki/page.md"
  git -C "$TESTDIR/brain" -c user.email=t@t -c user.name=t commit -qam change
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --branch-diff main
  [ "$status" -eq 0 ]
  [[ "$output" == *"docs/gone.md"* ]]
  [[ "$output" == *"docs/gone2.md"* ]]
}

@test "ticket check verifies IDs against the DB when reachable" {
  run bash "$TICKET" get --id T900402
  if [ "$status" -ne 0 ]; then
    skip "ticket DB unreachable"
  fi
  printf -- '---\ntype: note\n---\n\n# T\n\nEcht T900402, erfunden T999999.\n' \
    > "$TESTDIR/brain/wiki/tk.md"
  run bash "$SCRIPT" --brain-repo "$TESTDIR/brain" --root "$TESTDIR/root" \
    --slugs tk --check-tickets
  [ "$status" -eq 0 ]
  [[ "$output" == *"DANGLING-TICKET: wiki/tk.md:"*T999999* ]]
  [[ "$output" != *"DANGLING-TICKET: wiki/tk.md:"*T900402* ]]
}
