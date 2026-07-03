#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
# Brain Initial Ingest Worklist Generator
# Reads ingest-sources.yaml, outputs TAB-separated: [priority] [group] [path]
# Usage: ./scripts/brain-ingest-worklist.sh > brain-worklist.txt
# ────────────────────────────────────────────────────────────────────

set -euo pipefail
SOURCE_YAML="scripts/brain/ingest-sources.yaml"
EXCLUDES=()
GROUPS=()

if [[ ! -f "$SOURCE_YAML" ]]; then
  echo "Fehler: $SOURCE_YAML nicht gefunden" >&2
  exit 1
fi

# Parse excludes section
while IFS=':' read -r _ key value; do
  if [[ "$key" == "exclude:" ]]; then
    while IFS= read -r line && (( line > 3 )); do
      path="${line#- }"
      EXCLUDES+=("$path")
    done
  fi
done < <(sed 's/^[[:space:]]*//' "$SOURCE_YAML" | grep -E '^(exclude|include):' || true)

# Parse groups section (priority + include paths)
declare -A GROUP_PRIORITIES=()
for group in "${GROUPS[@]}"; do
  GROUP_PRIORITIES["$group"]="${GROUP_PRIORITIES[$group]:-9}"
done

echo "# Brain Initial Ingest Worklist (TAB-separated: priority\tgroup\tpath)" >&2

# Process each markdown file and assign to appropriate group/priority
find . -name "*.md" -not -path "./node_modules/*" | while read -r filepath; do
  relpath="${filepath#./}"
  
  # Skip excluded paths
  skip=false
  for excl in "${EXCLUDES[@]}"; do
    if [[ "$relpath" == *"$excl"* || "$relpath" == "$excl" ]]; then
      skip=true; break
    fi
  done
  $skip && continue
  
  # Determine group and priority based on path patterns
  if [[ "$relpath" =~ openspec/specs/.*\.md$ ]]; then
    echo "1	brain-ssot-specs	$relpath"
  elif [[ "$relpath" =~ docs/runbooks/.*\.md ]]; then
    echo "2	brain-runbooks	$relpath"
  elif [[ "$relpath" =~ docs/adr/.*\.md ]]; then
    echo "3	brain-adrs	$relpath"
  elif [[ "$relpath" == "CLAUDE.md" || "$relpath" == "AGENTS.md" ]]; then
    echo "4	brain-core-docs	$relpath"
  elif [[ "$relpath" =~ docs/superpowers/references/gotchas-footguns\.md ]]; then
    echo "5	brain-gotchas	$relpath"
  elif [[ "$relpath" =~ docs/agent-guide/maps/.*\.md ]]; then
    echo "6	brain-agent-guide	$relpath"
  elif [[ "$relpath" =~ docs/superpowers/references/lib-guides\.md ]]; then
    echo "7	brain-lib-guides	$relpath"
  elif [[ "$relpath" =~ docs/project/health-checks\.md ]]; then
    echo "8	brain-topology	$relpath"
  else
    # Default group for unmapped files
    echo "9	unsorted	$relpath"
  fi
done | sort -t$'\t' -k1,1n -k3 | uniq
