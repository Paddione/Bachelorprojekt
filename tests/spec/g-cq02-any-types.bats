#!/usr/bin/env bats
# SSOT: openspec/changes/cq02-any-types-200/proposal.md
# G-CQ02: Explizite any-Verwendungen in website/src auf ≤200 reduzieren.
# RED  (pre-impl):  463 > 200 → FAIL
# GREEN (post-impl): ≤200     → PASS

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-CQ02: explicit any count in website/src is at most 200" {
  run bash -c "grep -rn ': any\|<any>\|as any' '$REPO_ROOT/website/src' \
    --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '"
  echo "any count: $output (limit: 200)"
  [ "$output" -le 200 ]
}
