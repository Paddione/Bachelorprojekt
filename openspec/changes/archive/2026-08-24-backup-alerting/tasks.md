---
title: "backup-alerting — Implementation Plan"
ticket_id: T015712
domains: [infra, monitoring]
status: completed
file_locks: [k3d/monitoring/prometheus-rules.yaml, k3d/monitoring/kustomization.yaml, k3d/monitoring/alertmanager-matcher-strategy-patch.yaml, tests/spec/monitoring-alerts/backup-alerting.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# backup-alerting — Implementation Plan

_Ticket: T015712_

## File Structure

```
k3d/monitoring/alertmanager-matcher-strategy-patch.yaml  (new — Routing-Fix, Strategic Merge)
k3d/monitoring/kustomization.yaml                        (modified — Patch registrieren)
k3d/monitoring/prometheus-rules.yaml                     (modified — Gruppe backup.rules)
tests/spec/monitoring-alerts/backup-alerting.bats        (new — Guard für Regeln + Routing)
```

## Kontext: drei am Cluster gemessene Vorbedingungen

Diese drei Befunde sind der Grund, warum der Plan über reine Alert-Regeln hinausgeht. Sie wurden
am 2026-08-24 gegen den fleet-Cluster gemessen, nicht angenommen.

**1. Ohne Routing-Fix erreicht kein Alert einen Empfänger.** Die `AlertmanagerConfig`
`workspace-alerts` liegt in `namespace: monitoring`. Der Prometheus Operator hängt per Default
(`alertmanagerConfigMatcherStrategy=OnNamespace`, am Live-CR nicht gesetzt) einen Matcher
`namespace="monitoring"` an. Alerts aus `workspace*` fallen dadurch auf den Default-Receiver
`null`:

```bash
kubectl --context fleet -n monitoring exec alertmanager-monitoring-alertmanager-0 -c alertmanager -- \
  amtool config routes test --config.file=/etc/alertmanager/config_out/alertmanager.env.yaml \
  namespace=workspace alertname=BackupJobFailed severity=critical
# -> null
# namespace=monitoring -> monitoring/workspace-alerts/email
```

Das betrifft nicht nur die neuen Regeln: alle acht bestehenden Pflicht-Alerts tragen
`namespace=~"workspace|workspace-korczewski"` und werden ebenfalls verworfen.

**2. `last_schedule_time` misst das Falsche.** Ein CronJob, der jede Nacht planmäßig startet und
dann scheitert, hält diese Metrik dauerhaft frisch. Genau dieser Fall hat das Ticket ausgelöst.
Gemessen gegen Prometheus feuert der Ausdruck spiegelverkehrt — Fehlalarm auf dem suspendierten
Job, Blindstelle auf dem echten Ausfall:

```bash
# alter Ausdruck: time() - kube_cronjob_status_last_schedule_time{...} > 93600
#   -> feuert NUR fuer workspace-korczewski/db-backup (suspendiert, nichts zu sichern)
#   -> feuert NICHT fuer workspace-korczewski/pvc-backup (seit 17 Tagen kein Erfolg)
```

**3. Suspendierte CronJobs müssen ausgeschlossen werden.** `workspace-korczewski/db-backup` trägt
`kube_cronjob_spec_suspend == 1` — die Brand ist seit 2026-07-26 eingefroren, `shared-db` läuft mit
0 Replicas (T002479/T013037, begründet in `prod-korczewski/kustomization.yaml:312`). Ohne Filter
feuert der Alert dort ab Tag 1 dauerhaft, und ein immer roter Alert entwertet auch den echten.

Zusätzlich fehlt die Serie `kube_cronjob_status_last_successful_time` für CronJobs, die **nie**
erfolgreich waren (36 Serien gegen 52 bei `last_schedule_time`). Ein reiner
`time() - metric > X`-Ausdruck alarmiert für die nie — der `unless`-Zweig unten fängt das ab.

## Tasks

### Partial 1: Routing-Fix und Alert-Regeln

1. **Routing-Patch anlegen.** Neue Datei `k3d/monitoring/alertmanager-matcher-strategy-patch.yaml`.
   Der Stack wird als pre-rendered YAML angewendet (`kube-prometheus-stack-rendered.yaml`,
   Alertmanager-CR ab Zeile 77330); ein Strategic-Merge-Patch vermeidet das Neu-Rendern der
   5-MB-Datei. Das Muster existiert bereits in derselben kustomization für
   `loki-sc-rules-resources-patch.yaml`.

```yaml
# Hebt den namespace="monitoring"-Matcher auf, den der Prometheus Operator sonst per
# Default (OnNamespace) an die AlertmanagerConfig workspace-alerts haengt. Ohne diesen
# Patch fallen ALLE Alerts aus workspace/workspace-korczewski auf den Default-Receiver
# "null" und werden verworfen — nachgewiesen mit `amtool config routes test`. [T015712]
apiVersion: monitoring.coreos.com/v1
kind: Alertmanager
metadata:
  name: monitoring-alertmanager
  namespace: monitoring
spec:
  alertmanagerConfigMatcherStrategy:
    type: None
```

   Feldnamen sind gegen die CRD geprüft: `kubectl explain alertmanager.spec.alertmanagerConfigMatcherStrategy`
   nennt `type` mit dem Enum `OnNamespace | OnNamespaceExceptForAlertmanagerNamespace | None`.

2. **Patch registrieren.** In `k3d/monitoring/kustomization.yaml` den bestehenden
   `patches:`-Block um einen zweiten Eintrag ergänzen:

```yaml
patches:
  - path: loki-sc-rules-resources-patch.yaml
  - path: alertmanager-matcher-strategy-patch.yaml
```

3. **Regelgruppe ergänzen.** In `k3d/monitoring/prometheus-rules.yaml` unter `spec.groups` die
   Gruppe `backup.rules` anhängen. Einrückung und Annotation-Muster wie in `workspace.rules`:

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
        description: "Backup-Job {{ $labels.job_name }} in {{ $labels.namespace }} hat in den letzten 12 h Failed-Pods. Offsite-Kopie pruefen."
    - alert: BackupCronJobStale
      expr: |
        (
          (time() - kube_cronjob_status_last_successful_time{namespace=~"workspace|workspace-korczewski",cronjob=~"(pvc-backup|db-backup|backup-restore-verify)"} > 93600)
          and on(namespace, cronjob) (kube_cronjob_spec_suspend == 0)
        )
        or
        (
          (kube_cronjob_spec_suspend{namespace=~"workspace|workspace-korczewski",cronjob=~"(pvc-backup|db-backup|backup-restore-verify)"} == 0)
          unless on(namespace, cronjob) kube_cronjob_status_last_successful_time
        )
      for: 15m
      labels:
        severity: critical
      annotations:
        summary: "Backup-CronJob {{ $labels.cronjob }} seit >26 h ohne Erfolg ({{ $labels.namespace }})"
        description: "Letzter ERFOLGREICHER Lauf von {{ $labels.cronjob }} in {{ $labels.namespace }} liegt mehr als 26 h zurueck, oder es gab noch nie einen. Suspendierte CronJobs sind ausgenommen."
```

   `last_successful_time` statt `last_schedule_time` (Befund 2), `and on(...) suspend == 0` gegen
   den Dauerfehlalarm (Befund 3), der `unless`-Zweig für nie erfolgreiche CronJobs.

4. **Ausdruck gegen den Live-Cluster gegenprüfen.** Vor dem Commit den fertigen Ausdruck als
   Instant-Query gegen Prometheus schicken und das Ergebnis mit der Erwartung vergleichen:

```bash
kubectl --context fleet -n monitoring exec prometheus-monitoring-prometheus-0 -c prometheus -- \
  wget -qO- --post-data="query=<expr>" http://localhost:9090/api/v1/query
# erwartet: genau workspace-korczewski/pvc-backup
# NICHT erwartet: workspace-korczewski/db-backup (suspendiert), die frischen workspace-Jobs
```

### Partial 2: Guards (Tests)

5. **Failing-Test-Step (RED).** Neue Datei `tests/spec/monitoring-alerts/backup-alerting.bats`
   mit vier Tests. Jeder prüft **command output**, nicht die Implementierungsquelle, und trägt
   einen Positiv-Anker gegen stille Leertreffer:

   - `backup.rules` existiert und deklariert `BackupJobFailed` mit `severity: critical`
     (Positiv-Anker: die Datei enthält weiterhin die acht bestehenden Pflicht-Alerts)
   - `BackupCronJobStale` nutzt `kube_cronjob_status_last_successful_time` und **nicht**
     `kube_cronjob_status_last_schedule_time` — der Test schlägt fehl, sobald die alte Metrik
     zurückkehrt
   - `BackupCronJobStale` enthält den Suspend-Filter `kube_cronjob_spec_suspend`
   - `k3d/monitoring/kustomization.yaml` registriert `alertmanager-matcher-strategy-patch.yaml`,
     und die Patch-Datei setzt `type: None`

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts/backup-alerting.bats
# expected: FAIL (rot — weder backup.rules noch der Routing-Patch existieren)
```

6. **Bestehenden Guard nachziehen.** `tests/spec/monitoring-alerts.bats` prüft das Pflicht-Set von
   acht Alerts. Das Set wächst auf zehn — der Test muss `BackupJobFailed` und `BackupCronJobStale`
   mit aufnehmen, sonst widerspricht er dem Delta-Spec.

7. **Delta-Spec pflegen.** In `openspec/changes/backup-alerting/specs/monitoring-alerts.md` das
   MODIFIED Requirement für das Pflicht-Set (acht auf zehn) und ein ADDED Requirement für die
   Zustellung (`alertmanagerConfigMatcherStrategy: None`, Positiv-Anker: `emailConfigs` bleibt
   aktiv) führen. Nicht zusätzlich `openspec/specs/monitoring-alerts.md` editieren — das Delta
   wird erst beim Archivieren gemergt.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Guard vor der Implementierung laufen lassen; er muss auf dem
      Ausgangsbranch rot sein.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts/backup-alerting.bats
# expected: FAIL (rot — backup.rules und der Routing-Patch fehlen noch)
```

- [ ] **Fix-Step (GREEN).** Patch, kustomization-Eintrag und `backup.rules` ergänzen, bis der
      Guard grün ist.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts/backup-alerting.bats tests/spec/monitoring-alerts.bats
task workspace:validate
```

- [ ] **Zustellung nach dem Deploy verifizieren.** Der Routing-Fix wirkt erst am Cluster. Nach dem
      Reconcile denselben amtool-Aufruf wiederholen, der die Lücke belegt hat — er muss jetzt den
      E-Mail-Receiver statt `null` liefern:

```bash
kubectl --context fleet -n monitoring exec alertmanager-monitoring-alertmanager-0 -c alertmanager -- \
  amtool config routes test --config.file=/etc/alertmanager/config_out/alertmanager.env.yaml \
  namespace=workspace alertname=BackupJobFailed severity=critical
# erwartet: monitoring/workspace-alerts/email   (vorher: null)
```

- [ ] **Akzeptanz aus dem Ticket.** Einen Failed-Lauf erzwingen und prüfen, dass innerhalb weniger
      Minuten ein sichtbares Signal entsteht.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
