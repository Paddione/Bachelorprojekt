#!/usr/bin/env bats
# Vorzustand vor T900505 (commit 715cac7cf): nur der Client-Dry-Run-Test,
# ohne Erreichbarkeits-Guard und ohne offline Render-Test.
REPO="$BATS_TEST_DIRNAME/../../.."
YAML="$REPO/k3d/k1-embed-job.yaml"

@test "Job-YAML besteht Client-Dry-Run via sed-Substitution" {
  [ -n "$(command -v kubectl)" ] || skip 'kubectl fehlt'
  export JOB_ID=abc1234-999 FULL=0 MERGE_SHA=abc1234def5678 REPO_URL=https://example.invalid/x.git
  run bash -c "sed -e 's/\\\$JOB_ID/abc1234-999/g' -e 's/\\\$MERGE_SHA/abc1234def5678/g' -e 's/\\\$FULL/0/g' -e 's|\\\$REPO_URL|https://example.invalid/x.git|g' '$YAML' | kubectl apply --dry-run=client -f -"
  [ "$status" -eq 0 ]
}
