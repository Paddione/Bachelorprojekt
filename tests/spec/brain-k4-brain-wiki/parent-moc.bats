#!/usr/bin/env bats
# tests/spec/brain-k4-brain-wiki/parent-moc.bats
# Ticket: T002679
# SSOT-Spec: openspec/specs/brain-k4-brain-wiki.md
# Pruefmodus: Output-Verifikation — fuehrt den Chunker mit --moc aus und prueft
#   die erzeugte MOC-Datei gegen das TSV-Manifest.

setup() {
  export BRAIN_CHUNK_TARGET_CHARS=8000
  CHUNKER="scripts/brain-chunk.sh"
}

@test "parent MOC links exactly one wikilink per chunk" {
  local src="$BATS_TEST_TMPDIR/multi-req.md"
  local out="$BATS_TEST_TMPDIR/out"
  local moc_file="$BATS_TEST_TMPDIR/parent-moc.md"
  local slug="test-moc-source"

  # Build multi-section source (>8000 chars → multiple chunks)
  local hdr="---\ntitle: MOC Test\n---\n\n# MOC Test Spec\n\nIntro.\n\n"
  printf '%b' "$hdr" > "$src"
  for i in $(seq 1 4); do
    printf '\n### Requirement: REQ-MOC-%02d\n\n' "$i" >> "$src"
    for j in $(seq 1 40); do
      printf 'L%-5d Filler for requirement MOC-%02d beyond target. ' "$j" "$i" >> "$src"
    done
    printf '\n' >> "$src"
  done

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out" --moc "$moc_file"
  [ "$status" -eq 0 ]

  # MOC file must exist
  [ -f "$moc_file" ]

  # Count wikilinks in MOC
  local moc_links
  moc_links="$(grep -o '\[\[[^]]*\]\]' "$moc_file" | wc -l)"
  # Count TSV lines (chunks)
  local chunk_count
  chunk_count="$(printf '%s\n' "$output" | grep -c .)"

  # Positiv-Anker: both > 1
  [ "$moc_links" -gt 1 ]
  [ "$chunk_count" -gt 1 ]

  # Links must equal chunk count
  [ "$moc_links" -eq "$chunk_count" ] || {
    echo "MOC has $moc_links links but $chunk_count chunks" >&2
    false
  }
}

@test "every wikilink target resolves to an emitted chunk slug" {
  local src="$BATS_TEST_TMPDIR/multi-req.md"
  local out="$BATS_TEST_TMPDIR/out"
  local moc_file="$BATS_TEST_TMPDIR/parent-moc.md"
  local slug="test-resolve"

  local hdr="---\ntitle: Resolve Test\n---\n\n# Resolve Test\n\nIntro.\n\n"
  printf '%b' "$hdr" > "$src"
  for i in $(seq 1 3); do
    printf '\n### Requirement: REQ-RES-%02d\n\n' "$i" >> "$src"
    for j in $(seq 1 45); do
      printf 'L%-5d Filler for resolve test section %d. ' "$j" "$i" >> "$src"
    done
    printf '\n' >> "$src"
  done

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out" --moc "$moc_file"
  [ "$status" -eq 0 ]

  # Extract link slugs from MOC
  local moc_slugs="$BATS_TEST_TMPDIR/moc-slugs.txt"
  grep -o '\[\[[^]]*\]\]' "$moc_file" | sed 's/\[\[//;s/\]\]//' | sort > "$moc_slugs"

  # Extract chunk slugs from TSV (column 2)
  local tsv_slugs="$BATS_TEST_TMPDIR/tsv-slugs.txt"
  printf '%s\n' "$output" | cut -f2 | sort > "$tsv_slugs"

  # Both lists must be non-empty (Positiv-Anker)
  [ -s "$moc_slugs" ]
  [ -s "$tsv_slugs" ]

  # Difference must be empty in both directions
  local diff_out
  diff_out="$(comm -3 "$moc_slugs" "$tsv_slugs")"
  [ -z "$diff_out" ] || {
    echo "Mismatch between MOC slugs and TSV slugs:" >&2
    echo "$diff_out" >&2
    false
  }
}

@test "parent MOC carries a source:: back-reference to the original path" {
  local src="$BATS_TEST_TMPDIR/multi-req.md"
  local out="$BATS_TEST_TMPDIR/out"
  local moc_file="$BATS_TEST_TMPDIR/parent-moc.md"
  local slug="test-source-ref"

  local hdr="---\ntitle: SourceRef Test\n---\n\n# SourceRef Test\n\nIntro.\n\n"
  printf '%b' "$hdr" > "$src"
  for i in $(seq 1 3); do
    printf '\n### Requirement: REQ-SRC-%02d\n\n' "$i" >> "$src"
    for j in $(seq 1 45); do
      printf 'L%-5d Filler for source-ref section %d. ' "$j" "$i" >> "$src"
    done
    printf '\n' >> "$src"
  done

  run bash "$CHUNKER" --source "$src" --slug "$slug" --out-dir "$out" --moc "$moc_file"
  [ "$status" -eq 0 ]
  [ -f "$moc_file" ]

  # Exactly one source:: line
  local source_lines
  source_lines="$(grep -c '^source::' "$moc_file")"
  [ "$source_lines" -eq 1 ]

  # The source:: line must refer to the ORIGINAL path, not a chunk
  local source_ref
  source_ref="$(grep '^source::' "$moc_file")"
  # Should contain the original source path (which is in BATS_TEST_TMPDIR, not a chunk file)
  # Since the original path can be anything, check it does NOT look like a chunk
  if echo "$source_ref" | grep -q "$slug-0[0-9]"; then
    echo "source:: points to a chunk file, not the original: $source_ref" >&2
    false
  fi
}
