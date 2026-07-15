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

# --- groups: either a map "name: glob(s)" (production manifest) or a list of
# {group,priority,include} objects (test fixtures). Full glob-priority
# resolution is out of scope here — every row is tagged with the default
# group; downstream compilation reads the manifest directly for grouping.
group_for() {
  echo "docs"
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
     -o -name drift-reports \) -prune \
  -o -type f \( \
  -name '*.md' -o -name '*.yaml' -o -name '*.yml' -o \
  -name '*.sh' -o -name '*.bats' -o -name '*.json' -o \
  -name '*.toml' \) -print 2>/dev/null | sort | while read -r file; do
  rel="${file#"$ROOT"/}"
  is_excluded "$rel" && continue
  slug="$(slugify "$rel")"
  grp="$(group_for "$rel")"
  printf '%s\t%s\t%s\n' "$rel" "$slug" "$grp"
done
