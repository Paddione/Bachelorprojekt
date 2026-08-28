---
title: "disable-email-notifications — Design"
ticket_id: T016592
status: active
---

# Design: Alle E-Mail-Benachrichtigungen plattformweit deaktivieren

_Ticket: T016592_

## Problem

Die Plattform verschickt Benachrichtigungs-E-Mails aus vier voneinander unabhängigen Quellen.
Es gibt keinen gemeinsamen Schalter: wer sie abstellen will, muss vier Systeme einzeln anfassen,
und ein neu hinzugefügter Benachrichtigungstyp ist per Default wieder an.

## Zielbild

Ein zentraler, reversibler Kill-Switch für die Website-Benachrichtigungen plus gezielte
Abschaltung der drei übrigen Quellen. **Transaktionale** Mails an Endnutzer bleiben unberührt.

## Entscheidungen aus dem Brainstorming

### E1 — Trennlinie: Benachrichtigung vs. transaktional

**Entscheidung:** Abgeschaltet wird, was den *Betreiber* über Ereignisse informiert. Erhalten
bleibt, was der *Endnutzer* als Antwort auf seine eigene Handlung erwartet.

| erhalten (transaktional) | abgeschaltet (Benachrichtigung) |
|---|---|
| DSGVO-Auskunftsbestätigung | Admin-Mail „neue Registrierung" |
| Buchungs-/Registrierungsbestätigung an den Nutzer | Admin-Mail „neue Buchung/Kontaktanfrage/Bug" |
| Vaultwarden-Einladung, 2FA, Passwort-Hinweis | Nextcloud Activity-Digest |
| DocuSeal-Signaturanfrage | `notify-unread`-Erinnerung an ungelesene Nachrichten |

**Warum:** Ein DSGVO-Auskunftspfad ohne Zustellweg ist kein deaktiviertes Feature, sondern ein
kaputtes. Dieselbe Logik trägt Vaultwarden- und DocuSeal-Mails: deren Versand IST der Vorgang,
nicht ein Bericht darüber.

### E2 — Mechanik: globaler Kill-Switch statt Default-Flip

**Entscheidung:** `sendAdminNotification()` in `components/website/src/lib/notifications.ts`
wird an einer einzigen Stelle kurzgeschlossen, bevor irgendein `site_setting` gelesen wird.
Steuerung über die Umgebungsvariable `EMAIL_NOTIFICATIONS_ENABLED`; **fehlend oder ≠ `'true'`
bedeutet aus**.

**Warum diese Polarität:** Der Default-aus-Fall braucht damit *keine* Änderung an
`environments/*.yaml`, `k3d/website.yaml` und den `envsubst`-Listen — beide Brands, staging und
dev sind mit einer Code-Zeile still. Ein Default-Flip in `TYPE_DEFAULTS` hätte das nicht
geleistet: die bestehenden `site_settings`-Zeilen `notify_*` gewinnen über den Code-Default, und
jeder künftige Benachrichtigungstyp müsste erneut einzeln bedacht werden.

Die bestehenden Admin-UI-Toggles bleiben funktionsfähig und liegen **unter** dem Kill-Switch —
sie steuern weiterhin die Feinauswahl, sobald jemand wieder einschaltet.

### E3 — Alertmanager: Blackhole-Receiver statt Receiver-Löschung

**Entscheidung:** Beide E-Mail-Receiver in `k3d/monitoring/alertmanager-config.yaml` entfallen;
`route.receiver` zeigt auf einen leeren Receiver `null` (Name ohne `emailConfigs`).

**Warum kein ersatzloses Löschen:** Eine `AlertmanagerConfig` ohne Receiver ist ungültig — der
Prometheus Operator verwirft dann die komplette Ressource. Genau dieser Fehlermodus ist in der
Datei bereits als Kommentar zu T014542 dokumentiert (leere Pushover-Credentials legten das
E-Mail-Routing lahm). Der Blackhole-Receiver ist die Alertmanager-übliche Form von „nirgendwohin".

**Bewusst akzeptierte Folge:** Nach dieser Änderung gibt es **keinerlei Alarmierung** mehr.
Die Alert-*Regeln* feuern weiter und bleiben in der Prometheus-UI sichtbar, aber niemand wird
benachrichtigt — auch nicht bei fehlgeschlagenen Backups (`BackupJobFailed`,
`BackupCronJobStale`). Der Nutzer wurde auf diese Konsequenz hingewiesen und hat sie bestätigt.

### E4 — Reichweite

Beide Brands (`mentolder`, `korczewski`) und `staging`. Aus E2 folgt, dass das ohne
Env-Datei-Änderungen gilt; Alertmanager und CronJob liegen ohnehin in der gemeinsamen Basis
`k3d/`, die alle Overlays erben.

### E5 — Scope-Schnitt bei Nextcloud/Vaultwarden/DocuSeal

**Entscheidung (Annahme, aus E1 abgeleitet):** Von Scope-Punkt 4 des Tickets bleibt nur
Nextclouds **Activity-Digest**. Vaultwarden und DocuSeal behalten ihre SMTP-Konfiguration
unverändert.

**Warum:** Die Manifeste `k3d/vaultwarden.yaml` und die DocuSeal-Ressourcen tragen ausschließlich
SMTP-*Transport*-Konfiguration, keine Benachrichtigungs-Schalter. Der einzige verfügbare Hebel
wäre, `SMTP_HOST` zu leeren — das würde Einladungen, 2FA-Mails und Signaturanfragen mit
abschalten und damit E1 verletzen.

## Vorbedingung mit Konfliktpotenzial

`openspec/specs/monitoring-alerts.md` verlangt heute das Gegenteil von E3:

- **Requirement „Email Notification Receiver"** (Zeile 221): *„The system SHALL configure an email
  receiver in the Alertmanager configuration"* — wird **REMOVED**.
- **Requirement „Alerts aus den Workspace-Namespaces erreichen einen Empfänger"** (Zeile 63) —
  dessen Szenario erwartet als aufgelösten Receiver den E-Mail-Receiver; wird **MODIFIED**.
- **Requirement „Backup-Job-Failures lösen kritischen Alert aus"** (Zeile 84) — dessen Szenario
  endet auf „is routed to the email receiver"; wird **MODIFIED**.

Absichernde Guards, die mitgezogen werden müssen:
`tests/spec/monitoring-alerts.bats` (Test „routes via email while Pushover creds are absent") und
`tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats` (vier Tests rund um den
`backup-email`-Receiver).

## Verworfene Alternativen

- **Ersatzkanal statt E-Mail (ntfy/Pushover/Webhook):** verworfen. Hätte einen neuen Kanal samt
  SealedSecret erfordert und den Ticket-Scope von „abschalten" zu „umbauen" verschoben.
- **Code-Pfade ersatzlos ausbauen:** verworfen. Ohne Revert nicht wieder einschaltbar; der
  Kill-Switch erreicht dasselbe reversibel.
- **Nur `TYPE_DEFAULTS` auf `'false'`:** verworfen, siehe E2 — greift nicht gegen bestehende
  `site_settings`-Zeilen.
