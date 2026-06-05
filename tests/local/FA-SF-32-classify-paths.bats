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
