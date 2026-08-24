---
title: "backup-alerting — Implementation Plan"
ticket_id: T015712
domains: [infra, monitoring]
status: active
file_locks: [k3d/monitoring/prometheus-rules.yaml, tests/spec/monitoring-alerts/backup-alerting.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# backup-alerting — Implementation Plan

_Ticket: T015712_

## File Structure

```
k3d/monitoring/prometheus-rules.yaml                  (modified — neue Gruppe backup.rules)
tests/spec/monitoring-alerts/backup-alerting.bats     (new — BATS-Guard für Regelabdeckung)
```

## Tasks

### Partial 1: Backup-Alerts (Implementation + Tests)

1. **RED — BATS-Guard anlegen.** Neue Datei
   `tests/spec/monitoring-alerts/backup-alerting.bats` mit drei Tests gegen
   `k3d/monitoring/prometheus-rules.yaml`:
   - Gruppe `backup.rules` existiert und enthält Alert `BackupJobFailed` mit
     `severity: critical`
   - `BackupJobFailed`-Expr matcht `kube_job_status_failed`, Filter
     `namespace=~"workspace|workspace-korczewski"` und Job-Präfixe
     `(pvc-backup|db-backup|backup-restore-verify)`
   - Alert `BackupCronJobStale` existiert mit Schwellwert `93600` (26 h) und demselben
     Namespace-Filter

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts/backup-alerting.bats
# expected: FAIL (red — backup.rules existiert noch nicht in prometheus-rules.yaml)
```

2. **GREEN — Regelgruppe ergänzen.** In `k3d/monitoring/prometheus-rules.yaml` unter
   `spec.groups` die Gruppe `backup.rules` anhängen:

```yaml
- name: backup.rules
  rules:
    - alert: BackupJobFailed
      expr: |
        increase(kube_job_status_failed{namespace=~"workspace|workspace-korczewski",job_name=~"(pvc-backup|db-backup|backup-restore-verify).*"}[12h]) > 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Backup-Job {{ $labels.job_name }} fehlgeschlagen ({{ $labels.namespace }})"
        description: "Backup-Job {{ $labels.job_name }} in {{ $labels.namespace }} hat in den letzten 12 h Failed-Pods. Offsite-Kopie prüfen."
    - alert: BackupCronJobStale
      expr: |
        time() - kube_cronjob_status_last_schedule_time{namespace=~"workspace|workspace-korczewski",cronjob=~"(pvc-backup|db-backup|backup-restore-verify)"} > 93600
      for: 15m
      labels:
        severity: warning
      annotations:
        summary: "Backup-CronJob {{ $labels.cronjob }} seit >26 h nicht mehr gescheduled ({{ $labels.namespace }})"
        description: "Letzter Schedule von {{ $labels.cronjob }} in {{ $labels.namespace }} liegt mehr als 26 h zurück — CronJob suspended oder Scheduler ausgefallen."
```

   Stil an den bestehenden Regeln orientieren (gleiche Einrückung, Annotation-Muster,
   Namespace-Regex wie `workspace.rules`). Kein Eingriff in `alertmanager-config.yaml`,
   CronJobs oder Flux-Ressourcen.

3. **Verifizieren.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts/backup-alerting.bats
# expected: PASS (green)
task workspace:validate
# Kustomize-Build muss grün bleiben (PrometheusRule ist über kustomization referenziert)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Guard vor der Implementierung laufen lassen; er
      muss auf dem Ausgangsbranch rot sein.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts/backup-alerting.bats
# expected: FAIL (red — die backup.rules-Gruppe ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** `backup.rules` in `k3d/monitoring/prometheus-rules.yaml`
      ergänzen, bis der BATS-Guard grün ist.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
