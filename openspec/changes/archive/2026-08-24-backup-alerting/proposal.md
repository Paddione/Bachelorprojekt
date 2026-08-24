# Proposal: backup-alerting

## Why

Der `pvc-backup` CronJob lief vom 2026-06-10 bis 2026-08-23 mit Failed-Jobs nachts durch, ohne
dass ein Alarm auslöste — entdeckt nur durch manuelles Systemaudit (T013044-Triage). Dasselbe
Muster droht `db-backup` und allen weiteren Backup-CronJobs beider Brands. Ein stiller
Backup-Ausfall ist Datenverlust-Risikoklasse.

Eine reine Erweiterung der Alert-Regeln löst das Problem nicht. Drei am 2026-08-24 gegen den
fleet-Cluster gemessene Befunde bestimmen den Zuschnitt:

1. **Die Zustellung ist tot.** Die `AlertmanagerConfig` liegt in `namespace: monitoring`; der
   Prometheus Operator hängt per Default (`alertmanagerConfigMatcherStrategy=OnNamespace`) einen
   Matcher `namespace="monitoring"` an. `amtool config routes test` liefert für
   `namespace=workspace` den Receiver `null`. Auch die acht bestehenden Pflicht-Alerts werden
   dadurch verworfen — sie tragen alle `namespace=~"workspace|workspace-korczewski"`.
2. **`last_schedule_time` misst die Auslösung, nicht den Erfolg.** Ein CronJob, der jede Nacht
   startet und dann scheitert, hält die Metrik frisch und alarmiert nie — exakt der Fall, der
   dieses Ticket ausgelöst hat.
3. **Suspendierte CronJobs erzeugen Dauerfehlalarm.** `workspace-korczewski/db-backup` ist bewusst
   suspendiert (Brand eingefroren, T002479/T013037). Ein immer roter Alert entwertet auch den
   echten.

## What

1. **Routing-Fix.** Neue Datei `k3d/monitoring/alertmanager-matcher-strategy-patch.yaml` setzt am
   Alertmanager-CR `spec.alertmanagerConfigMatcherStrategy.type: None`, registriert über den
   bestehenden `patches:`-Block in `k3d/monitoring/kustomization.yaml`. Strategic Merge statt
   Neu-Rendern der 5-MB-Datei `kube-prometheus-stack-rendered.yaml`; das Muster existiert dort
   bereits für `loki-sc-rules-resources-patch.yaml`.

2. **Regelgruppe `backup.rules`** in `k3d/monitoring/prometheus-rules.yaml`:
   - **BackupJobFailed** (`severity: critical`) — `increase(kube_job_status_failed{...}[12h]) > 0`
     für `(pvc-backup|db-backup|backup-restore-verify).*`, `for: 5m`.
   - **BackupCronJobStale** (`severity: critical`) — `time() - kube_cronjob_status_last_successful_time > 93600`
     (26 h Toleranz auf täglichen Schedule), verknüpft mit `kube_cronjob_spec_suspend == 0`, plus
     `unless`-Zweig für CronJobs ohne jede Erfolgs-Serie. `for: 15m`.

3. **Spec und Guards.** Delta auf `monitoring-alerts`: Pflicht-Set acht auf zehn, neues Requirement
   für die Zustellung. Neuer BATS-Guard plus Nachzug des bestehenden `monitoring-alerts.bats`.

Keine Änderung an CronJobs, Retention oder Flux-Notifications. kube-state-metrics ist Teil des
kube-prometheus-stack; alle vier genutzten Metriken wurden in Prometheus als vorhanden verifiziert.

## Entscheidungen (Planner)

- **Ansatz:** Prometheus-Alert-Regeln statt Flux-Notifications — der kube-prometheus-stack ist
  deployt und die Job-/CronJob-Metriken liegen dort nativ vor. Flux-Notifications würde einen
  zweiten Benachrichtigungspfad parallel zum bestehenden aufbauen.
- **Routing über `type: None` statt eigener Route:** Der Namespace-Matcher stammt vom
  Operator-Default, nicht aus der Config-Datei — er lässt sich nicht in
  `alertmanager-config.yaml` wegkonfigurieren. `None` ist der dafür vorgesehene CRD-Wert.
- **Pushover bleibt außen vor:** per T014542 bewusst entfernt, weil leere Credentials die gesamte
  AlertmanagerConfig kippen. E-Mail ist der aktive Kanal.
- **Scope:** pvc-backup + db-backup + backup-restore-verify, beide Namespaces.
- **Nicht im Scope:** Retention-Änderungen, Restore-Verifikation, neue Empfänger.

## Akzeptanz

Ein künstlich erzwungener Failed-Lauf erzeugt innerhalb weniger Minuten ein sichtbares Signal.
Zusätzlich muss `amtool config routes test` für `namespace=workspace` nach dem Deploy den
E-Mail-Receiver liefern statt `null` — ohne diesen Nachweis ist die Akzeptanz nicht erfüllt,
weil der Alarm sonst nirgends ankommt.

_Ticket: T015712_
