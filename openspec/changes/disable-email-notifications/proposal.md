# Proposal: disable-email-notifications

## Why

Die Plattform verschickt Benachrichtigungs-E-Mails aus vier unabhängigen Quellen — Website-Admin-
Benachrichtigungen, dem `notify-unread`-CronJob, Alertmanager und Nextclouds Activity-Digest.
Es gibt keinen gemeinsamen Schalter. Wer sie abstellen will, fasst vier Systeme einzeln an, und
jeder neu hinzugefügte Benachrichtigungstyp ist per Default wieder aktiv.

Der Betreiber will keine dieser Mails mehr erhalten. Gleichzeitig darf der Zustellweg selbst
nicht wegfallen: transaktionale Mails an Endnutzer — DSGVO-Auskunftsbestätigung, Buchungs- und
Registrierungsbestätigung, Vaultwarden-Einladung, DocuSeal-Signaturanfrage — sind Teil des
jeweiligen Vorgangs und keine Benachrichtigung über ihn.

## What

Ein zentraler, reversibler Kill-Switch für die Website-Benachrichtigungen plus gezielte
Abschaltung der drei übrigen Quellen. Gilt für beide Brands und staging.

1. **Website-Admin-Benachrichtigungen** — `sendAdminNotification()` wird an einer Stelle
   kurzgeschlossen, gesteuert über `EMAIL_NOTIFICATIONS_ENABLED`. Fehlend oder ≠ `'true'`
   bedeutet aus, sodass ohne Änderung an `environments/*.yaml` alle Umgebungen still sind.
   Die Admin-UI-Toggles bleiben als Feinsteuerung darunter erhalten.

2. **`notify-unread`-CronJob** — `spec.suspend: true` in `k3d/notify-unread-cronjob.yaml`.

3. **Alertmanager** — beide E-Mail-Receiver entfallen zugunsten eines leeren Blackhole-Receivers.
   Eine `AlertmanagerConfig` ganz ohne Receiver wäre ungültig und würde vom Prometheus Operator
   verworfen (vgl. den T014542-Kommentar in der Datei).

4. **Nextcloud Activity-Digest** — per `occ`-Konfiguration abgeschaltet. Vaultwarden und DocuSeal
   bleiben unverändert: deren Manifeste tragen nur SMTP-Transport, keine Benachrichtigungs-
   Schalter, und `SMTP_HOST` zu leeren würde transaktionale Mails mit abschalten.

**Bewusst akzeptierte Folge:** Nach Punkt 3 gibt es keinerlei Alarmierung mehr. Die Alert-Regeln
feuern weiter und bleiben in der Prometheus-UI sichtbar, aber niemand wird benachrichtigt — auch
nicht bei fehlgeschlagenen Backups. Der Betreiber hat diese Konsequenz nach ausdrücklichem
Hinweis bestätigt.

Die Entscheidungen samt verworfener Alternativen stehen in `design.md`.

_Ticket: T016592_
