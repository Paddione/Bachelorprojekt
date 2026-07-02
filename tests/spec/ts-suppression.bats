#!/usr/bin/env bats
# SSOT: openspec/changes/ts-suppression-elimination/proposal.md
# G-RH02: keine TypeScript-Suppressionen in website/src

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH02: keine @ts-ignore in website/src" {
  # goals-data.ts:221 (T001514) enthaelt den Literal-String als Teil des
  # eigenen G-RH02-measurement-Kommandos, kein echter Suppression-Kommentar.
  count=$(grep -rn "@ts-ignore" "$REPO_ROOT/website/src" \
    --include="*.ts" --include="*.svelte" --include="*.astro" \
    --exclude-dir=node_modules --exclude=goals-data.ts 2>/dev/null | wc -l)
  [ "$count" -eq 0 ]
}

@test "G-RH02: keine @ts-expect-error in website/src" {
  # goals-data.ts:221 (T001514) enthaelt den Literal-String als Teil des
  # eigenen G-RH02-measurement-Kommandos, kein echter Suppression-Kommentar.
  count=$(grep -rn "@ts-expect-error" "$REPO_ROOT/website/src" \
    --include="*.ts" --include="*.svelte" --include="*.astro" \
    --exclude-dir=node_modules --exclude=goals-data.ts 2>/dev/null | wc -l)
  [ "$count" -eq 0 ]
}
