#!/usr/bin/env bats
# T000617 — Grafana alert rules + Alertmanager config validation.

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

@test "alertmanager-config.yaml has no pushover receiver while creds are absent" {
  # Positiv-Anker zuerst: der receivers-Block muss vorhanden sein. Seit T016592
  # traegt er den leeren null-Receiver statt eines Email-Receivers — eine
  # AlertmanagerConfig ganz ohne Receiver waere ungueltig.
  grep -q '^  receivers:' "$AM_FILE"
  # Ein pushoverConfigs mit leerem userKey verwirft die komplette Config am
  # Prometheus-Operator ("mandatory field userKey is empty"). [T014542]
  local pushover
  pushover=$(grep -c 'pushoverConfigs:' "$AM_FILE" || true)
  [ "$pushover" -eq 0 ]
}

@test "alertmanager-config.yaml routes alerts to the authorized operator mailbox" {
  grep -q '^    - name: operator-email' "$AM_FILE"
  grep -q '^    receiver: operator-email' "$AM_FILE"
  grep -q 'emailConfigs:' "$AM_FILE"
  grep -q 'to: korczewski@mailbox.org' "$AM_FILE"
}

@test "alertmanager-config.yaml has no hardcoded brand domain" {
  ! grep -Eq 'mentolder\.de|korczewski\.de' <(grep -v '^\s*#' "$AM_FILE")
}

@test "k3d/monitoring kustomize builds" {
  run kubectl kustomize k3d/monitoring/ --load-restrictor=LoadRestrictionsNone
  [ "$status" -eq 0 ]
}
