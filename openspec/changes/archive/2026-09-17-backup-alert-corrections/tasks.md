---
title: "backup-alert-corrections — Implementation Plan"
ticket_id: T016124
domains: [infra, monitoring]
status: active
file_locks: [k3d/monitoring/prometheus-rules.yaml, k3d/monitoring/alertmanager-matcher-strategy-patch.yaml, tests/spec/monitoring-alerts/backup-alerting.bats, tests/spec/monitoring-alerts.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# backup-alert-corrections — Implementation Plan

_Ticket: T016124_

## File Structure

```
k3d/monitoring/prometheus-rules.yaml                     (modified — 3 Alerts korrigiert/ergaenzt)
k3d/monitoring/alertmanager-matcher-strategy-patch.yaml  (modified — praezisere Strategy)
tests/spec/monitoring-alerts/backup-alerting.bats        (modified — 5 Korrektur-Guards)
tests/spec/monitoring-alerts.bats                        (modified — Pflicht-Set 11)
```

## Tasks

- [x] **Failing-Test-Step (RED).** Fuenf Guards gegen die Review-Befunde ergaenzt: echter
      CronJob-Name, eigene Wochenschwelle, `kube_cronjob_created`-Gate, `max_over_time` statt
      `increase` mit `kube_job_created`-Gate, praezisere Matcher-Strategy.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts/backup-alerting.bats
# expected: FAIL (rot — 5 neue Guards, 9 bestehende gruen)
```

- [x] **Fix-Step (GREEN).** `backup.rules` neu geschrieben (BackupJobFailed, BackupCronJobStale,
      RestoreVerifyStale) und die Matcher-Strategy auf
      `OnNamespaceExceptForAlertmanagerNamespace` gesetzt.

- [x] **Ausdruecke gegen den Live-Cluster geprueft.** Jeder der drei als Instant-Query:
      BackupJobFailed 4 Treffer (nur Jobs der letzten 12 h; ohne Alters-Gate waeren es 80),
      BackupCronJobStale 1 Treffer (`workspace-korczewski/pvc-backup`), RestoreVerifyStale
      0 Treffer (das `created`-Gate faengt den 9 h alten CronJob ab).

- [x] **Regelstruktur validiert.** `promtool check rules` -> `SUCCESS: 11 rules found`;
      `kubectl kustomize k3d/monitoring` rendert die neue Strategy am Alertmanager-CR.

- [x] **Delta-Spec.** MODIFIED fuer Pflicht-Set (11), BackupJobFailed und BackupCronJobStale;
      ADDED fuer die Wochenschwelle und das erhaltene Namespace-Scoping.

## Verify (RED → GREEN)

- [x] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Nach dem Deploy.** `amtool config routes test` fuer `namespace=workspace` muss den
      E-Mail-Receiver liefern statt `null`.
