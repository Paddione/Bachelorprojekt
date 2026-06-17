#!/usr/bin/env bats
# T000617 — Grafana alert rules + Pushover Alertmanager config validation.

RULES_FILE="k3d/monitoring/prometheus-rules.yaml"
AM_FILE="k3d/monitoring/alertmanager-config.yaml"

setup() {
  cd "$BATS_TEST_DIRNAME/../.." || exit 1
}

@test "prometheus-rules.yaml exists" {
  [ -f "$RULES_FILE" ]
}

@test "prometheus-rules.yaml declares all 8 mandatory alerts" {
  for alert in PodCrashLoopBackOff HighCPUUsage HighMemoryUsage HighDiskUsage High5xxErrorRate PodRestartSpike NodeHighCPUUsage NodeFilesystemAlmostFull; do
    grep -q "alert: $alert" "$RULES_FILE"
  done
}

@test "prometheus-rules.yaml passes promtool check rules" {
  command -v promtool >/dev/null || skip "promtool not installed (offline)"
  # Extract the .spec.groups into a bare Prometheus rule file for promtool.
  command -v yq >/dev/null || skip "yq not installed (offline)"
  tmp="$(mktemp)"
  yq '.spec' "$RULES_FILE" > "$tmp"
  run promtool check rules "$tmp"
  rm -f "$tmp"
  [ "$status" -eq 0 ]
}

@test "alertmanager-config.yaml declares a pushover receiver" {
  grep -q "pushoverConfigs:" "$AM_FILE"
}

@test "alertmanager-config.yaml declares an email receiver" {
  grep -q "emailConfigs:" "$AM_FILE"
}

@test "alertmanager-config.yaml has no hardcoded brand domain" {
  ! grep -Eq 'mentolder\.de|korczewski\.de' <(grep -v '^\s*#' "$AM_FILE")
}

@test "k3d/monitoring kustomize builds" {
  run kubectl kustomize k3d/monitoring/ --load-restrictor=LoadRestrictionsNone
  [ "$status" -eq 0 ]
}
