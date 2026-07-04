#!/usr/bin/env bash
# brain-auto-memory-export.sh — interactive, one-way export of reviewed
# auto-memory candidates into the brain repo. Runs locally (never in CI).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="${AUTO_MEMORY_STATE:-$HOME/.claude/brain-auto-memory-state.json}"
CANDIDATES="${AUTO_MEMORY_CANDIDATES:-$HOME/.claude/brain-auto-memory-candidates.json}"
ROOT="${AUTO_MEMORY_ROOT:-$HOME/.claude/projects}"

# --- abort guards BEFORE any state mutation ---
[ -n "${BRAIN_REPO_PATH:-}" ] || { echo "error: BRAIN_REPO_PATH not set" >&2; exit 1; }
git -C "$BRAIN_REPO_PATH" rev-parse --git-dir >/dev/null 2>&1 \
  || { echo "error: BRAIN_REPO_PATH is not a git checkout: $BRAIN_REPO_PATH" >&2; exit 1; }

# ensure candidates exist (convenience: run scan.sh if missing/empty)
if [ ! -s "$CANDIDATES" ] || [ "$(jq 'length' "$CANDIDATES" 2>/dev/null || echo 0)" = "0" ]; then
  AUTO_MEMORY_ROOT="$ROOT" AUTO_MEMORY_STATE="$STATE" AUTO_MEMORY_CANDIDATES="$CANDIDATES" \
    bash "$HERE/brain-auto-memory-scan.sh"
fi

_map_type() { # <metadata_type> -> brain type
  case "$1" in
    project|reference|user) echo note ;;
    feedback)               echo decision ;;
    *)                      echo note ;;
  esac
}
_default_answer() { # user memories default to 'n'
  [ "$1" = "user" ] && echo n || echo y
}
_slug() { echo "$1" | sed 's/\.md$//' | tr '[:upper:]' '[:lower:]' | tr ' _' '--' | sed 's/[^a-z0-9-]//g'; }

# answer source: AUTO_MEMORY_ASSUME file (test hook) or interactive read
_answers_fd() { [ -n "${AUTO_MEMORY_ASSUME:-}" ] && cat "$AUTO_MEMORY_ASSUME"; }
mapfile -t ASSUME < <(_answers_fd)
ai=0
_ask() { # <default> -> echoes y|n|e:<type>
  # NOTE: called via command substitution ($(_ask ...)), which runs in a
  # subshell — any mutation of `ai` here would NOT persist to the caller.
  # The caller is responsible for advancing `ai` after each call.
  if [ -n "${AUTO_MEMORY_ASSUME:-}" ]; then
    printf '%s' "${ASSUME[$ai]:-n}"
    return
  fi
  local ans; read -r -p "Export? [y/n/e] " ans </dev/tty || ans=n
  printf '%s' "${ans:-$1}"
}

count="$(jq 'length' "$CANDIDATES")"
[ "$count" -gt 0 ] || { echo "no candidates"; exit 0; }

pushed_any=0
declare -A APPROVED   # key -> hash
for i in $(seq 0 $((count-1))); do
  project="$(jq -r ".[$i].project" "$CANDIDATES")"
  file="$(jq -r ".[$i].file" "$CANDIDATES")"
  name="$(jq -r ".[$i].name" "$CANDIDATES")"
  desc="$(jq -r ".[$i].description" "$CANDIDATES")"
  mtype="$(jq -r ".[$i].metadata_type" "$CANDIDATES")"
  hash="$(jq -r ".[$i].hash" "$CANDIDATES")"
  echo "--- $project/$file  ($mtype)  $name" >&2
  echo "    $desc" >&2
  btype="$(_map_type "$mtype")"
  ans="$(_ask "$(_default_answer "$mtype")")"
  [ -n "${AUTO_MEMORY_ASSUME:-}" ] && ai=$((ai+1))
  case "$ans" in
    e|e:*) [ "$ans" != e ] && btype="${ans#e:}"; ans=y ;;
  esac
  [ "$ans" = y ] || { echo "    skipped" >&2; continue; }

  src="$ROOT/$project/memory/$file"
  slug="$(_slug "$name")"
  dest_dir="$BRAIN_REPO_PATH/raw/auto-memory/$project"
  mkdir -p "$dest_dir"
  # body = everything after the source's second '---'
  body="$(awk 'f>=2{print} /^---$/{f++}' "$src")"
  {
    echo '---'
    echo "type: $btype"
    echo "tags: [auto-memory, $project]"
    echo "status: draft"
    echo '---'
    echo
    printf '%s\n' "$body"
  } > "$dest_dir/$slug.md"
  APPROVED["$project/$file"]="$hash"
  pushed_any=1
done

if [ "$pushed_any" -eq 1 ]; then
  git -C "$BRAIN_REPO_PATH" add raw/auto-memory
  # A prior run may have committed but failed to push (state stays unchanged
  # on failure, so a retry regenerates identical content and there is
  # nothing new to `git add`). Only commit when something is staged; always
  # attempt the push so a stranded local commit from a failed prior run is
  # retried instead of permanently blocking on "nothing to commit".
  if ! git -C "$BRAIN_REPO_PATH" diff --cached --quiet; then
    git -C "$BRAIN_REPO_PATH" commit -q -m "chore(auto-memory): export reviewed Claude memories"
  fi
  if ! git -C "$BRAIN_REPO_PATH" push -q origin HEAD 2>/dev/null; then
    echo "error: git push failed — state left unchanged, rerun to retry" >&2
    exit 1
  fi
fi

# state update ONLY for approved pages, after a successful push
[ -f "$STATE" ] || echo '{}' > "$STATE"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
for key in "${!APPROVED[@]}"; do
  tmp="$(mktemp)"
  jq --arg k "$key" --arg h "${APPROVED[$key]}" --arg ts "$ts" \
    '.[$k] = {hash:$h, last_export:$ts}' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
done
exit 0
