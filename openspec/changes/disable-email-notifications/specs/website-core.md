## ADDED Requirements

### Requirement: Globaler Kill-Switch für Admin-Benachrichtigungs-Mails

The system SHALL short-circuit `sendAdminNotification()` in
`components/website/src/lib/notifications.ts` before any `site_setting` lookup unless the
environment variable `EMAIL_NOTIFICATIONS_ENABLED` is exactly the string `'true'`. An unset,
empty, or differing value SHALL disable every admin notification type
(`registration`, `booking`, `contact`, `bug`, `message`, `followup`) in every brand and
environment without requiring changes to `environments/*.yaml` or `k3d/website.yaml`.

Transactional mail to end users — sent through `sendEmail()` in
`components/website/src/lib/email.ts` from routes such as `api/dsgvo-request.ts`,
`api/booking.ts`, `api/register.ts` and `api/contact.ts` — SHALL remain unaffected by the switch.

#### Scenario: Kill-Switch unterdrückt Admin-Benachrichtigung *(Vitest)*

- **GIVEN** `EMAIL_NOTIFICATIONS_ENABLED` ist nicht gesetzt
- **WHEN** `sendAdminNotification({ type: 'contact', subject: 's', text: 't' })` aufgerufen wird
- **THEN** wird `sendEmail` nicht aufgerufen und die Funktion kehrt ohne Fehler zurück

#### Scenario: Explizites Einschalten stellt das alte Verhalten her *(Vitest)*

- **GIVEN** `EMAIL_NOTIFICATIONS_ENABLED` ist `'true'` und das `site_setting` `notify_contact`
  ist nicht auf `'false'` gesetzt
- **WHEN** `sendAdminNotification({ type: 'contact', subject: 's', text: 't' })` aufgerufen wird
- **THEN** wird `sendEmail` genau einmal mit der konfigurierten Empfängeradresse aufgerufen

#### Scenario: Transaktionale Mail bleibt unberührt *(Vitest)*

- **GIVEN** `EMAIL_NOTIFICATIONS_ENABLED` ist nicht gesetzt
- **WHEN** `sendEmail` direkt aufgerufen wird, wie es der DSGVO-Auskunftspfad tut
- **THEN** wird die Mail unverändert zugestellt — der Kill-Switch greift ausschließlich in
  `sendAdminNotification`

---

### Requirement: notify-unread CronJob ist suspendiert

The system SHALL set `spec.suspend: true` on the `notify-unread` CronJob in
`k3d/notify-unread-cronjob.yaml`, so that no unread-message reminder mail is produced in any
brand namespace or in staging. The manifest SHALL remain registered in `k3d/kustomization.yaml`
so that re-enabling requires only flipping the field.

#### Scenario: CronJob ist im Manifest suspendiert *(BATS)*

- **GIVEN** die Datei `k3d/notify-unread-cronjob.yaml` existiert
- **WHEN** ihr Inhalt geprüft wird
- **THEN** enthält sie `suspend: true` auf `spec`-Ebene
- **AND** `k3d/kustomization.yaml` listet `notify-unread-cronjob.yaml` weiterhin unter
  `resources:` (Positiv-Anker: der Eintrag verschwindet nicht mit der Abschaltung)
