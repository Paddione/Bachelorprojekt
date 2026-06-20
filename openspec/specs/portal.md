# portal

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Das Nutzerportal ist das kundenseitige Self-Service-Interface der Plattform. Es aggregiert
Nachrichten, Dateien, Verträge, Fragebögen, Rechnungen, Termine und externe Dienste in
einer einzigen, SSO-gesicherten Oberfläche unter `/portal`. Navigation erfolgt über einen
`?section=`-URL-Parameter; alle Daten werden lazy geladen — nur die aktive Sektion
verursacht Backend-Abfragen.

---

### Requirement: Authentifizierungspflicht

The system SHALL redirect unauthenticated requests to `/portal` to the Keycloak login page
and SHALL preserve the original target URL as post-login redirect destination.

#### Scenario: Direktzugriff ohne Session

- **GIVEN** ein Nutzer ist nicht eingeloggt
- **WHEN** er `/portal` oder `/portal?section=dateien` aufruft
- **THEN** wird er zum Keycloak-Authorization-Endpoint umgeleitet, mit dem Portal-Pfad als `redirect_uri`

#### Scenario: Zugriff nach Login

- **GIVEN** ein Nutzer hat sich erfolgreich via OIDC authentifiziert
- **WHEN** er auf `/portal` landet
- **THEN** wird die `overview`-Sektion gerendert und seine OIDC-Claims (Name, E-Mail, Sub) als Session verwendet

---

### Requirement: Customer-Upsert bei erstem Portal-Aufruf

The system SHALL create or update a customer record in the local database on every portal
page load, using the Keycloak user's name, email, and subject identifier.

#### Scenario: Kein Kundendatensatz vorhanden

- **GIVEN** ein Nutzer loggt sich zum ersten Mal ein
- **WHEN** `/portal` gerendert wird
- **THEN** legt `upsertCustomer` einen neuen Eintrag in der `customers`-Tabelle an, ohne die Seite zu blockieren (Fehler werden ignoriert)

#### Scenario: Kundendatensatz bereits vorhanden

- **GIVEN** der Nutzer hat sich bereits eingeloggt und besitzt einen Kundendatensatz
- **WHEN** `/portal` erneut gerendert wird
- **THEN** wird der bestehende Datensatz aktualisiert (idempotenter Upsert), und vorhandene Räume/Nachrichten bleiben erhalten

---

### Requirement: Badge-Counts im Sidebar immer aktuell

The system SHALL fetch unread message count, pending signature count, and pending
questionnaire count on every portal page load, regardless of the active section, and
SHALL display them as numeric badges in the navigation sidebar.

#### Scenario: Offene Aufgaben vorhanden

- **GIVEN** ein Nutzer hat 2 ausstehende Verträge und 1 unausgefüllten Fragebogen
- **WHEN** er eine beliebige Portal-Sektion aufruft
- **THEN** zeigt die Sidebar-Navigation die Badges „2" bei Verträgen und „1" bei Fragebögen

#### Scenario: Externer Dienst nicht erreichbar

- **GIVEN** Nextcloud ist nicht verfügbar
- **WHEN** die Badge-Zählung für ausstehende Unterschriften fehlschlägt
- **THEN** wird der Badge-Wert auf 0 gesetzt und das Portal lädt trotzdem vollständig

---

### Requirement: Dashboard-Übersicht mit Pending-Alerts

The system SHALL display, on the `overview` section, actionable alert banners for each
pending task category (pending signatures, pending questionnaires, active live stream)
and SHALL link each banner directly to the relevant section.

#### Scenario: Ausstehende Verträge

- **GIVEN** ein Nutzer hat mindestens einen ausstehenden Vertrag zur Unterschrift
- **WHEN** er die `overview`-Sektion aufruft
- **THEN** erscheint ein gelb hinterlegter Alert-Banner mit der Anzahl und einem Link zu `?section=vertraege`

#### Scenario: Laufender Live-Stream

- **GIVEN** `/api/stream/status` gibt `{ live: true }` zurück
- **WHEN** der Nutzer die Dashboard-Sektion aufruft
- **THEN** wird ein roter „Live"-Banner angezeigt, der auf `/portal/stream` verlinkt

#### Scenario: Keine ausstehenden Aufgaben

- **GIVEN** ein Nutzer hat weder Verträge noch Fragebögen noch einen aktiven Stream
- **WHEN** er die `overview`-Sektion aufruft
- **THEN** werden keine Alert-Banner angezeigt und die Begrüßungsmeldung enthält keinen Aufgaben-Hinweis

---

### Requirement: Lazy Section Loading

The system SHALL only fetch section-specific backend data when that section is the active
one, identified by the `?section=` URL parameter.

#### Scenario: Nachrichten-Sektion aktiv

- **GIVEN** der URL-Parameter ist `section=nachrichten`
- **WHEN** die Seite gerendert wird
- **THEN** werden Chaträume des Nutzers aus der Datenbank geladen; keine anderen Sektionsdaten (Kalender, Projekte etc.) werden abgefragt

