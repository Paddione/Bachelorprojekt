#!/usr/bin/env bats
# tests/spec/monitoring-alerts.bats
# SSOT: openspec/specs/monitoring-alerts.md
#
# Covers: Prometheus rules file, mandatory alert set, alertmanager config.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  RULES="$REPO/k3d/monitoring/prometheus-rules.yaml"
  ALERTMANAGER="$REPO/k3d/monitoring/alertmanager-config.yaml"
}

# ── Prometheus Rules File Existence ───────────────────────────────────

@test "prometheus-rules.yaml exists" {
  [ -f "$RULES" ]
}

# ── Mandatory Alert Set ───────────────────────────────────────────────

@test "prometheus-rules.yaml declares PodCrashLoopBackOff alert" {
  run grep -q 'PodCrashLoopBackOff' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares HighCPUUsage alert" {
  run grep -q 'HighCPUUsage' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares HighMemoryUsage alert" {
  run grep -q 'HighMemoryUsage' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares HighDiskUsage alert" {
  run grep -q 'HighDiskUsage' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares High5xxErrorRate alert" {
  run grep -q 'High5xxErrorRate' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares PodRestartSpike alert" {
  run grep -q 'PodRestartSpike' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares NodeHighCPUUsage alert" {
  run grep -q 'NodeHighCPUUsage' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares NodeFilesystemAlmostFull alert" {
  run grep -q 'NodeFilesystemAlmostFull' "$RULES"
  [ "$status" -eq 0 ]
}

# ── Alertmanager Configuration ────────────────────────────────────────

@test "alertmanager-config.yaml exists" {
  [ -f "$ALERTMANAGER" ]
}

@test "alertmanager-config.yaml configures Pushover receiver" {
  run grep -qi 'pushover' "$ALERTMANAGER"
  [ "$status" -eq 0 ]
}
