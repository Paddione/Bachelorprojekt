#!/usr/bin/env bats
# SSOT: openspec/changes/ts-suppression-elimination/proposal.md
# G-RH02: keine TypeScript-Suppressionen in website/src

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH02: keine @ts-ignore in website/src" {
  count=$(grep -rn "@ts-ignore" "$REPO_ROOT/website/src" \
    --include="*.ts" --include="*.svelte" --include="*.astro" \
    --exclude-dir=node_modules 2>/dev/null | wc -l)
  [ "$count" -eq 0 ]
}

@test "G-RH02: keine @ts-expect-error in website/src" {
  count=$(grep -rn "@ts-expect-error" "$REPO_ROOT/website/src" \
    --include="*.ts" --include="*.svelte" --include="*.astro" \
    --exclude-dir=node_modules 2>/dev/null | wc -l)
  [ "$count" -eq 0 ]
}
