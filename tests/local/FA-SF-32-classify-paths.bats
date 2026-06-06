#!/usr/bin/env bats
# FA-SF-32: shared-state allowlist + classify-paths.sh escalate-class detection.
setup() { load 'test_helper.bash'; }

@test "FA-SF-32: shared-state-allowlist.txt exists with the four required prefixes" {
  local f="scripts/factory/shared-state-allowlist.txt"
  [ -f "$f" ]
  grep -qx 'k3d/' "$f"
  grep -qx 'prod' "$f"
  grep -qx 'environments/' "$f"
  grep -qx 'Taskfile' "$f"
}

@test "FA-SF-32: k3d/ path is escalate-class (allowlist prefix)" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "k3d/website.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: prod-fleet path is escalate-class (prefix 'prod')" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "prod-fleet/mentolder/kustomization.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a .sql file is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/db/migrate.sql"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a path containing 'secret' is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "environments/.secrets/mentolder.yaml"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: a realm json is escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "k3d/realm-workspace-dev.json"
  [ "$status" -eq 0 ]
}

@test "FA-SF-32: pure website src is NOT escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/pages/index.astro,website/src/lib/foo.ts"
  [ "$status" -eq 1 ]
}

@test "FA-SF-32: mixed list with one shared-state path IS escalate-class" {
  source scripts/factory/classify-paths.sh
  run paths_are_escalate_class "website/src/lib/foo.ts,Taskfile.yml"
  [ "$status" -eq 0 ]
}

