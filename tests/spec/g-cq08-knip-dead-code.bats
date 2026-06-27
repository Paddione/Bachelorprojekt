#!/usr/bin/env bats
# SSOT: openspec/changes/g-cq08-knip-dead-code/proposal.md
# G-CQ08: knip konfiguriert für website + Dead-Code (unused exports/files) −50%.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  BASELINE="$REPO_ROOT/docs/code-quality/knip-baseline.json"
}

@test "G-CQ08: knip.json config exists for website" {
  [ -f "$REPO_ROOT/website/knip.json" ]
}

@test "G-CQ08: knip is a website devDependency" {
  jq -e '.devDependencies.knip // .dependencies.knip' \
    "$REPO_ROOT/website/package.json" >/dev/null
}

@test "G-CQ08: dead-code baseline recorded (before + after)" {
  [ -f "$BASELINE" ]
  jq -e '(.unused_before|type=="number") and (.unused_after|type=="number")' \
    "$BASELINE" >/dev/null
}

@test "G-CQ08: dead-code reduced by >= 50% vs baseline" {
  before=$(jq -r '.unused_before' "$BASELINE")
  after=$(jq -r '.unused_after' "$BASELINE")
  removed=$(( before - after ))
  half=$(( (before + 1) / 2 ))   # ceil(before/2)
  echo "before=$before after=$after removed=$removed need>=$half"
  [ "$removed" -ge "$half" ]
}
