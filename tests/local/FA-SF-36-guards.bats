#!/usr/bin/env bats
# FA-SF-36: structural contract for scripts/factory/guards.sh (offline, no cluster).
SCRIPT="scripts/factory/guards.sh"
setup() { load 'test_helper.bash'; }

@test "FA-SF-36: guards.sh exists and passes bash -n" {
  [ -f "$SCRIPT" ]
  run bash -n "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-36: defines the four guard functions" {
  for fn in guard_killswitch_on guard_daily_cap_reached guard_dryrun_ok guard_check_diff_size; do
    run grep -Eq "^${fn}\(\)" "$SCRIPT"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-36: sources lib.sh for factory_psql (no inline kubectl)" {
  run grep -Eq 'source .*lib\.sh|\. .*lib\.sh' "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "factory_psql" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-36: kill-switch reads factory_control via ticket.sh factory-control get" {
  run grep -q "factory-control get" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "killswitch" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-36: daily-cap honours FACTORY_DAILY_DEPLOY_CAP" {
  run grep -q "FACTORY_DAILY_DEPLOY_CAP" "$SCRIPT"; [ "$status" -eq 0 ]
}
