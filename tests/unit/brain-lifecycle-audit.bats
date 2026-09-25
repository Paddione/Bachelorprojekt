#!/usr/bin/env bats
# Tests for scripts/brain-lifecycle-audit.py (T900401): (self)-sourced meta
# pages are exempt from metadata_unknown, ordinary pages are not.

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brain-lifecycle-audit.py"

setup() {
  TESTDIR="$(mktemp -d)"
  mkdir -p "$TESTDIR/root" "$TESTDIR/brain/wiki"
  echo "# live" > "$TESTDIR/root/live.md"
  printf -- '---\ntype: moc\ntags: [index, meta]\nstatus: active\nsource:: brain-foundation (self)\n---\n\n# Meta Front\n' > "$TESTDIR/brain/wiki/meta-front.md"
  printf -- '---\ntype: moc\ntags: [index, meta]\nstatus: active\n---\n\n# Meta Body\n\nsource:: brain-foundation (self)\n' > "$TESTDIR/brain/wiki/meta-body.md"
  printf -- '---\ntype: note\ntags: [note]\nstatus: active\n---\n\n# Plain\n\nsource:: Bachelorprojekt live.md\n' > "$TESTDIR/brain/wiki/plain.md"
}

teardown() {
  rm -rf "$TESTDIR"
}

@test "meta pages exempt (frontmatter and body placement), ordinary page flagged" {
  run python3 "$SCRIPT" --brain-repo "$TESTDIR/brain" --source-root "$TESTDIR/root"
  [ "$status" -eq 1 ]
  [[ "$output" == *"slug=plain"* ]]
  [[ "$output" != *"slug=meta-front"* ]]
  [[ "$output" != *"slug=meta-body"* ]]
}
