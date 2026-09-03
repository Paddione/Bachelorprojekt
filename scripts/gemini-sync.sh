#!/usr/bin/env bash
set -euo pipefail

# scripts/gemini-sync.sh — Mirror .claude/{agents,skills} into .gemini/ and register Antigravity skills
# Invoked by: task gemini:sync

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*)
    REPO="$(cygpath -m "$REPO")"
    ;;
esac

cd "$REPO"

for sub in agents skills; do
  src=".claude/$sub"
  dst=".gemini/$sub"
  if [[ ! -d "$src" ]]; then
    echo "✗ $src missing — nothing to mirror" >&2
    exit 1
  fi
  rm -rf "$dst"
  mkdir -p "$dst"
  # Copy with -L to dereference symlinks; -a to preserve attributes
  cp -aL "$src"/. "$dst"/
done

# Ensure skills.json exists for native Antigravity CLI discovery
cat << 'EOF' > skills.json
{
  "entries": [
    {
      "path": ".claude/skills"
    }
  ]
}
EOF

file_count=$(find .gemini/agents .gemini/skills -type f 2>/dev/null | wc -l)
echo "✓ .gemini/agents and .gemini/skills mirrored from .claude/ ($file_count files)"
echo "✓ skills.json registered for Antigravity CLI discovery"