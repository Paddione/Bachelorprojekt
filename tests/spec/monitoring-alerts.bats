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

# Pflicht-Set auf zehn erweitert [T015712] — Detailpruefung der beiden
# Backup-Alerts (Metrik, Suspend-Filter, Routing) liegt in
# tests/spec/monitoring-alerts/backup-alerting.bats.

@test "prometheus-rules.yaml declares BackupJobFailed alert" {
  run grep -q 'BackupJobFailed' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares BackupCronJobStale alert" {
  run grep -q 'BackupCronJobStale' "$RULES"
  [ "$status" -eq 0 ]
}

# ── Alertmanager Configuration ────────────────────────────────────────

@test "alertmanager-config.yaml exists" {
  [ -f "$ALERTMANAGER" ]
}

@test "alertmanager-config.yaml routes via email while Pushover creds are absent" {
  # Positiv-Anker: das E-Mail-Routing muss konfiguriert sein.
  run grep -q 'emailConfigs:' "$ALERTMANAGER"
  [ "$status" -eq 0 ]
  # PUSHOVER_USER/TOKEN sind seit #1552 leer — ein pushoverConfigs-Block mit
  # leerem userKey lässt den Operator die KOMPLETTE Config verwerfen
  # ("mandatory field userKey is empty"), womit auch die E-Mail-Zustellung
  # stirbt. Solange keine gesealten Credentials vorliegen, darf der Block
  # nicht gebaut werden. [T014542]
  local pushover
  pushover=$(grep -c 'pushoverConfigs:' "$ALERTMANAGER" || true)
  [ "$pushover" -eq 0 ]
}

# ── Resource Registration in kustomization.yaml ─────────────────────────

@test "no unregistered resource manifests in k3d/monitoring" {
  local kustomize="$REPO/k3d/monitoring/kustomization.yaml"
  local errors=0

  # Extract resource filenames from the resources: block (lines following "resources:" indented with "  - ")
  local resources
  resources=$(awk '/^resources:/{flag=1; next} /^[a-z]/{flag=0} flag && /^  - /{sub(/^  - /,""); print}' "$kustomize")

  # Extract patch filenames from the patches: block (lines with "  - path: ...")
  local patches
  patches=$(awk '/^patches:/{flag=1; next} /^[a-z]/{flag=0} flag && /^  - path: /{sub(/^  - path: /,""); print}' "$kustomize")

  for f in "$REPO"/k3d/monitoring/*.yaml; do
    [ -f "$f" ] || continue
    local base
    base=$(basename "$f")

    # Skip kustomization.yaml itself
    [ "$base" = "kustomization.yaml" ] && continue

    # Skip files that are template stubs (contain ${} variable substitution)
    if grep -qF '${' "$f" 2>/dev/null; then
      continue
    fi

    # Only check files with a top-level kind: field (i.e. Kubernetes resources)
    if grep -q '^kind:' "$f" 2>/dev/null; then
      # Check if listed in resources or patches
      if ! echo "$resources" | grep -qxF "$base" && ! echo "$patches" | grep -qxF "$base"; then
        echo "FAIL: $base is a Kubernetes resource (kind: field) but is not listed in kustomization.yaml resources or patches"
        errors=$((errors + 1))
      fi
    fi
  done
  [ "$errors" -eq 0 ]
}

@test "health-goals-cronjob.yaml does not exist" {
  # Health-goals measurement is owned by .github/workflows/health-goals.yml,
  # NOT by an in-cluster CronJob. Assert the dead manifest is absent.
  [ ! -f "$REPO/k3d/monitoring/health-goals-cronjob.yaml" ]
}

# ── Manifest-Hardening: Resource-Limits (T014553, SA-GR-05) ──────────
# prod/monitoring/resource-limits-patch.yaml muss alle Hauptcontainer des
# kube-prometheus-stack abdecken — inklusive DaemonSet-Patch für den
# node-exporter und der beiden Grafana-Sidecars.

@test "monitoring: limits-patch deckt Hauptcontainer ab" {
  patch="$REPO/prod/monitoring/resource-limits-patch.yaml"
  grep -qE '^kind: DaemonSet' "$patch"
  grep -q 'name: monitoring-prometheus-node-exporter' "$patch"
  for c in node-exporter grafana-sc-dashboard grafana-sc-datasources kube-state-metrics kube-prometheus-stack; do
    entry="$(grep -A3 -- "- name: $c" "$patch" | grep -c 'resources:' || true)"
    [ "$entry" -ge 1 ] || { echo "Container $c hat kein resources-Patch"; false; }
  done
}
