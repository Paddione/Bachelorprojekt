#!/usr/bin/env bash
# brain-chunk.sh — Section-aware chunking of source files for Brain Wiki ingest
#
# Splits a source Markdown file at the deepest stable heading level and packs
# sections greedily into chunks up to a target character limit. Emits a
# TAB-separated manifest on stdout and writes chunk files to --out-dir.
# Optionally writes a deterministic parent MOC page (no LLM, no network).
# A fenced code block or markdown table larger than the target becomes
# sequential (Teil i/N) part-chunks; any other oversized paragraph emits whole.
#
# Usage:
#   brain-chunk.sh --source <file> --slug <slug> --out-dir <dir> [--moc <file>] [--target-chars <n>]
#
# stdout (TSV, one line per chunk): <chunk-file>\t<chunk-slug>\t<index>\t<heading>
#   The parent MOC is NOT part of this manifest — callers already know its path
#   because they passed --moc. Emitting it would make the manifest disagree with
#   the wikilink set inside the MOC itself.
#
# stdout carries the manifest and nothing else. Diagnostics print only when
# BRAIN_CHUNK_VERBOSE is set: callers parse stdout line by line, and BATS `run`
# merges stderr into $output, so a stray diagnostic reads as a chunk record.
#
# Env:
#   BRAIN_CHUNK_TARGET_CHARS — target chunk size in characters (default: 8000)
#   BRAIN_CHUNK_VERBOSE      — if non-empty, print split diagnostics to stderr
#
# Ticket: T002679
# Decisions: D1 (fallback chain, greedy), D2 (TSV interface), D4 (MOC without LLM)
set -euo pipefail

SOURCE=""
SLUG=""
OUT_DIR=""
MOC=""
TARGET_CHARS="${BRAIN_CHUNK_TARGET_CHARS:-8000}"

usage() {
  cat >&2 <<'EOF'
Usage: brain-chunk.sh --source <file> --slug <slug> --out-dir <dir> [--moc <file>] [--target-chars <n>]

  --source        source Markdown file to split (required)
  --slug          source slug from the ingest worklist, used verbatim (required)
  --out-dir       directory the chunk files are written to (required, created)
  --moc           write a deterministic parent MOC page to this path (optional)
  --target-chars  target chunk size in characters (default: BRAIN_CHUNK_TARGET_CHARS or 8000)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source)       SOURCE="${2:?--source requires a value}"; shift 2 ;;
    --slug)         SLUG="${2:?--slug requires a value}"; shift 2 ;;
    --out-dir)      OUT_DIR="${2:?--out-dir requires a value}"; shift 2 ;;
    --moc)          MOC="${2:?--moc requires a value}"; shift 2 ;;
    --target-chars) TARGET_CHARS="${2:?--target-chars requires a value}"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    *) echo "brain-chunk.sh: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

[ -n "$SOURCE" ]  || { echo "brain-chunk.sh: --source is required" >&2; usage; exit 1; }
[ -n "$SLUG" ]    || { echo "brain-chunk.sh: --slug is required" >&2; usage; exit 1; }
[ -n "$OUT_DIR" ] || { echo "brain-chunk.sh: --out-dir is required" >&2; usage; exit 1; }
[ -f "$SOURCE" ]  || { echo "brain-chunk.sh: source file not found: $SOURCE" >&2; exit 1; }

case "$TARGET_CHARS" in
  ''|*[!0-9]*) echo "brain-chunk.sh: --target-chars must be a positive integer, got: $TARGET_CHARS" >&2; exit 1 ;;
esac
[ "$TARGET_CHARS" -gt 0 ] || { echo "brain-chunk.sh: --target-chars must be > 0" >&2; exit 1; }

mkdir -p "$OUT_DIR"
[ -z "$MOC" ] || mkdir -p "$(dirname "$MOC")"

# ── D1: split-pattern fallback chain ──────────────────────────────────────
# `grep -c` exits 1 on zero matches; under `set -e` the idiomatic `|| echo 0`
# appends a SECOND value to the already-printed "0", and the numeric comparison
# then fails on "0\n0". Count with awk, which always exits 0.
count_matches() { awk -v pat="$1" '$0 ~ pat { n++ } END { print n + 0 }' "$2"; }

