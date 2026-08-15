#!/usr/bin/env bash
# scripts/assets-sync.sh — sync root /assets to service public/ directories.
# Mapping preserves existing URL paths so no source code changes are needed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ Syncing assets/audio/ → components/brett/public/assets/sfx/"
rsync -a --delete assets/audio/ components/brett/public/assets/sfx/

echo "→ Syncing assets/game/ → components/brett/public/assets/combat/"
rsync -a --delete assets/game/ components/brett/public/assets/combat/

echo "→ Syncing assets/branding/ → components/website/public/brand/"
# No --delete: only a subset of brand files live in assets/branding/
rsync -a assets/branding/ components/website/public/brand/

echo "✓ assets:sync complete"
