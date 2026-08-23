# Flux- & CronJob-Suspensions — Registry bewusster Ausnahmen

> **Zweck:** Das System-Audit (§1.1 flux-cluster, Checkliste in
> `.agents/skills/system-audit/references/checklists.md`) meldet jede Ressource mit
> `Suspended=True` als Warning — **außer** die Ausnahme ist bewusst dokumentiert.
> Diese Datei ist der Dokumentations-Touchpoint dafür: Jede beabsichtigte Suspension
> steht hier mit Grund, Beleg und Wiederprüf-Anlass. Eine Suspension ohne Zeile in
> dieser Tabelle ist ein Audit-Befund (SA-FC-Familie).

Stand: 2026-08-23 ([T014541])

## Registry

| Ressource | Namespace | Deklariert in | Suspended seit | Grund | Beleg | Reaktivieren bei |
|---|---|---|---|---|---|---|
| CronJob `knowledge-ingest-markdown` | `workspace`, `workspace-staging` | `k3d/knowledge-ingest-cronjob.yaml` (`suspend: true`) | 2026-08-09 | Markdown-Ingest läuft bewusst **lokal-only** (`task knowledge:reindex SOURCE=markdown`) — der Cluster hat kein Repo-Mount | [T002605] (Kommentar im Manifest) | nächstem Knowledge-Stack-Change |
| CronJobs `systemtest-cleanup`, `systemtest-outbox`, `systemtest-purge-all` | `website-staging` | `k3d/cronjob-systemtest-cleanup.yaml` (`suspend: true`, seit [T014541]) | ~2026-06-26 (live), 2026-08-23 (git) | Staging-Systemtest-Pipeline ruht (LastSchedule 2026-06-26). Der ursprüngliche Live-Grund wurde nicht protokolliert — die Suspension geschah ungeplant per kubectl; mit [T014541] ins Manifest kodifiziert, um die stille Drift zu beenden | [T014541] | Reaktivierung der Systemtest-/Failure-Bridge-Pipeline |
| Kustomizations `ks-korczewski`, `ks-jobs-korczewski`, `ks-website-korczewski`; OCIRepository `fleet-manifests-gitlab`; Deployment `ddns-updater` | `workspace-korczewski` u. a. | `flux/clusters/fleet/ks-*.yaml`, `flux/clusters/fleet/oci-source-gitlab.yaml`, `prod-korczewski/*` | 2026-08-23 (kodifiziert) | Bewusste **korczewski-Brand-Pause** | [T014537] | Reaktivierung der korczewski-Brand |

## Regeln

1. **Dokumentationspflicht:** Jede neue Suspension braucht sofort einen Eintrag in
   dieser Tabelle (Grund + Ticket-Beleg). Der System-Audit-Sweep liest diese Datei
   als Positivliste.
2. **Keine stille Drift:** Lebt eine Suspension nur im Cluster (per `kubectl`/Flux-CLI
   gesetzt, nicht im Git), ist sie zeitnah ins Manifest zu kodifizieren — sonst
   überlebt sie den nächsten Reconcile nicht oder verschleiert den Zustand dauerhaft
   (genau das passierte bei `systemtest-*`: 57 Tage live-only).
3. **Aufheben nur mit Beleg:** Eine Suspension wird nur über ein Ticket aufgehoben;
   dabei Zeile hier entfernen bzw. Datum aktualisieren.

[T002605]: https://github.com/Paddione/Bachelorprojekt/tickets/T002605
[T014537]: https://github.com/Paddione/Bachelorprojekt/tickets/T014537
[T014541]: https://github.com/Paddione/Bachelorprojekt/tickets/T014541
