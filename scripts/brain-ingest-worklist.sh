#!/usr/bin/env bash
# brain-ingest-worklist.sh — Generator für Brain-Doku Worklist (TAB-separated)
#
# Usage: brain-ingest-worklist.sh [--root <dir>] [--manifest <file>]
#
# Emits TAB-separated rows "<relative-path>\t<slug>\t<group>" for every
# candidate source file under --root, honoring the `exclude:` prefix list
# and the `groups:` map/list in the manifest (scripts/brain/ingest-sources.yaml
# by default). See tests/spec/brain-initial-ingest.bats (T001570).
set -euo pipefail

ROOT="."
MANIFEST="scripts/brain/ingest-sources.yaml"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)     ROOT="${2:?--root requires a value}"; shift ;;
    --manifest) MANIFEST="${2:?--manifest requires a value}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ ! -f "$MANIFEST" ]]; then
  echo "Fehler: Manifest fehlt ($MANIFEST)" >&2
  exit 1
fi

if [[ ! -d "$ROOT" ]]; then
  echo "Fehler: Root-Verzeichnis fehlt ($ROOT)" >&2
  exit 1
fi
ROOT="$(cd "$ROOT" && pwd)"

# --- exclude: list of prefix/substring patterns ---
exclude_patterns=()
while IFS= read -r line; do
  line="${line#"${line%%[![:space:]]*}"}"  # ltrim
  [[ "$line" =~ ^-\ (.+)$ ]] || continue
  p="${BASH_REMATCH[1]}"
  p="${p%\"}"; p="${p#\"}"
  exclude_patterns+=("$p")
done < <(awk '/^exclude:/{flag=1; next} /^[A-Za-z]/{flag=0} flag{print}' "$MANIFEST")

is_excluded() {
  local rel="$1"
  for pattern in "${exclude_patterns[@]}"; do
    [[ "$rel" == *"$pattern"* ]] && return 0
  done
  return 1
}

# shellcheck source=./brain-group-match.sh
source "$(dirname "${BASH_SOURCE[0]}")/brain-group-match.sh"

# Extracted once (not per file — see brain-group-match.sh perf note).
brain_group_section_for_manifest "$MANIFEST"
GROUPS_SECTION="$_BRAIN_GROUP_SECTION"

# Files that don't match any group's patterns are not brain-wiki sources —
# skip them rather than defaulting to a catch-all "docs" group (T001608:
# defaulting swept in the whole repo tree, ~1921 unrelated files).
group_for() {
  local rel="$1"
  brain_group_for "$rel" "$GROUPS_SECTION" || return 1
  echo "$_BRAIN_GROUP_OUT"
}

slugify() {
  local rel="$1"
  rel="${rel%.*}"
  rel="${rel#\.}"
  echo "$rel" | tr '/_ ' '---' | tr '[:upper:]' '[:lower:]'
}

find "$ROOT" \
  \( -name .git \
     -o -name node_modules \
     -o -name .astro \
     -o -name .taskmaster \
     -o -name .agy \
     -o -name .antigravitycli \
     -o -name .design-sync \
     -o -name dist \
     -o -name .venv \
     -o -name __pycache__ \
     -o -name .claude \
     -o -name generated \
     -o -name archive \
     -o -name legacy-html \
     -o -name drift-reports \
     -o -name .worktrees \
     -o -name website \
     -o -name mentolder-web \
     -o -name brett \
     -o -name tui \
     -o -name tests \
     -o -name scripts \
     -o -name k3d \
     -o -name packages \
     -o -name VideoVault \
     -o -name art-library \
     -o -name studio-server \
     -o -name mediaviewer-widget \
     -o -name design-system \) -prune \
  -o -type f \( \
  -name '*.md' -o -name '*.yaml' -o -name '*.yml' -o \
  -name '*.sh' -o -name '*.bats' -o -name '*.json' -o \
  -name '*.toml' \) -print 2>/dev/null | sort | while read -r file; do
  rel="${file#"$ROOT"/}"
  is_excluded "$rel" && continue
  grp="$(group_for "$rel")" || true
  [[ -z "$grp" ]] && continue
  slug="$(slugify "$rel")"
  printf '%s\t%s\t%s\n' "$rel" "$slug" "$grp"
done
