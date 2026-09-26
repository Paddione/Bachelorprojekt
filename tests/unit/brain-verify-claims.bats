#!/usr/bin/env bats
# Tests for scripts/brain-verify-claims.sh (T900403). LLM cases skip when the
# local endpoint is unreachable (CI has no model); arg validation always runs.

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brain-verify-claims.sh"
LM_URL="${LM_STUDIO_URL:-http://127.0.0.1:1919}"

setup() {
  TESTDIR="$(mktemp -d)"
  mkdir -p "$TESTDIR/root/docs" "$TESTDIR/brain/wiki"
  {
    echo "## Alpha"
    echo "Der Dienst lauscht auf Port 1919."
    printf -- '- Pufferzeile %04d\n' $(seq 1 300)
    echo "## Beta"
    echo "Die Statusfarbe ist blau."
    printf -- '- Pufferzeile %04d\n' $(seq 301 600)
  } > "$TESTDIR/root/docs/mini.md"
  cat > "$TESTDIR/state.json" <<'EOF'
{
  "docs/mini.md#1": {"slug": "page-ok", "type": "note"},
  "docs/mini.md#2": {"slug": "page-bad", "type": "note"}
}
EOF
  printf -- '---\ntype: note\n---\n\n# Ok\n\nDer Dienst lauscht auf Port 1919.\n\nSiehe auch [[page-bad]] für Details.\n' \
    > "$TESTDIR/brain/wiki/page-ok.md"
  printf -- '---\ntype: note\n---\n\n# Bad\n\nDie Statusfarbe ist rot.\n' \
    > "$TESTDIR/brain/wiki/page-bad.md"
}

teardown() {
  rm -rf "$TESTDIR"
}

@test "missing source fails fast without LLM" {
  run bash "$SCRIPT" --source docs/nonexistent.md --wiki-dir "$TESTDIR/brain/wiki" \
    --root "$TESTDIR/root" --state "$TESTDIR/state.json"
  [ "$status" -eq 2 ]
}

@test "flags contradiction, passes faithful summary" {
  if ! curl -sf -m 8 "$LM_URL/health" >/dev/null 2>&1; then
    skip "LLM endpoint unreachable"
  fi
  run bash "$SCRIPT" --source docs/mini.md --wiki-dir "$TESTDIR/brain/wiki" \
    --root "$TESTDIR/root" --state "$TESTDIR/state.json" --max-pairs 0
  [ "$status" -eq 0 ]
  [[ "$output" == *"CLAIMS-OK: page-ok"* ]]
  [[ "$output" == *"CLAIMS-FINDING: page-bad"* ]]
  [[ "$output" == *"rot"* ]]
}
