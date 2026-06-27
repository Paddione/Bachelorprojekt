#!/usr/bin/env bash
# scripts/openspec-header-inject.sh
# One-shot helper: bulk-add ## Purpose + ## Requirements H2 headers to all
# SSOT specs under openspec/specs/. Used by the OpenSpec improvements batch
# (T001261). After mass application, the openspec-validate.ts script enforces
# the structure so future specs cannot regress.
#
# Usage:
#   bash scripts/openspec-header-inject.sh --dry-run openspec/specs/   # review diffs
#   bash scripts/openspec-header-inject.sh openspec/specs/             # apply
#
# Behaviour:
#   - Inserts `## Purpose` after the H1 title (and any `<!-- ... -->` block
#     immediately following it) on the line where the first paragraph
#     starts. If `## Purpose` is already present, the file is left alone on
#     that section.
#   - Inserts `## Requirements` immediately before the first `### Requirement:`
#     heading. Skipped if `## Requirements` is already present.
#   - Skips files that already declare both H2 sections (no-op).
set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

SPECS_DIR="${1:-openspec/specs}"

if [[ ! -d "$SPECS_DIR" ]]; then
  echo "ERROR: $SPECS_DIR is not a directory" >&2
  exit 2
fi

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

changed=0
skipped=0
total=0

for f in "$SPECS_DIR"/*.md; do
  [[ -f "$f" ]] || continue
  total=$((total + 1))

  has_purpose=$(grep -c '^## Purpose' "$f" || true)
  has_requirements=$(grep -c '^## Requirements' "$f" || true)

  if [[ "$has_purpose" -ge 1 && "$has_requirements" -ge 1 ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  changed=$((changed + 1))

  awk -v has_purpose="$has_purpose" -v has_requirements="$has_requirements" '
    BEGIN { purpose_done = (has_purpose >= 1) ? 1 : 0; requirements_done = (has_requirements >= 1) ? 1 : 0; }
    {
      line = $0

      # Detect H1 title
      if (!purpose_done && /^# /) {
        print line
        in_h1 = 1
        next
      }

      # If we just saw H1, allow an HTML comment block before ## Purpose
      if (!purpose_done && in_h1 && /^<!--/) {
        print line
        in_h1 = 2
        next
      }

      # Inject ## Purpose before the first non-empty, non-H1, non-comment line after H1
      if (!purpose_done && (in_h1 == 1 || in_h1 == 2) && line !~ /^<!--/ && line !~ /^[[:space:]]*$/) {
        print "## Purpose"
        print ""
        print line
        purpose_done = 1
        in_h1 = 0
        next
      }

      # If we have not yet inserted ## Purpose but we hit a `##` (sub-H1) or `###`, place ## Purpose before that
      if (!purpose_done && in_h1 && /^##? /) {
        print "## Purpose"
        print ""
        print line
        purpose_done = 1
        in_h1 = 0
        next
      }

      # If we have not yet inserted ## Purpose and the file has no H1 prose
      # (only comments/H2s), put ## Purpose at the end-of-file preamble
      if (!purpose_done && in_h1 && /^---$/) {
        print "## Purpose"
        print ""
        print line
        purpose_done = 1
        in_h1 = 0
        next
      }

      # Inject ## Requirements before the first ### Requirement: heading
      if (!requirements_done && /^### Requirement: /) {
        print "## Requirements"
        print ""
        print line
        requirements_done = 1
        next
      }

      # If the file ends without ### Requirement:, still ensure ## Requirements
      # is present (placed before EOF). We do that via the END block.

      print line
    }
    END {
      if (!purpose_done) {
        print "## Purpose"
        print ""
      }
      if (!requirements_done) {
        print "## Requirements"
        print ""
      }
    }
  ' "$f" > "$tmpfile"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    if ! diff -q "$f" "$tmpfile" >/dev/null 2>&1; then
      echo "WOULD MODIFY: $f"
    fi
  else
    if ! diff -q "$f" "$tmpfile" >/dev/null 2>&1; then
      mv "$tmpfile" "$f"
      echo "MODIFIED: $f"
    fi
    # re-create tmpfile for the next iteration (mktemp did not run again)
    tmpfile=$(mktemp)
  fi
done

echo
echo "=== summary ==="
echo "total:        $total"
echo "modified:     $changed"
echo "skipped (OK): $skipped"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "(dry-run — no files changed)"
fi
