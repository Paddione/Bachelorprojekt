#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# dev-cluster-autostart.bats — Regression guard for T000290
# ═══════════════════════════════════════════════════════════════════
# The mentolder-dev k3d cluster did not come back after a k3s-1 host
# reboot (recurrence of T000013), taking dev.mentolder.de offline and
# breaking the published 127.0.0.1:15432 db port the nightly
# dev-db-refresh CronJob consumes.
#
# The fix is a boot-time systemd unit that runs `k3d cluster start`.
# These tests lock the load-bearing invariants so a future edit cannot
# silently regress them — most critically that the unit NEVER runs
# `k3d cluster create` (which would drop the port mappings 18080/2222/
# 15432 that the dev stack and db-refresh depend on).
# ═══════════════════════════════════════════════════════════════════

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/dev-cluster-autostart.sh"

@test "autostart installer script exists" {
  [ -f "$SCRIPT" ]
}

@test "autostart script passes bash syntax check" {
  run bash -n "$SCRIPT"
  assert_success
}

@test "autostart unit starts the cluster on boot, never creates it" {
  # ExecStart must `cluster start`, never `cluster create` — create would
  # lose the load-bearing port mappings (18080/2222/15432).
  run grep -qE 'ExecStart=.*cluster start' "$SCRIPT"
  assert_success
  run grep -qE 'cluster create' "$SCRIPT"
  assert_failure
}

@test "autostart unit orders after and requires docker" {
  run grep -qiE '^(After|Requires)=docker\.service' "$SCRIPT"
  assert_success
}

@test "autostart unit is a oneshot that remains active" {
  run grep -qE 'Type=oneshot' "$SCRIPT"
  assert_success
  run grep -qiE 'RemainAfterExit=true' "$SCRIPT"
  assert_success
}

@test "autostart installer is idempotent (enable --now)" {
  run grep -qE 'systemctl enable --now' "$SCRIPT"
  assert_success
}

@test "autostart unit is wired into the boot target" {
  run grep -qE 'WantedBy=multi-user\.target' "$SCRIPT"
  assert_success
}

@test "dev Taskfile exposes a cluster:autostart task" {
  run grep -qE '^[[:space:]]*cluster:autostart:' "${PROJECT_DIR}/Taskfile.dev-stack.yml"
  assert_success
}
