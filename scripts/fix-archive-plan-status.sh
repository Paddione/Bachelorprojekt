#!/usr/bin/env bash
# scripts/fix-archive-plan-status.sh
# One-shot: flip every archived plan from `status: active` to `status: completed`
# so plan-context.sh stops injecting historical plans into agent prompts (Fix 4).
# Idempotent: re-running after the first pass changes nothing. Safe to run from
# the repo root; commit the result. Referenced by the Fix-7 spec-frontmatter doc.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
ARCHIVE_DIR="$REPO_ROOT/docs/superpowers/plans/archive"

[[ -d "$ARCHIVE_DIR" ]] || { echo "No archive dir at $ARCHIVE_DIR — nothing to do."; exit 0; }

count=0
while IFS= read -r f; do
  sed -i 's/^status: active$/status: completed/' "$f"
  echo "Fixed: ${f#"$REPO_ROOT/"}"
  count=$((count + 1))
done < <(grep -rl '^status: active$' "$ARCHIVE_DIR" --include='*.md' || true)

echo "fix-archive-plan-status: flipped $count plan(s) active → completed."
