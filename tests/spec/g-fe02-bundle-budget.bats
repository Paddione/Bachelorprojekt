#!/usr/bin/env bats
# SSOT: openspec/changes/g-fe02-bundle-budget/
# G-FE02: Client-JS-Bundle messen + Budget (kein Netto-Zuwachs/Release).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-FE02: bundle baseline file exists" {
  [ -f "$REPO_ROOT/website/bundle-baseline.json" ]
}

@test "G-FE02: baseline JSON has a positive totalGzipBytes field" {
  run node -e 'const b=require(process.argv[1]); process.exit(Number(b.totalGzipBytes)>0?0:1)' \
    "$REPO_ROOT/website/bundle-baseline.json"
  [ "$status" -eq 0 ]
}

@test "G-FE02: check-bundle-size script is present and parses" {
  run node --check "$REPO_ROOT/scripts/check-bundle-size.mjs"
  [ "$status" -eq 0 ]
}
