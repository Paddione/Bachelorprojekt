#!/usr/bin/env bats
REPO="$BATS_TEST_DIRNAME/../../.."
YAML="$REPO/k3d/k1-embed-job.yaml"

@test "Job-YAML besteht Client-Dry-Run via sed-Substitution" {
  skip 'kein Cluster verfuegbar (wird lokal nicht gebraucht)'
  run bash -c "kubectl apply --dry-run=client -f '$YAML'"
  [ "$status" -eq 0 ]
}