#### Scenario: Kalender-Sektion aktiv

- **GIVEN** der URL-Parameter ist `section=kalender`
- **WHEN** die Seite gerendert wird
- **THEN** werden CalDAV-Buchungen und Projekte geladen; Nachrichten und Rechnungen bleiben ungefetcht

---

### Requirement: Vertragsunterschrift (Dual-Source)

The system SHALL present pending documents for signature from two independent sources —
Nextcloud (file-based, PENDING_SIGNATURES_DIR) and DocuSeal (database-assigned electronic
signatures) — in a unified list under the `vertraege` section.

#### Scenario: DocuSeal-Auftrag ausstehend

- **GIVEN** ein Kunde hat eine offene DocuSeal-Zuweisung mit Status `pending`
- **WHEN** er `?section=vertraege` aufruft
- **THEN** erscheint der Vertrag in der Liste mit dem Link `/portal/sign/{assignmentId}` und der Beschriftung „Elektronisch unterschreiben"

#### Scenario: Nextcloud-Datei zur Unterschrift

- **GIVEN** im Nextcloud-Ordner `<clientFolder>/pending-signatures/` liegt eine Datei
- **WHEN** der Nutzer `?section=vertraege` aufruft
- **THEN** erscheint die Datei in der Liste; ein Klick öffnet `/portal/document?path=...`

#### Scenario: Nextcloud nicht erreichbar

- **GIVEN** Nextcloud wirft eine Exception beim Auflisten des Signature-Verzeichnisses
- **WHEN** der Nutzer `?section=vertraege` aufruft
- **THEN** wird nur die DocuSeal-Liste gezeigt; kein Fehler ist für den Nutzer sichtbar

---

### Requirement: Rechnungsanzeige mit Inline-Zahlung

The system SHALL fetch and display all invoices for the authenticated customer from Stripe
and SHALL offer inline payment for invoices with status `open`.

#### Scenario: Offene Rechnung

- **GIVEN** ein Nutzer hat eine Rechnung mit Status `open`
- **WHEN** er `?section=rechnungen` aufruft
- **THEN** wird die Rechnung mit Betrag, Fälligkeitsdatum und einer Zahlungsoption (InlineInvoicePayment oder Stripe Hosted URL) angezeigt

#### Scenario: Bezahlte Rechnung

- **GIVEN** eine Rechnung hat Status `paid`
- **WHEN** der Nutzer die Rechnungssektion aufruft
- **THEN** wird die Rechnung mit grünem Status-Badge angezeigt; keine Zahlungsoption ist verfügbar

#### Scenario: Stripe nicht erreichbar

- **GIVEN** die Stripe-API gibt einen Fehler zurück
- **WHEN** Rechnungen abgerufen werden
- **THEN** wird eine leere Liste angezeigt; kein Fehler-Dialog unterbricht den Nutzer

---

### Requirement: Dienste-Übersicht (Externe Dienste)

The system SHALL display a grid of available platform services with direct deep-links
and SHALL only include services for which a base URL is configured, and SHALL conditionally
include brand-specific services.

#### Scenario: Nextcloud-Dienste verfügbar

- **GIVEN** `NEXTCLOUD_EXTERNAL_URL` ist gesetzt
- **WHEN** der Nutzer `?section=dienste` aufruft
- **THEN** werden Links zu Nextcloud Dateien, Kalender, Kontakte und Talk angezeigt

#### Scenario: Kore-Brand (korczewski)

- **GIVEN** die Nutzersession enthält `brand === 'korczewski'`
- **WHEN** der Nutzer `?section=dienste` aufruft
- **THEN** erscheint zusätzlich ein Kachel-Link zu `/portal/arena` (Multiplayer Gaming)

#### Scenario: Keine Dienste konfiguriert

- **GIVEN** weder `NEXTCLOUD_EXTERNAL_URL` noch `VAULT_EXTERNAL_URL` noch `BRETT_DOMAIN` sind gesetzt
- **WHEN** der Nutzer `?section=dienste` aufruft
- **THEN** wird die Meldung „Keine externen Dienste konfiguriert." angezeigt

---

### Requirement: Konto-Sektion mit DSGVO-Zugang

The system SHALL provide the authenticated user with access to their Keycloak account
management page (password, email, 2FA) and SHALL link to the DSGVO data management page
(`/meine-daten`) directly from the `konto` section.

#### Scenario: Konto-Verwaltungslink

- **GIVEN** `KEYCLOAK_FRONTEND_URL` und `KEYCLOAK_REALM` sind konfiguriert
- **WHEN** der Nutzer `?section=konto` aufruft
- **THEN** wird ein Link zu `{keycloakBase}/realms/{realm}/account/` angezeigt, der in einem neuen Tab öffnet

#### Scenario: DSGVO-Datenauskunft

- **GIVEN** der Nutzer befindet sich in der Konto-Sektion
- **WHEN** er auf „Meine Daten (DSGVO)" klickt
- **THEN** wird er zu `/meine-daten` weitergeleitet, wo er Datenauskunft und Löschung anfordern kann
