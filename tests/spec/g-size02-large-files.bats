#!/usr/bin/env bats
# SSOT: openspec/changes/g-size02-large-files-reduction/tasks.md
# G-SIZE02: Large files (>600 lines) in VideoVault reduced to <= 8.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-SIZE02: VideoVault files >600 lines count is at most 8" {
  run bash -c "find '$REPO_ROOT/VideoVault' -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.svelte' -o -name '*.astro' \) ! -path '*/node_modules/*' ! -type l -exec wc -l {} + | awk '\$1 > 600 && \$2 != \"total\"' | wc -l | tr -d ' '"
  echo "VideoVault files >600 lines: $output (target: <= 8)"
  [ "$output" -le 8 ]
}
