#!/usr/bin/env bash
#
# dedup-movies.sh — Find and remove duplicate video files in the movies library.
#
# Groups videos by file size, then for each group picks the best-named copy
# to keep and marks the rest for deletion.
#
# Usage:
#   ./dedup-movies.sh                    # Dry run (default)
#   ./dedup-movies.sh --execute          # Actually delete duplicates
#   ./dedup-movies.sh --dir /other/path  # Custom movies directory

MOVIES_DIR="${MOVIES_DIR:-/app/media/movies}"
DRY_RUN=true

for arg in "$@"; do
  case "$arg" in
    --execute) DRY_RUN=false ;;
    --dir=*) MOVIES_DIR="${arg#--dir=}" ;;
  esac
done

if [ "$DRY_RUN" = true ]; then
  echo "=== DRY RUN (use --execute to delete) ==="
else
  echo "=== EXECUTE MODE — files will be permanently deleted ==="
fi
echo "Movies directory: $MOVIES_DIR"
echo ""

# Step 1: Find all video files, group by size, output dedup plan
# Uses a single awk pass to group, score, and produce the plan
find "$MOVIES_DIR" -maxdepth 3 \
  \( -name "*.mp4" -o -name "*.mkv" -o -name "*.avi" -o -name "*.mov" -o -name "*.wmv" -o -name "*.webm" -o -name "*.m4v" \) \
  -not -path "*/1_inbox/*" \
  -not -path "*/2_processing/*" \
  -not -path "*/3_complete/*" \
  -not -path "*/Thumbnails/*" \
  -printf "%s\t%p\n" 2>/dev/null \
| sort -n \
| awk -F'\t' -v movies_dir="$MOVIES_DIR" -v dry_run="$DRY_RUN" '
function score(filepath,   dir, dirname, filename, s, cmd, ret) {
  # Extract directory and filename
  n = split(filepath, parts, "/")
  filename = parts[n]
  dir = filepath
  sub(/\/[^\/]+$/, "", dir)
  dirname = parts[n-1]

  s = 0

  # Has thumbnails? (+50)
  cmd = "ls \"" dir "/Thumbnails/\"*_thumb.jpg >/dev/null 2>&1; echo $?"
  cmd | getline ret
  close(cmd)
  if (ret == 0) s += 50

  # Has metadata.json? (+30)
  cmd = "test -f \"" dir "/metadata.json\" && echo 1 || echo 0"
  cmd | getline ret
  close(cmd)
  if (ret == 1) s += 30

  # In subdirectory? (+20)
  if (dir != movies_dir) s += 20

  # Longer dirname = more descriptive (max +20)
  len = length(dirname)
  if (len > 20) len = 20
  s += len

  # Penalize xvideos- prefix (-40)
  if (dirname ~ /^xvideos-/) s -= 40

  # Penalize underscore-heavy filenames (-10)
  ucount = gsub(/_/, "_", filename)
  if (ucount > 3) s -= 10

  return s
}

function normalize_name(filepath,   n, parts, dirname, filename, name) {
  n = split(filepath, parts, "/")
  dirname = parts[n-1]
  filename = parts[n]
  # For flat files (parent is movies dir), use filename instead of dirname
  if (dirname == "movies" || dirname == parts[n]) {
    name = tolower(filename)
    sub(/\.[^.]+$/, "", name)  # strip extension
  } else {
    name = tolower(dirname)
  }
  # Strip xvideos- prefix, common suffixes
  sub(/^xvideos-/, "", name)
  sub(/ (sd|hd|4k|fhd)$/, "", name)
  sub(/_(sd|hd|4k|fhd)$/, "", name)
  sub(/-(sd|hd|4k|fhd)$/, "", name)
  # Replace separators with spaces
  gsub(/[-_.]/, " ", name)
  # Collapse whitespace
  gsub(/  +/, " ", name)
  # Trim leading/trailing space
  sub(/^ +/, "", name)
  sub(/ +$/, "", name)
  # Take first 20 chars for comparison
  return substr(name, 1, 20)
}

