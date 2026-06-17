#!/usr/bin/env bats
# tests/unit/vda-release-notes-smoke.bats
# Offline test: release-notes subcommand dispatch + deterministic fallback

SCRIPT_DIR="$BATS_TEST_DIRNAME/../../scripts"
RN_SH="$SCRIPT_DIR/vda/release-notes.sh"

setup() {
  BIN_DIR="$BATS_TMPDIR/release-notes-stubs"
  rm -rf "$BIN_DIR"
  mkdir -p "$BIN_DIR"
}

teardown() {
  rm -rf "$BIN_DIR"
}

_stub_gh() {
  cat > "$BIN_DIR/gh" <<'GHSTUB'
#!/usr/bin/env bash
if [[ "$*" =~ pr[[:space:]]list ]]; then
  echo '[{"number":42,"title":"feat: add dark mode","labels":[],"mergedAt":"2026-06-17T00:00:00Z"},{"number":43,"title":"fix: login redirect loop","labels":[],"mergedAt":"2026-06-17T01:00:00Z"}]'
  exit 0
fi
echo "gh stub: $*" >&2
exit 0
GHSTUB
  chmod +x "$BIN_DIR/gh"
}

_stub_empty_gh() {
  cat > "$BIN_DIR/gh" <<'GHSTUB'
#!/usr/bin/env bash
echo '[]'
exit 0
GHSTUB
  chmod +x "$BIN_DIR/gh"
}

@test "release-notes help exits 0 and lists subcommands" {
  run bash "$RN_SH" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"generate"* ]]
  [[ "$output" == *"publish-github"* ]]
  [[ "$output" == *"publish-changelog"* ]]
}

@test "release-notes without args shows help and exits 0" {
  run bash "$RN_SH"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "release-notes unknown subcommand exits 2" {
  run bash "$RN_SH" nonexistent
  [ "$status" -eq 2 ]
  [[ "$output" == *"Unknown subcommand"* ]]
}

@test "vda.sh release-notes help exits 0" {
  run bash "$SCRIPT_DIR/vda.sh" release-notes help
  [ "$status" -eq 0 ]
  [[ "$output" == *"generate"* ]]
}

@test "vda.sh help lists release-notes" {
  run bash "$SCRIPT_DIR/vda.sh" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"release-notes"* ]]
}

@test "generate without gh/curl produces deterministic markdown via git log (offline fallback)" {
  # Ensure gh is not on PATH — force git-log fallback
  PATH=$(echo "$PATH" | tr ':' '\n' | grep -v 'node_modules' | tr '\n' ':')
  run bash "$RN_SH" generate
  [ "$status" -eq 0 ]
  # Should contain markdown section headers from git log fallback
  [[ "$output" == *"# Release Notes"* ]]
}

@test "generate with stubbed gh produces grouped markdown" {
  _stub_gh
  PATH="$BIN_DIR:$PATH" run bash "$RN_SH" generate --since v1.0.0
  [ "$status" -eq 0 ]
  [[ "$output" == *"# Release Notes"* ]]
  [[ "$output" == *"dark mode"* ]]
  [[ "$output" == *"login redirect"* ]]
}

@test "generate --out writes to file" {
  _stub_gh
  local out="$BATS_TMPDIR/notes.md"
  PATH="$BIN_DIR:$PATH" run bash "$RN_SH" generate --since v1.0.0 --out "$out"
  [ "$status" -eq 0 ]
  [ -f "$out" ]
  [[ "$(cat "$out")" == *"dark mode"* ]]
}

@test "publish-github --dry-run displays command" {
  _stub_gh
  local notes="$BATS_TMPDIR/notes.md"
  echo "# Test notes" > "$notes"
  PATH="$BIN_DIR:$PATH" run bash "$RN_SH" publish-github --tag v1.0.0 --notes-file "$notes" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY_RUN"* ]]
  [[ "$output" == *"gh release edit"* ]]
}

@test "publish-github requires --notes-file" {
  run bash "$RN_SH" publish-github --tag v1.0.0
  [ "$status" -eq 2 ]
  [[ "$output" == *"--notes-file is required"* ]]
}

@test "publish-changelog --dry-run displays preview" {
  local notes="$BATS_TMPDIR/notes.md"
  echo "# Test changelog entry" > "$notes"
  run bash "$RN_SH" publish-changelog --notes-file "$notes" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"DRY_RUN"* ]]
}

@test "publish-changelog requires --notes-file" {
  run bash "$RN_SH" publish-changelog
  [ "$status" -eq 2 ]
  [[ "$output" == *"--notes-file is required"* ]]
}

@test "publish-changelog with missing file exits 2" {
  run bash "$RN_SH" publish-changelog --notes-file /nonexistent/file.md
  [ "$status" -eq 2 ]
  [[ "$output" == *"Notes file not found"* ]]
}

@test "generate with empty gh output falls back to git log" {
  _stub_empty_gh
  PATH="$BIN_DIR:$PATH" run bash "$RN_SH" generate --since HEAD~10
  [ "$status" -eq 0 ]
  [[ "$output" == *"# Release Notes"* ]]
}