detect_split_pattern() {
  local src="$1" n
  n="$(count_matches '^### Requirement:' "$src")"
  if [ "$n" -ge 2 ]; then
    [ -z "${BRAIN_CHUNK_VERBOSE:-}" ] || echo "brain-chunk.sh: split at '^### Requirement:' ($n matches)" >&2
    printf '%s\n' '^### Requirement:'
    return
  fi
  n="$(count_matches '^## ' "$src")"
  if [ "$n" -ge 2 ]; then
    [ -z "${BRAIN_CHUNK_VERBOSE:-}" ] || echo "brain-chunk.sh: split at '^## ' ($n matches)" >&2
    printf '%s\n' '^## '
    return
  fi
  [ -z "${BRAIN_CHUNK_VERBOSE:-}" ] || echo "brain-chunk.sh: no heading level found, hard paragraph split" >&2
  printf '%s\n' '__PARAGRAPH__'
}

SPLIT_PATTERN="$(detect_split_pattern "$SOURCE")"

# ── Split, pack and emit ──────────────────────────────────────────────────
# One awk pass keeps chunk contents byte-exact: routing multi-line section text
# through a shell `read` loop collapses newlines, and the concatenation of all
# chunks would no longer reproduce the source.
awk -v pat="$SPLIT_PATTERN" \
    -v target="$TARGET_CHARS" \
    -v slug="$SLUG" \
    -v outdir="$OUT_DIR" \
    -v mocfile="$MOC" \
    -v srcpath="$SOURCE" '
