# Proposal: backup-alerting

## Why

Der `pvc-backup` CronJob lief vom 2026-06-10 bis 2026-08-23 mit Failed-Jobs nachts durch, ohne
dass ein Alarm auslöste — entdeckt nur durch manuelles Systemaudit (T013044-Triage). Dasselbe
Muster droht `db-backup` und allen weiteren Backup-CronJobs beider Brands. Ein stiller
Backup-Ausfall ist Datenverlust-Risikoklasse.

## What

Erweiterung der bestehenden PrometheusRule `workspace-alerts`
(`k3d/monitoring/prometheus-rules.yaml`) um eine Regelgruppe `backup.rules`:

1. **BackupJobFailed** (`severity: critical`) — `increase(kube_job_status_failed{namespace=~"workspace|workspace-korczewski", job_name=~"(pvc-backup|db-backup|backup-restore-verify).*"}[12h]) > 0`, `for: 5m`.
2. **BackupCronJobStale** (`severity: warning`) — `time() - kube_cronjob_status_last_schedule_time{namespace=~"workspace|workspace-korczewski", cronjob=~"(pvc-backup|db-backup|backup-restore-verify)"} > 93600` (26 h Toleranz auf täglichen Schedule), `for: 15m`.

Zustellung läuft über den vorhandenen Alertmanager-Pfad (Pushover + E-Mail laut Spec
`openspec/specs/monitoring-alerts.md` Purpose) — **keine** Änderung an Alertmanager-Konfig,
CronJobs oder Flux-Notifications. kube-state-metrics ist als Teil des kube-prometheus-stack
aktiv (die bestehenden Regeln nutzen bereits `kube_*`-Metriken), daher sind beide Metriken
ohne neue Komponenten verfügbar.

## Entscheidungen (Planner)

- **Ansatz:** Prometheus-Alert-Regeln statt Flux-Notifications — kube-prometheus-stack ist
  deployt, Alertmanager-Zustellung existiert, und Job-/CronJob-Metriken liegen dort nativ vor.
  Flux-Notifications würde einen zweiten Benachrichtigungspfad parallel zum bestehenden
  aufbauen (Redundanz ohne Gewinn).
- **Scope:** pvc-backup + db-backup + backup-restore-verify, beide Namespaces/Brands.
- **Nicht im Scope:** Retention-Änderungen, Restore-Verifikation, neue Empfänger.

## Akzeptanz

Künstlich erzwungener Failed-Lauf erzeugt innerhalb weniger Minuten ein sichtbares Signal;
BATS-Guard in `tests/spec/monitoring-alerts/backup-alerting.bats` verifiziert Regelabdeckung
(beide Alerts, beide Namespaces, 26-h-Schwelle) deterministisch gegen die YAML.

_Ticket: T015712_
