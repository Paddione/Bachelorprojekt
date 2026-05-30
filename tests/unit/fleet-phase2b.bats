#!/usr/bin/env bats
# Structural guards for Fleet Phase 2b full-stack deploy wiring.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
}

@test "fleet:shared-services task exists" {
  run grep -qE '^\s+fleet:shared-services:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "fleet:talk-setup:brand task exists" {
  run grep -qE '^\s+fleet:talk-setup:brand:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "fleet:deploy:brand runs mcp:deploy and post-setup but NOT talk-setup" {
  # Extract the fleet:deploy:brand block (until the next top-level task at same indent)
  block="$(awk '/^  fleet:deploy:brand:/{f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:brand:/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  echo "$block" | grep -q 'workspace:deploy'
  echo "$block" | grep -q 'mcp:deploy'
  echo "$block" | grep -q 'workspace:post-setup'
  ! echo "$block" | grep -q 'talk-setup'
}

@test "fleet:deploy deploys shared-services exactly once (not per brand)" {
  block="$(awk '/^  fleet:deploy:/{if($0 ~ /fleet:deploy:$/)f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:$/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  count="$(echo "$block" | grep -c 'fleet:shared-services')"
  [ "$count" -eq 1 ]
}

@test "fleet:deploy orders shared-services after both brand deploys, before talk-setup" {
  block="$(awk '/^  fleet:deploy:/{if($0 ~ /fleet:deploy:$/)f=1} f&&/^  [a-z].*:$/&&!/fleet:deploy:$/{if(seen)exit} f{print; seen=1}' "$TASKFILE")"
  shared_line="$(echo "$block" | grep -n 'fleet:shared-services' | head -1 | cut -d: -f1)"
  talk_line="$(echo "$block" | grep -n 'fleet:talk-setup:brand' | head -1 | cut -d: -f1)"
  brand_line="$(echo "$block" | grep -n 'fleet:deploy:brand' | tail -1 | cut -d: -f1)"
  [ "$brand_line" -lt "$shared_line" ]
  [ "$shared_line" -lt "$talk_line" ]
}
