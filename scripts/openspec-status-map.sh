#!/usr/bin/env bash
# scripts/openspec-status-map.sh
# Scan openspec/changes/ and emit website/src/data/openspec-status.json.
# OPENSPEC_ROOT overrides the default openspec/ directory (used in tests).
set -euo pipefail

# T001997: anchor REPO on the CALLER's cwd (git toplevel), not on the
# physical path this script file was invoked with -- see scripts/openspec.sh
# for the full rationale (same fix, same footgun).
REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ERROR: openspec-status-map.sh must be run from inside a git worktree (cwd is not a git repository)" >&2; exit 1; }
HERE="$REPO/scripts"
OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO/openspec}"
OUT="$REPO/website/src/data/openspec-status.json"
CHANGES="$OPENSPEC_ROOT/changes"

# Accumulate jq-compatible JSON fragments
declare -a frags=()

collect_entry() {
  local dir="$1" status="$2"
  local base; base="$(basename "$dir")"
  local ticket_file="$dir/.ticket"
  [[ -f "$ticket_file" ]] || return 0
  local ticket_id; ticket_id="$(tr -d '[:space:]' < "$ticket_file")"
  [[ -n "$ticket_id" ]] || return 0
  frags+=("$(jq -nc \
    --arg tid "$ticket_id" --arg slug "$base" --arg st "$status" \
    '{ ticket: $tid, slug: $slug, status: $st }')")
}

if [[ -d "$CHANGES" ]]; then
  shopt -s nullglob
  # Active changes
  for dir in "$CHANGES"/*/; do
    local_base="$(basename "$dir")"
    [[ "$local_base" == "archive" ]] && continue
    if [[ -f "$dir/tasks.md" ]]; then
      collect_entry "$dir" "plan_staged"
    else
      collect_entry "$dir" "planning"
    fi
  done
  # Archived changes
  for dir in "$CHANGES/archive"/*/; do
    collect_entry "$dir" "archived"
  done
  shopt -u nullglob
fi

# Build final JSON: group entries by ticket_id -> array of {slug, status}
TMP="$(mktemp)"
if [[ ${#frags[@]} -eq 0 ]]; then
  echo '{}' > "$TMP"
else
  printf '%s\n' "${frags[@]}" | jq -s '
    group_by(.ticket)
    | map({ key: .[0].ticket, value: map({ slug, status }) })
    | from_entries
  ' > "$TMP"
fi
mv "$TMP" "$OUT"
echo "openspec-status-map: wrote $OUT"
