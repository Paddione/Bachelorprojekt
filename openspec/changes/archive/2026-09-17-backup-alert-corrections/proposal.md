# Proposal: backup-alert-corrections

## Why

Code-Review zu PR #5218 (backup-alerting, T015712) fand sechs Befunde; fünf davon machen die
gerade eingeführten Backup-Alerts wirkungslos oder dauerrot. Alle sind gegen Repo und
fleet-Cluster verifiziert.

1. **Falscher CronJob-Name.** Beide Alerts filtern auf `backup-restore-verify`. So heißt die
   *Datei*; der CronJob darin heißt `db-restore-verify`. Prometheus-Label-Matcher sind voll
   verankert — die wöchentliche Restore-Verifikation ist damit vollständig ungedeckt.
2. **Tagesschwelle für einen Wochenjob.** `db-restore-verify` läuft `30 3 * * 0`. Mit 26 h wäre
   der Alert an sechs von sieben Tagen kritisch.
3. **Matcher-Strategy zu breit.** `type: None` hebt das Namespace-Scoping cluster-weit auf. Die
   `workspace-alerts`-Route trägt weder `matchers` noch `continue` und würde damit zur
   Catch-all.
4. **Dauerrot für neue CronJobs.** `kube_cronjob_status_last_successful_time` entsteht erst nach
   dem ersten Erfolg. `db-restore-verify` hat live NULL Serien (vor 9 h angelegt, wöchentlich) —
   mit korrigiertem Namen wäre der Alert sofort dauerhaft kritisch.
5. **`increase()` verpasst schnelle Fehlschläge.** `kube_job_status_failed` trägt ein
   `reason`-Label; eine Serie, die ab dem ersten Sample konstant 1 ist, hat `increase()` = 0 —
   genau das Profil eines Jobs, der an einer Pre-flight-Prüfung in Sekunden scheitert.

## What

- `db-restore-verify` statt `backup-restore-verify` in allen Ausdrücken und im Spec.
- Eigener Alert `RestoreVerifyStale` mit 8-Tage-Schwelle (`severity: warning`); die tägliche
  Regel behält 26 h.
- `alertmanagerConfigMatcherStrategy.type: OnNamespaceExceptForAlertmanagerNamespace` statt
  `None`.
- `kube_cronjob_created`-Gate am `unless`-Zweig beider Stale-Alerts.
- `BackupJobFailed`: `max without (reason) (max_over_time(...))` statt `increase(...)`, plus
  `kube_job_created`-Gate gegen Altlasten.

## Entscheidungen

- **`max_over_time` braucht zwingend das Alters-Gate.** Ohne es feuern die noch existierenden
  Failed-Job-Objekte: live gemessen 80 Serien statt 4.
- **`max without (reason)`** aggregiert die mehreren `reason`-Serien pro Job zu einem Alert.
- **Eigener Alert statt CronJob-gekoppelter Schwelle:** zwei Regeln sind lesbarer als eine
  Regel mit eingebetteter Schwellentabelle, und die Severities dürfen sich unterscheiden
  (täglicher Backup-Ausfall ist kritisch, eine verpasste Wochenverifikation ist eine Warnung).
- **Nicht im Scope:** F6 aus dem Review — ein vollständig gelöschter CronJob bleibt blind, weil
  beide Zweige mindestens eine KSM-Serie brauchen. Eine `absent()`-Regel je erwartetem CronJob
  würde bei absichtlich entfernten CronJobs dauerfeuern und braucht eine eigene Entscheidung.

## Akzeptanz

Die drei Ausdrücke wurden als Instant-Queries gegen Prometheus im fleet-Cluster geprüft:
`BackupJobFailed` 4 Treffer (nur Jobs der letzten 12 h), `BackupCronJobStale` 1 Treffer
(`workspace-korczewski/pvc-backup`, seit 17 Tagen ohne Erfolg), `RestoreVerifyStale` 0 Treffer
(das `created`-Gate fängt den 9 h alten Job ab). `promtool check rules` meldet 11 Regeln.

_Ticket: T016124_
