#!/usr/bin/env bats
# SSOT: openspec/changes/cq02-any-types-200/proposal.md
# G-CQ02: Explizite any-Verwendungen in website/src auf ≤200 reduzieren.
# GREEN (post-impl): ≤200 → PASS

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ02: explicit any count in website/src is at most 200" {
  run bash -c "grep -rn ': any\|<any>\|as any' '$REPO_ROOT/website/src' \
    --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '"
  echo "any count: $output (limit: 200)"
  [ "$output" -le 200 ]
}

@test "G-CQ02: monitoring.ts has no more than 2 explicit any (was 13)" {
  count=$(grep -c ': any\|<any>\|as any' \
    "$REPO_ROOT/website/src/pages/api/admin/monitoring.ts" || true)
  echo "monitoring.ts any count: $count (target: <=2)"
  [ "$count" -le 2 ]
}

@test "G-CQ02: catch-blocks in admin API use err: unknown not err: any" {
  hits=$(grep -rn 'catch (err: any)\|catch (error: any)' \
    "$REPO_ROOT/website/src/pages/api/admin" --include='*.ts' \
    | wc -l | tr -d ' ')
  echo "remaining err: any catch blocks: $hits (target: 0)"
  [ "$hits" -eq 0 ]
}
