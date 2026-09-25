#!/usr/bin/env bats
# Tests for scripts/brain-chunk.sh oversized-paragraph splitting: a single
# fenced code block larger than the target becomes sequential (Teil i/N)
# part-chunks whose concatenation reproduces the fence byte-exact; an
# oversized markdown table splits at row boundaries with the header pair
# repeated on every part.

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/brain-chunk.sh"

setup() {
  TESTDIR="$(mktemp -d)"
}

teardown() {
  rm -rf "$TESTDIR"
}

@test "splits oversized fenced block into sequential parts" {
  {
    echo "## Diagram"
    echo ""
    echo '```mermaid'
    echo "flowchart LR"
    for i in $(seq 1 200); do printf '  node%03d -->|edge%03d| node%03d\n' "$i" "$i" "$((i + 1))"; done
    echo '```'
  } > "$TESTDIR/src.md"
  run bash "$SCRIPT" --source "$TESTDIR/src.md" --slug t-fence \
    --out-dir "$TESTDIR/out" --target-chars 2000
  [ "$status" -eq 0 ]
  # ~6k fence at target 2000 -> heading chunk + at least 3 fence parts,
  # every file within target.
  [ "$(ls "$TESTDIR"/out/*.md | wc -l)" -ge 4 ]
  for f in "$TESTDIR"/out/*.md; do
    [ "$(wc -c < "$f")" -le 2000 ]
  done
  [[ "$output" == *"(Teil 1/"* ]]
}

@test "part-chunks reassemble to the original fence bytes" {
  {
    echo "## Diagram"
    echo ""
    echo '```mermaid'
    echo "flowchart LR"
    for i in $(seq 1 200); do printf '  node%03d -->|edge%03d| node%03d\n' "$i" "$i" "$((i + 1))"; done
    echo '```'
  } > "$TESTDIR/src.md"
  run bash "$SCRIPT" --source "$TESTDIR/src.md" --slug t-fence \
    --out-dir "$TESTDIR/out" --target-chars 2000
  [ "$status" -eq 0 ]
  # Manifest order is part order; figure lines (200 edges) carry the content.
  cat "$TESTDIR"/out/t-fence-*.md | grep -c -- "-->" | grep -qx "200"
  # No edge line is truncated: every emitted edge line matches the generator.
  cat "$TESTDIR"/out/t-fence-*.md | grep -- "-->" | grep -qvE "^  node[0-9]{3} -->\|edge[0-9]{3}\| node[0-9]{3}$" && return 1
  return 0
}

@test "splits oversized markdown table with repeated header" {
  {
    echo "## Endpoints"
    echo ""
    echo "| a | b |"
    echo "|---|---|"
    for i in $(seq 1 200); do printf '| row%03d | value%03d |\n' "$i" "$i"; done
  } > "$TESTDIR/src.md"
  run bash "$SCRIPT" --source "$TESTDIR/src.md" --slug t-split-table \
    --out-dir "$TESTDIR/out" --target-chars 2000
  [ "$status" -eq 0 ]
  # ~4.6k table at target 2000 -> heading chunk + at least 2 table parts.
  [ "$(ls "$TESTDIR"/out/*.md | wc -l)" -ge 3 ]
  for f in "$TESTDIR"/out/*.md; do
    [ "$(wc -c < "$f")" -le 2000 ]
  done
  # Every multi-row part carries the header pair; all 200 rows present once.
  for f in "$TESTDIR"/out/t-split-table-*.md; do
    grep -q "^| a | b |$" "$f" || [ "$(grep -c "^|" "$f")" -le 1 ]
  done
  [ "$(cat "$TESTDIR"/out/*.md | grep -c "^| row")" -eq 200 ]
  [[ "$output" == *"(Teil 1/"* ]]
}

@test "small table packs whole without parts" {
  {
    echo "## Endpoints"
    echo ""
    echo "| a | b |"
    echo "|---|---|"
    for i in $(seq 1 5); do printf '| row%03d | value%03d |\n' "$i" "$i"; done
  } > "$TESTDIR/src.md"
  run bash "$SCRIPT" --source "$TESTDIR/src.md" --slug t-small-table \
    --out-dir "$TESTDIR/out" --target-chars 2000
  [ "$status" -eq 0 ]
  [ "$(ls "$TESTDIR"/out/*.md | wc -l)" -eq 1 ]
  [[ "$output" != *"(Teil"* ]]
}

@test "oversized non-fence non-table paragraph still emitted whole" {
  {
    echo "## Big list"
    echo ""
    for i in $(seq 1 200); do printf -- '- item%03d with some filling text to reach the target size\n' "$i"; done
  } > "$TESTDIR/src.md"
  run bash "$SCRIPT" --source "$TESTDIR/src.md" --slug t-list \
    --out-dir "$TESTDIR/out" --target-chars 2000
  [ "$status" -eq 0 ]
  # A bullet list is one paragraph but neither fence nor table: all items
  # land in a single chunk file exceeding the target (fail-closed).
  first="$(grep -l "item001" "$TESTDIR"/out/*.md)"
  last="$(grep -l "item200" "$TESTDIR"/out/*.md)"
  [ "$first" = "$last" ]
  [ "$(wc -c < "$first")" -gt 2000 ]
}
