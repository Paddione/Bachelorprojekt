#!/usr/bin/env bats
# tests/spec/brain-k4-brain-wiki/chunking.bats
# Ticket: T002679
# SSOT-Spec: openspec/specs/brain-k4-brain-wiki.md
# Pruefmodus: Output-Verifikation — jeder Test fuehrt den Chunker aus und prueft
#   Exit-Code, TSV-Ausgabe und erzeugte Chunk-Dateien. Kein grep auf Skript-Interna.
# Aufrufform (verbindlich): bash scripts/brain-chunk.sh --source <pfad> --slug <quell-slug> --out-dir <dir> [--moc <datei>] [--target-chars <n>]

setup() {
  export BRAIN_CHUNK_TARGET_CHARS=8000
  CHUNKER="scripts/brain-chunk.sh"
}

# ── Fixture: OpenSpec spec with multiple Requirement headings ──
@test "chunker splits an OpenSpec spec at Requirement headings" {
  local src="$BATS_TEST_TMPDIR/spec-mit-requirements.md"
  local out="$BATS_TEST_TMPDIR/out"
  local slug="test-spec-with-requirements"

  # Build a test spec: 4 ### Requirement: headings, ~4200 chars of filler each
  # so the target of 8000 is exceeded with room to spare.
  local hdr="---\ntitle: Test\n---\n\n# Test Spec\n\nIntro paragraph.\n\n"
  printf '%b' "$hdr" > "$src"
  for i in $(seq 1 4); do
    printf '\n### Requirement: REQ-%02d\n\n' "$i" >> "$src"
    # ~4000 chars of filler (repeating a 100-char line 40 times)
    for j in $(seq 1 40); do
      printf 'L%-5d This is filler text for requirement REQ-%02d padding the chunk beyond the threshold. ' "$j" "$i" >> "$src"
    done
    printf '\n' >> "$src"
  done

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out"
  [ "$status" -eq 0 ]

  # Should produce more than 1 chunk
  local lines
  lines="$(printf '%s\n' "$output" | grep -c .)"
  [ "$lines" -gt 1 ]

  # The first substantive line of every chunk except chunk 1 should be a Requirement heading
  local idx=0
  while IFS=$'\t' read -r chunk_file _chunk_slug chunk_index _heading; do
    idx=$((idx + 1))
    [ -f "$chunk_file" ] || continue
    if [ "$chunk_index" -gt 1 ]; then
      local first_line
      first_line="$(head -1 "$chunk_file" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      # Should start with ### Requirement: (may have trailing filler on same line
      # if packed, so we check the prefix)
      [[ "$first_line" =~ ^###[[:space:]]+Requirement: ]] || {
        echo "chunk $chunk_index first line: '$first_line'" >&2
        false
      }
    fi
  done <<< "$output"
}

@test "no chunk exceeds the configured target size" {
  local src="$BATS_TEST_TMPDIR/spec-mit-requirements.md"
  local out="$BATS_TEST_TMPDIR/out"
  local slug="test-spec-size-check"

  local hdr="---\ntitle: Test\n---\n\n# Test Spec\n\nIntro.\n\n"
  printf '%b' "$hdr" > "$src"
  for i in $(seq 1 4); do
    printf '\n### Requirement: REQ-%02d\n\n' "$i" >> "$src"
    for j in $(seq 1 40); do
      printf 'L%-5d Padding text for requirement REQ-%02d past 8000 threshold. ' "$j" "$i" >> "$src"
    done
    printf '\n' >> "$src"
  done

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out"
  [ "$status" -eq 0 ]

  local chunk_count=0
  while IFS=$'\t' read -r chunk_file _chunk_slug _chunk_index _heading; do
    chunk_count=$((chunk_count + 1))
    local size
    size="$(wc -c < "$chunk_file")"
    [ "$size" -le 8000 ] || {
      echo "chunk $_chunk_index size $size exceeds 8000" >&2
      false
    }
  done <<< "$output"

  # Positiv-Anker: at least one chunk exists
  [ "$chunk_count" -gt 0 ]
}

@test "chunker falls back to H2 for sources without Requirement level" {
  local src="$BATS_TEST_TMPDIR/ohne-requirements.md"
  local out="$BATS_TEST_TMPDIR/out"
  local slug="test-no-requirements"

  # Build source with ## headings only (no ### Requirement:)
  echo "# Architecture Overview" > "$src"
  echo "" >> "$src"
  for i in $(seq 1 5); do
    echo "## Section $i" >> "$src"
    # ~4000 chars of filler each
    for j in $(seq 1 40); do
      printf 'L%-5d Filler for section %d in architecture doc past threshold. ' "$j" "$i" >> "$src"
    done
    echo "" >> "$src"
  done

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out"
  [ "$status" -eq 0 ]

  local lines
  lines="$(printf '%s\n' "$output" | grep -c .)"
  [ "$lines" -gt 1 ]

  # Concatenate all chunks in TSV order and diff against source
  local combined="$BATS_TEST_TMPDIR/combined.md"
  > "$combined"
  while IFS=$'\t' read -r chunk_file _chunk_slug _chunk_index _heading; do
    cat "$chunk_file" >> "$combined"
  done <<< "$output"

  # Normalize: trim leading/trailing blank lines from both
  local src_norm="$BATS_TEST_TMPDIR/src-norm.md"
  local comb_norm="$BATS_TEST_TMPDIR/comb-norm.md"
  sed -n '/./,$p' "$src" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' > "$src_norm" 2>/dev/null || cp "$src" "$src_norm"
  sed -n '/./,$p' "$combined" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' > "$comb_norm" 2>/dev/null || cp "$combined" "$comb_norm"

  diff "$src_norm" "$comb_norm" || {
    echo "chunk concatenation does not match source" >&2
    false
  }
}

@test "chunk manifest is TAB-separated with four columns" {
  local src="$BATS_TEST_TMPDIR/spec-mit-requirements.md"
  local out="$BATS_TEST_TMPDIR/out"
  local slug="test-tab-cols"

  local hdr="---\ntitle: Test\n---\n\n# Test\n\n"
  printf '%b' "$hdr" > "$src"
  for i in $(seq 1 2); do
    printf '\n### Requirement: REQ-%02d\n\n' "$i" >> "$src"
    for j in $(seq 1 40); do printf 'L%-5d Fill. ' "$j" "$i" >> "$src"; done
    printf '\n' >> "$src"
  done

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out"
  [ "$status" -eq 0 ]

  local prev_idx=0
  while IFS=$'\t' read -r chunk_file _chunk_slug chunk_index _heading; do
    # Exactly 4 fields
    local nf
    nf="$(printf '%s\t%s\t%s\t%s\n' "$chunk_file" "$_chunk_slug" "$chunk_index" "$_heading" | awk -F'\t' '{print NF}')"
    [ "$nf" -eq 4 ]

    # Column 1 must exist
    [ -f "$chunk_file" ]

    # Column 3 must be incrementing from 1
    [ "$chunk_index" -eq $((prev_idx + 1)) ]
    prev_idx="$chunk_index"
  done <<< "$output"
}

@test "chunk slugs sort lexicographically in numeric order" {
  local src="$BATS_TEST_TMPDIR/spec-mit-requirements.md"
  local out="$BATS_TEST_TMPDIR/out"
  local slug="test-sort"

  local hdr="---\ntitle: Test\n---\n\n# Test\n\n"
  printf '%b' "$hdr" > "$src"
  for i in $(seq 1 4); do
    printf '\n### Requirement: REQ-%02d\n\n' "$i" >> "$src"
    for j in $(seq 1 40); do printf 'L%-5d Fill. ' "$j" "$i" >> "$src"; done
    printf '\n' >> "$src"
  done

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out"
  [ "$status" -eq 0 ]

  # Sort by column 2 (lexical) and by column 3 (numeric), compare order
  local lex="$BATS_TEST_TMPDIR/lex.tsv"
  local num="$BATS_TEST_TMPDIR/num.tsv"
  printf '%s\n' "$output" | sort -t$'\t' -k2 > "$lex"
  printf '%s\n' "$output" | sort -t$'\t' -k3 -n > "$num"

  diff "$lex" "$num" || {
    echo "lexical sort by slug does not match numeric sort by index" >&2
    false
  }
}

@test "a source below the target size yields exactly one chunk" {
  local src="$BATS_TEST_TMPDIR/kurz.md"
  local out="$BATS_TEST_TMPDIR/out"
  local slug="test-short"

  echo "# Short Doc" > "$src"
  echo "" >> "$src"
  echo "This is a short document with just a few lines." >> "$src"
  echo "It should fit in a single chunk without splitting." >> "$src"

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out"
  [ "$status" -eq 0 ]

  local lines
  lines="$(printf '%s\n' "$output" | grep -c .)"
  [ "$lines" -eq 1 ]

  # Index must be 1
  local idx
  idx="$(printf '%s\n' "$output" | cut -f3)"
  [ "$idx" -eq 1 ]
}
