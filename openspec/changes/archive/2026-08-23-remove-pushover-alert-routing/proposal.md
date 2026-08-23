# Proposal: remove-pushover-alert-routing

## Why

Der Prometheus Operator verwirft seit Einführung des Pushover-Routings (#1552, 2026-06)
beide AlertmanagerConfigs im Namespace `monitoring` mit
`AlertmanagerConfig … was rejected due to invalid configuration: mandatory field userKey is empty`
(4–8 Events/Tag, zuletzt 2026-08-23). Ursache: `PUSHOVER_USER`/`PUSHOVER_TOKEN` waren in allen
Environment-Files (`environments/*.yaml`) noch **nie** gesetzt (`""`) — das SealedSecret
`alertmanager-pushover` entschlüsselt daher zu leeren Werten. Da die Validierung die komplette
Config als Einheit prüft, ist damit auch das E-Mail-Routing (`workspace-alerts`, Default-Receiver)
wirkungslos: Alarme kommen aktuell auf keinem Kanal an.

Zusätzlich existiert im Cluster ein verwaistes `AlertmanagerConfig/pushover`-Objekt ohne Repo-Gegenstück
(Drift), das dieselbe Reject-Meldung erzeugt.

_Ticket: T014542_

## What

- `k3d/monitoring/alertmanager-config.yaml`: Pushover-Receiver und die Route
  `severity=critical → pushover` entfernen; E-Mail-Routing bleibt als einziger (jetzt wieder
  validierender) Kanal. Kommentar dokumentiert die Reaktivierungs-Bedingung.
- `k3d/monitoring/kustomization.yaml`: Eintrag `alertmanager-pushover-secret.yaml` entfernen;
  Datei löschen (Flux `prune: true` räumt das Live-SealedSecret automatisch ab).
- `k3d/monitoring/alertmanager-secret-template.yaml` bleibt als Seal-Vorlage liegen (hat keinen
  Kustomize-Bezug; Re-Seal sobald echte Credentials vorliegen).
- Verwaistes Live-Objekt `AlertmanagerConfig/pushover` manuell löschen (nicht Flux-managed).
- SSOT-Spec-Delta: Requirement „Pushover Notification Receiver" wird ersetzt durch eine
  Bedingungs-Anforderung — solange `PUSHOVER_*` leer sind, DARF keine Pushover-Konfiguration
  gebaut werden; Wiedereinführung nur mit gesealten Credentials.
- BATS-Assertions, die `pushoverConfigs:` fordern, werden auf die neue Realität umgestellt
  (Positiv-Anker E-Mail + Negativ-Assertion Pushover).
