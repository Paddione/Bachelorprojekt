#!/usr/bin/env bash
# One-shot: walk all closed PRs on the GitHub remote, generate tracking/pending
# entries via track-pr.mjs --backfill. Idempotent (writes to pending/, ingest
# does ON CONFLICT upserts).
set -euo pipefail

DRY_RUN="${1:-}"

if ! command -v gh >/dev/null; then
  echo "ERROR: gh CLI required" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "Fetching all merged PRs..."
gh pr list \
  --state merged \
  --limit 2000 \
  --json number,title,body,mergedAt,mergedBy \
  > /tmp/pr-history.json

count=$(node -e 'const d=JSON.parse(require("fs").readFileSync("/tmp/pr-history.json","utf8")); console.log(d.length);')
echo "Got $count PRs."

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "Dry run — first 3 parsed rows:"
  node --input-type=module <<'EOF'
import { parsePr } from './scripts/track-pr.mjs';
import { readFileSync } from 'node:fs';
const prs = JSON.parse(readFileSync('/tmp/pr-history.json', 'utf8'));
prs.slice(0, 3).forEach(p => console.log(JSON.stringify(parsePr(p), null, 2)));
EOF
  exit 0
fi

mkdir -p tracking/pending
node scripts/track-pr.mjs --backfill < /tmp/pr-history.json
echo "Wrote $(ls tracking/pending/*.json 2>/dev/null | wc -l) pending rows."
echo "Next: commit + push, then wait for tracking-import CronJob (or run manually)."