function clean_heading(h,   c) {
  c = h
  sub(/^#+[ \t]*/, "", c)
  gsub(/\t/, " ", c)
  sub(/[ \t]+$/, "", c)
  if (c == "") c = slug
  return c
}

# Write one chunk file and print its manifest line.
function write_chunk(text, heading,   cslug, path) {
  idx++
  # Three digits, not two: the largest source yields ~33 chunks at the default
  # target, and a smaller --target-chars crosses 100 — at two digits the
  # lexical order of the slugs would then diverge from the numeric one.
  cslug = sprintf("%s-%03d", slug, idx)
  path = outdir "/" cslug ".md"
  printf "%s", text > path
  close(path)
  moc_slug[idx] = cslug
  moc_head[idx] = clean_heading(heading)
  printf "%s\t%s\t%d\t%s\n", path, cslug, idx, moc_head[idx]
}

# A unit is a splittable fence when it is exactly one complete fenced code
# block: opening ``` line first, closing ``` line last. Fences containing
# blank lines arrive here as fragments (hard_split breaks units at blank
# lines) and keep the legacy whole-emit behavior.
function is_fence(unit,   n, ln) {
  n = split(unit, ln, "\n")
  while (n > 0 && ln[n] == "") n--
  if (n < 3) return 0
  if (ln[1] !~ /^```/) return 0
  if (ln[n] !~ /^```[ \t]*$/) return 0
  return 1
}

# Split one oversized fenced block into sequential line-greedy parts, each at
# most target chars (a single longer line still emits whole: completeness
# beats the size goal). Parts are raw slices labeled (Teil i/N) — their
# concatenation reproduces the fence byte-exact, so the wiki holds the full
# block across ordered pages instead of dropping it at the transform guard.
function split_fence(unit, heading,   n, ln, tail, i, curlen, nb, b, start, p, j, part, base) {
  n = split(unit, ln, "\n")
  tail = ""
  while (n > 0 && ln[n] == "") { tail = tail "\n"; n-- }
  nb = 0; curlen = 0
  for (i = 1; i <= n; i++) {
    if (curlen > 0 && curlen + length(ln[i]) + 1 > target) { nb++; b[nb] = i; curlen = 0 }
    curlen += length(ln[i]) + 1
  }
  nb++; b[nb] = n + 1
  base = heading
  if (base == "") base = slug
  start = 1
  for (p = 1; p <= nb; p++) {
    part = ""
    for (j = start; j < b[p]; j++) part = part ln[j] "\n"
    if (p == nb) part = part tail
    write_chunk(part, base " (Teil " p "/" nb ")")
    start = b[p]
  }
}

# A unit is a splittable table when it opens with a header row and a
# separator row (pipes, dashes, colons, spaces). Data rows are not validated:
# anything under a valid header pair rides along as opaque lines.
function is_table(unit,   n, ln) {
  n = split(unit, ln, "\n")
  while (n > 0 && ln[n] == "") n--
  if (n < 3) return 0
  if (ln[1] !~ /^\|/) return 0
  if (ln[2] !~ /^\|[ \t:|-]+\|[ \t]*$/) return 0
  return 1
}

# Split one oversized markdown table at row boundaries: every part repeats
# the header pair, so each renders as a complete table. Unlike fence parts
# the concatenation is not byte-exact (headers repeat) — but every data row
# appears exactly once, in order.
function split_table(unit, heading,   n, ln, tail, hlen, i, curlen, rows, nb, b, start, p, j, part, base) {
  n = split(unit, ln, "\n")
  tail = ""
  while (n > 0 && ln[n] == "") { tail = tail "\n"; n-- }
  hlen = length(ln[1]) + 1 + length(ln[2]) + 1
  if (hlen > target) { write_chunk(unit, heading); return }
  nb = 0; curlen = hlen; rows = 0
  for (i = 3; i <= n; i++) {
    if (rows > 0 && curlen + length(ln[i]) + 1 > target) { nb++; b[nb] = i; curlen = hlen; rows = 0 }
    curlen += length(ln[i]) + 1; rows++
  }
  nb++; b[nb] = n + 1
  base = heading
  if (base == "") base = slug
  start = 3
  for (p = 1; p <= nb; p++) {
    part = ln[1] "\n" ln[2] "\n"
    for (j = start; j < b[p]; j++) part = part ln[j] "\n"
    if (p == nb) part = part tail
    write_chunk(part, base " (Teil " p "/" nb ")")
    start = b[p]
  }
}

# Split one oversized section at paragraph boundaries, greedy up to target.
# A single paragraph larger than target is emitted whole — except a complete
# fenced code block or markdown table, which split into sequential parts
# (generated sources cannot be fixed by hand). Completeness beats the size
# goal either way: dropping text would silently shrink the wiki.
function hard_split(text, heading,   n, ln, i, unit, cur) {
  n = split(text, ln, "\n")
  cur = ""; unit = ""
  for (i = 1; i <= n; i++) {
    if (i == n && ln[i] == "") break   # artefact of the trailing newline
    unit = unit ln[i] "\n"
    if (ln[i] == "") {
      if (length(unit) > target && (is_fence(unit) || is_table(unit))) {
        if (cur != "") { write_chunk(cur, heading); cur = "" }
        if (is_fence(unit)) split_fence(unit, heading); else split_table(unit, heading)
      } else {
        if (cur != "" && length(cur) + length(unit) > target) { write_chunk(cur, heading); cur = "" }
        cur = cur unit
      }
      unit = ""
    }
  }
  if (unit != "") {
    if (length(unit) > target && (is_fence(unit) || is_table(unit))) {
      if (cur != "") { write_chunk(cur, heading); cur = "" }
      if (is_fence(unit)) split_fence(unit, heading); else split_table(unit, heading)
    } else {
      if (cur != "" && length(cur) + length(unit) > target) { write_chunk(cur, heading); cur = "" }
      cur = cur unit
    }
  }
  if (cur != "") write_chunk(cur, heading)
}

BEGIN { sec = 0; idx = 0; head[0] = "" }

{
  if (pat != "__PARAGRAPH__" && NR > 1 && $0 ~ pat) {
    sec++
    head[sec] = $0
  }
  text[sec] = text[sec] $0 "\n"
}

END {
  cur = ""; curhead = ""
  for (s = 0; s <= sec; s++) {
    t = text[s]
    if (t == "") continue
    if (length(t) > target) {
      if (cur != "") { write_chunk(cur, curhead); cur = ""; curhead = "" }
      hard_split(t, head[s])
      continue
    }
    if (cur == "") { cur = t; curhead = head[s] }
    else if (length(cur) + length(t) <= target) { cur = cur t }
    else { write_chunk(cur, curhead); cur = t; curhead = head[s] }
  }
  if (cur != "") write_chunk(cur, curhead)

  # D4: the MOC is built from the manifest just computed — no LLM, no network.
  # The wikilink lint in brain-ingest.sh is fail-closed and its sed repair path
  # would silently strip hallucinated links, so the page must be exact by
  # construction.
  if (mocfile != "" && idx > 0) {
    printf "---\n" > mocfile
    printf "type: moc\n" > mocfile
    printf "tags: [%s, moc]\n", slug > mocfile
    printf "status: active\n" > mocfile
    printf "source:: %s\n", srcpath > mocfile
    printf "---\n" > mocfile
    printf "# %s — Map of Content\n\n", slug > mocfile
    printf "%d Chunk(s) aus der Quelle `%s`.\n\n", idx, srcpath > mocfile
    printf "## Abschnitte\n\n" > mocfile
    for (i = 1; i <= idx; i++)
      printf "- [[%s]] — %s\n", moc_slug[i], moc_head[i] > mocfile
    close(mocfile)
  }
}
' "$SOURCE"
