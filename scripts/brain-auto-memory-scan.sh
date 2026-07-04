#!/usr/bin/env bash
# brain-auto-memory-scan.sh — read-only scanner for Claude auto-memory pages.
# Emits candidates (new or hash-changed since last export) as JSON. Exit 0 always.
# Cron example (manual, not installed by this change):
#   0 3 * * * /home/patrick/Bachelorprojekt/scripts/brain-auto-memory-scan.sh
set -euo pipefail

ROOT="${AUTO_MEMORY_ROOT:-$HOME/.claude/projects}"
STATE="${AUTO_MEMORY_STATE:-$HOME/.claude/brain-auto-memory-state.json}"
CANDIDATES="${AUTO_MEMORY_CANDIDATES:-$HOME/.claude/brain-auto-memory-candidates.json}"

# secret heuristics: PEM header, api key token, or a long hex/base64 blob
_has_secret() {
  grep -Eqi -e '-----BEGIN' -e 'api[_-]?key' -e '[A-Za-z0-9+/=]{32,}' "$1"
}

# naive frontmatter parse -> echoes "NAME\tDESC\tTYPE" or returns 1 if unparsable
_frontmatter() {
  local f="$1" line in_fm=0 seen=0 name="" desc="" mtype="" in_meta=0
  [ "$(head -n1 "$f")" = "---" ] || return 1
  while IFS= read -r line; do
    if [ "$line" = "---" ]; then
      if [ "$in_fm" -eq 0 ]; then in_fm=1; continue; else seen=1; break; fi
    fi
    [ "$in_fm" -eq 1 ] || continue
    case "$line" in
      name:*)        name="${line#name:}";        name="${name# }" ;;
      description:*) desc="${line#description:}";  desc="${desc# }" ;;
      metadata:*)    in_meta=1 ;;
      "  type:"*|$'\t'type:*) mtype="${line#*type:}"; mtype="${mtype# }" ;;
      type:*)        [ "$in_meta" -eq 1 ] && { mtype="${line#type:}"; mtype="${mtype# }"; } ;;
    esac
  done < "$f"
  [ "$seen" -eq 1 ] || return 1
  [ -n "$name" ] && [ -n "$mtype" ] || return 1
  printf '%s\t%s\t%s' "$name" "$desc" "$mtype"
}

_state_hash() { # <key> -> prints stored hash or empty
  [ -f "$STATE" ] || { echo ""; return; }
  jq -r --arg k "$1" '.[$k].hash // ""' "$STATE" 2>/dev/null || echo ""
}

candidates="[]"
if [ -d "$ROOT" ]; then
  while IFS= read -r f; do
    base="$(basename "$f")"
    [ "$base" = "MEMORY.md" ] && continue
    rel="${f#"$ROOT"/}"; project="${rel%%/*}"
    if _has_secret "$f"; then
      echo "warn: skipping $rel (secret pattern)" >&2; continue
    fi
    if ! fm="$(_frontmatter "$f")"; then
      echo "warn: skipping $rel (no parsable frontmatter)" >&2; continue
    fi
    IFS=$'\t' read -r name desc mtype <<<"$fm"
    hash="$(sha256sum "$f" | cut -d' ' -f1)"
    key="$project/$base"
    [ "$hash" = "$(_state_hash "$key")" ] && continue
    candidates="$(jq \
      --arg project "$project" --arg file "$base" --arg name "$name" \
      --arg description "$desc" --arg metadata_type "$mtype" --arg hash "$hash" \
      '. + [{project:$project,file:$file,name:$name,description:$description,metadata_type:$metadata_type,hash:$hash}]' \
      <<<"$candidates")"
  done < <(find "$ROOT" -type f -path '*/memory/*.md' 2>/dev/null | sort)
fi

mkdir -p "$(dirname "$CANDIDATES")"
printf '%s\n' "$candidates" > "$CANDIDATES"
exit 0