function names_similar(a, b,   i, matches, check_len) {
  # Compare first 10 chars — if 6+ match at same position, similar enough
  check_len = (length(a) < length(b)) ? length(a) : length(b)
  if (check_len < 8) check_len = 8
  if (check_len > 15) check_len = 15
  matches = 0
  for (i = 1; i <= check_len; i++) {
    if (substr(a, i, 1) == substr(b, i, 1)) matches++
  }
  return (matches >= check_len * 0.5)
}

function process_group(   i, j, best_score, best_idx, sc, norm, all_similar, skip_reason) {
  if (group_count < 2) return

  # Safety check: verify names are similar enough to be true duplicates
  for (i = 0; i < group_count; i++) {
    norm[i] = normalize_name(group_paths[i])
  }
  all_similar = 1
  for (i = 1; i < group_count; i++) {
    if (!names_similar(norm[0], norm[i])) {
      # Check if any pair is similar (handles A-B-C where A~B but not A~C)
      found_match = 0
      for (j = 0; j < i; j++) {
        if (names_similar(norm[j], norm[i])) { found_match = 1; break }
      }
      if (!found_match) { all_similar = 0; break }
    }
  }

  groups++
  if (!all_similar) {
    print "SKIP GROUP " groups " (size: " group_sizes[0] " bytes, copies: " group_count ") — names too different:"
    for (i = 0; i < group_count; i++) {
      print "  [" norm[i] "] " group_paths[i]
    }
    print ""
    skipped_groups++
    return
  }

  best_score = -999
  best_idx = 0

  for (i = 0; i < group_count; i++) {
    sc = score(group_paths[i])
    group_scores[i] = sc
    if (sc > best_score) {
      best_score = sc
      best_idx = i
    }
  }

  print "GROUP " groups " (size: " group_sizes[0] " bytes, copies: " group_count "):"
  for (i = 0; i < group_count; i++) {
    if (i == best_idx) {
      print "  KEEP  [score=" group_scores[i] "] " group_paths[i]
      keep_count++
    } else {
      print "  DEL   [score=" group_scores[i] "] " group_paths[i]
      del_count++
      del_bytes += group_sizes[i]
      del_list[del_n++] = group_paths[i]
    }
  }
  print ""
}

BEGIN {
  groups = 0; keep_count = 0; del_count = 0; del_bytes = 0; del_n = 0
  group_count = 0; prev_size = ""; skipped_groups = 0
  total = 0
}

{
  total++
  size = $1; path = $2

  if (size != prev_size && prev_size != "") {
    process_group()
    group_count = 0
  }

  group_sizes[group_count] = size
  group_paths[group_count] = path
  group_count++
  prev_size = size
}

END {
  process_group()

  gb = int(del_bytes / 1073741824)
  mb = int((del_bytes % 1073741824) / 1048576)

  print "=== SUMMARY ==="
  print "Total video files:   " total
  print "Duplicate groups:    " groups " (" skipped_groups " skipped — names too different)"
  print "Files to keep:       " keep_count
  print "Files to delete:     " del_count
  print "Space to reclaim:    " gb "." int(mb * 100 / 1024) " GB"
  print ""

  if (dry_run == "false") {
    deleted = 0; failed = 0
    for (i = 0; i < del_n; i++) {
      cmd = "rm -f \"" del_list[i] "\""
      if (system(cmd) == 0) {
        deleted++
        # Try to clean up empty parent dir
        dir = del_list[i]
        sub(/\/[^\/]+$/, "", dir)
        if (dir != movies_dir) {
          # Check if any video files remain
          chk = "find \"" dir "\" -maxdepth 1 \\( -name \"*.mp4\" -o -name \"*.mkv\" -o -name \"*.avi\" \\) 2>/dev/null | wc -l"
          chk | getline remaining
          close(chk)
          if (remaining + 0 == 0) {
            system("rm -rf \"" dir "\"")
            print "Removed dir: " dir
          }
        }
      } else {
        failed++
        print "FAILED: " del_list[i] > "/dev/stderr"
      }
    }
    print ""
    print "Deleted: " deleted " files"
    if (failed > 0) print "Failed: " failed " files"
  }
}
'
