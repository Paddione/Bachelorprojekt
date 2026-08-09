#!/usr/bin/env bash
# brain-chunk.sh — Section-aware chunking of source files for Brain Wiki ingest
#
# Splits a source Markdown file at the deepest stable heading level and packs
# sections greedily into chunks up to a target character limit. Emits a
# TAB-separated manifest on stdout and writes chunk files to --out-dir.
# Optionally writes a deterministic parent MOC page (no LLM, no network).
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

# Split one oversized section at paragraph boundaries, greedy up to target.
# A single paragraph larger than target is emitted whole: completeness beats
# the size goal, and dropping text would silently shrink the wiki.
function hard_split(text, heading,   n, ln, i, unit, cur) {
  n = split(text, ln, "\n")
  cur = ""; unit = ""
  for (i = 1; i <= n; i++) {
    if (i == n && ln[i] == "") break   # artefact of the trailing newline
    unit = unit ln[i] "\n"
    if (ln[i] == "") {
      if (cur != "" && length(cur) + length(unit) > target) { write_chunk(cur, heading); cur = "" }
      cur = cur unit; unit = ""
    }
  }
  if (unit != "") {
    if (cur != "" && length(cur) + length(unit) > target) { write_chunk(cur, heading); cur = "" }
    cur = cur unit
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
