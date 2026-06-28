#!/usr/bin/env bats
# SSOT: openspec/changes/g-cq02-any-types-batch1/proposal.md
# G-CQ02: Explizite any-Typen reduzieren — Batch 1 Gate

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ02: any-count in website/src is at or below Batch-1 target (373)" {
  count=$(grep -rn ': any\|<any>\|as any' \
    "$REPO_ROOT/website/src" \
    --include='*.ts' --include='*.svelte' --include='*.astro' \
    | wc -l | tr -d ' ')
  echo "current any count: $count (target: <=373)"
  [ "$count" -le 373 ]
}

@test "G-CQ02: monitoring.ts has no more than 2 explicit any (was 13)" {
  count=$(grep -c ': any\|<any>\|as any' \
    "$REPO_ROOT/website/src/pages/api/admin/monitoring.ts" || true)
  echo "monitoring.ts any count: $count (target: <=2)"
  [ "$count" -le 2 ]
}

@test "G-CQ02: catch-blocks in admin API use err: unknown not err: any" {
  hits=$(grep -rn 'catch (err: any)' \
    "$REPO_ROOT/website/src/pages/api/admin" --include='*.ts' \
    | wc -l | tr -d ' ')
  echo "remaining err: any catch blocks: $hits (target: 0)"
  [ "$hits" -eq 0 ]
}
