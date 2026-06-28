# portal

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Nutzerportal ist das kundenseitige Self-Service-Interface der Plattform. Es aggregiert
Nachrichten, Dateien, Verträge, Fragebögen, Rechnungen, Termine und externe Dienste in
einer einzigen, SSO-gesicherten Oberfläche unter `/portal`. Navigation erfolgt über einen
`?section=`-URL-Parameter; alle Daten werden lazy geladen — nur die aktive Sektion
verursacht Backend-Abfragen.

---

## Requirements

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

---

### Requirement: Profil-Eingabevalidierung (Feldlängen)

The system SHALL reject profile update payloads where the `phone` field exceeds 30 characters and SHALL return a validation error without persisting the data.

#### Scenario: Zu langes Telefonnummernfeld

- **GIVEN** ein Nutzer übermittelt ein Profilformular mit einer Telefonnummer, die länger als 30 Zeichen ist
- **WHEN** `validateProfileInput` mit diesem Payload aufgerufen wird
- **THEN** gibt die Funktion `{ ok: false }` zurück und die Daten werden nicht in die Datenbank geschrieben

#### Scenario: Gültiger Profil-Payload

- **GIVEN** ein Nutzer übermittelt eine gültige Telefonnummer (≤ 30 Zeichen) und eine erlaubte `communication_frequency`
- **WHEN** `validateProfileInput` aufgerufen wird
- **THEN** gibt die Funktion `{ ok: true }` zurück und das Profil kann gespeichert werden

---

### Requirement: Profil-Eingabevalidierung (Kontaktkanal-Enum)

The system SHALL reject profile update payloads that specify a `preferred_contact_channel` value not present in the allowed enum (e.g. `email`, `phone`, `chat`) and SHALL return a validation error for unknown channel values.

#### Scenario: Ungültiger Kontaktkanal

- **GIVEN** ein Nutzer übermittelt ein Profilformular mit `preferred_contact_channel: 'fax'`
- **WHEN** `validateProfileInput` mit diesem Payload aufgerufen wird
- **THEN** gibt die Funktion `{ ok: false }` zurück, da `'fax'` kein erlaubter Kontaktkanal ist

#### Scenario: Gültiger Kontaktkanal

- **GIVEN** ein Nutzer übermittelt `preferred_contact_channel: 'email'` oder einen anderen definierten Enum-Wert
- **WHEN** `validateProfileInput` aufgerufen wird
- **THEN** wird der Kanal akzeptiert und die Validierung gibt `{ ok: true }` zurück

---

### Requirement: CONTACT_TYPES-Enum schließt interne Aktionstypen aus

The system SHALL NOT include `profile_update` in the `CONTACT_TYPES` enum, ensuring that internal profile-change events cannot be accidentally logged as customer contact events.

#### Scenario: profile_update nicht im Enum

- **GIVEN** die `CONTACT_TYPES`-Konstante ist aus `customer-crm-db.ts` importiert
- **WHEN** geprüft wird, ob `'profile_update'` im Array enthalten ist
- **THEN** ist `'profile_update'` nicht vorhanden, da Profilaktualisierungen kein Kundenkontaktereignis darstellen

---

### Requirement: plan-meta CLI-Subkommando-Validierung

The system SHALL require a subaction (`set` or `get`) when invoking `ticket.sh plan-meta` and SHALL exit with a non-zero status and usage hint when no subaction is provided.

#### Scenario: Kein Subcommand angegeben

- **GIVEN** `ticket.sh plan-meta` wird ohne weiteres Argument aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** endet es mit einem Fehlercode und gibt eine Hilfsmeldung aus, die `set|get` als gültige Subaktionen nennt

---

### Requirement: plan-meta set Argument-Validierung

The system SHALL require `--id` when invoking `ticket.sh plan-meta set` and SHALL reject invalid `--effort` values, exiting with a non-zero status and a descriptive error message in both cases.

#### Scenario: Fehlende --id Option

- **GIVEN** `ticket.sh plan-meta set --effort klein` wird ohne `--id` aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** endet es mit einem Fehlercode und gibt eine Fehlermeldung aus, die `--id` als fehlendes Pflichtargument benennt

#### Scenario: Ungültiger Effort-Wert

- **GIVEN** `ticket.sh plan-meta set --id T-1 --effort riesig` wird aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** endet es mit einem Fehlercode und gibt eine Fehlermeldung aus, die auf den ungültigen `effort`-Wert hinweist

---

### Requirement: plan-meta get Argument-Validierung

The system SHALL require `--id` when invoking `ticket.sh plan-meta get` and SHALL exit with a non-zero status and a descriptive error message when `--id` is missing.

#### Scenario: Fehlende --id Option bei get

- **GIVEN** `ticket.sh plan-meta get` wird ohne `--id` aufgerufen
- **WHEN** das Skript ausgeführt wird
- **THEN** endet es mit einem Fehlercode und gibt eine Fehlermeldung aus, die `--id` als fehlendes Pflichtargument benennt

---

### Requirement: Legal Token Resolution

The system SHALL replace `{{stammdaten.*}}` placeholder tokens in legal texts with the corresponding Stammdaten values, render unknown tokens as empty strings, and leave non-token brace expressions unchanged.

#### Scenario: Bekannte Tokens werden ersetzt, unbekannte als leer gerendert

- **GIVEN** ein Rechtstext enthält `{{stammdaten.email}}`, `{{stammdaten.city}}` und `{{stammdaten.nope}}`
- **WHEN** `resolveTokens()` mit einem vollständigen Stammdaten-Objekt aufgerufen wird
- **THEN** die bekannten Tokens werden durch die zugehörigen Werte ersetzt und `{{stammdaten.nope}}` als leerer String gerendert
- **AND** nicht-Token-Ausdrücke wie `{ like this }` bleiben unverändert

#### Scenario: Standard-Rechtstexte enthalten Tokens statt hartcodierter Kontaktwerte

- **GIVEN** `getDefaultDatenschutz()` wird aufgerufen
- **WHEN** der zurückgegebene Text analysiert wird
- **THEN** er enthält `{{stammdaten.email}}`
- **AND** er enthält keine E-Mail-Adresse im Format `user@domain.tld`

---

### Requirement: Legal Retokenization

The system SHALL detect baked-in contact values (email, city, etc.) in an HTML string and propose replacements with the corresponding `{{stammdaten.*}}` tokens, returning both the rewritten HTML and a list of applied replacements.

#### Scenario: Eingebettete Kontaktwerte werden durch Tokens ersetzt

- **GIVEN** ein HTML-Text enthält die echte E-Mail-Adresse und die Stadt aus den Stammdaten
- **WHEN** `proposeRetokenize()` aufgerufen wird
- **THEN** die Kontaktwerte werden durch die entsprechenden `{{stammdaten.*}}`-Tokens ersetzt
- **AND** das `replacements`-Array enthält den Eintrag `{ from: 'a@b.de', to: '{{stammdaten.email}}' }`

---

### Requirement: Learning Asset Filtering

The system SHALL filter learning assets by `register`, `tone`, and `concept` fields, and resolve individual assets by ID or by query returning the first match, returning `null` for unknown IDs.

#### Scenario: Assets werden nach Register und Tone gefiltert

- **GIVEN** Lernmaterialien mit verschiedenen Register- und Tone-Werten sind vorhanden
- **WHEN** `queryAssets({ register: 'technical', tone: 'active' })` aufgerufen wird
- **THEN** alle zurückgegebenen Assets haben `register === 'technical'` und `tone === 'active'`
- **AND** mindestens ein Asset wird zurückgegeben

#### Scenario: getAsset löst nach ID auf und gibt null für unbekannte IDs zurück

- **GIVEN** ein Asset mit der ID `feedback-loop.active` existiert im Katalog
- **WHEN** `getAsset('feedback-loop.active')` aufgerufen wird
- **THEN** das Asset mit der passenden ID wird zurückgegeben
- **AND** `getAsset('nope.nope')` gibt `null` zurück

---

### Requirement: Help Video Schema Validation and Prod-Host Rewrite

The system SHALL validate help video entries against a strict schema requiring `id`, `url`, `title`, and `duration` (rejecting `posterUrl`/`durationSec`), and SHALL rewrite the dev VideoVault host (`videovault.localhost`) to the configured production host in all video URLs.

#### Scenario: Gültige Videos werden akzeptiert, falsche Feldnamen abgelehnt

- **GIVEN** ein Video-Objekt mit den Feldern `id`, `url`, `title`, `duration` wird geparst
- **WHEN** `HelpVideoSchema.safeParse()` aufgerufen wird
- **THEN** das Parsen ist erfolgreich
- **AND** ein Objekt mit `posterUrl`/`durationSec` statt `duration` wird abgelehnt, da `duration` fehlt

#### Scenario: Dev-Host wird durch konfigurierten Prod-Host ersetzt

- **GIVEN** das Hilfsvideos-Manifest verweist auf `videovault.localhost` als Host
- **WHEN** `resolveHelpVideos('videovault.example.test')` aufgerufen wird
- **THEN** alle Video-URLs beginnen mit `https://videovault.example.test/`
- **AND** keine URL enthält `.localhost`

---

### Requirement: Learning Progress Database Upsert and Status Transitions

The system SHALL persist learning progress per user, brand, item-type, and item-ID with an upsert that applies sticky timestamps: `started_at` is set on the first `in_progress` transition and never reset, `completed_at` is set on the first `done` transition and never overwritten, and a note-only save does not alter status or timestamps of an already-completed item.

#### Scenario: Note-only-Speicherung überschreibt weder Status noch Timestamps einer erledigten Aufgabe

- **GIVEN** ein Lernitem wurde mit Status `done` gespeichert und hat einen `completed_at`-Wert
- **WHEN** `upsertLearningItem()` mit nur einem `note`-Parameter (ohne Status) aufgerufen wird
- **THEN** Status bleibt `done` und `completed_at` bleibt unverändert
- **AND** die neue Notiz wird gespeichert

#### Scenario: Status-Übergang todo→in_progress→done→done bewahrt sticky Timestamps

- **GIVEN** ein neues Lernitem ohne Fortschritt
- **WHEN** die Status-Sequenz `todo` → `in_progress` → `done` → `done` durchlaufen wird
- **THEN** `started_at` wird beim ersten `in_progress`-Übergang gesetzt und bleibt bei allen weiteren Transitionen erhalten
- **AND** `completed_at` wird beim ersten `done` gesetzt und bei wiederholtem `done` nicht überschrieben

---

### Requirement: Learning Progress Canonical Cap

The system SHALL exclude orphan (non-canonical) progress rows from learning summaries and SHALL reject upsert attempts for item IDs not present in the canonical agent-guide list, ensuring that `done`, `inProgress`, and `pct` values never exceed canonical bounds.

#### Scenario: Orphan-Zeilen werden in der Zusammenfassung nicht gezählt

- **GIVEN** eine kanonische `done`-Zeile und eine Orphan-`done`-Zeile (Item-ID nicht im Agent-Guide) existieren in der Datenbank
- **WHEN** `getLearningSummary()` aufgerufen wird
- **THEN** `summary.done` ist `1` (nur das kanonische Item zählt) und `summary.pct` überschreitet `100` nicht

#### Scenario: Nicht-kanonische Item-IDs werden beim Upsert abgelehnt

- **GIVEN** eine Item-ID, die nicht im Agent-Guide-Katalog enthalten ist
- **WHEN** `upsertLearningItem()` mit dieser ID aufgerufen wird
- **THEN** die Funktion wirft einen Fehler mit dem Hinweis `not in agent-guide`

---

### Requirement: Platform Namespace Mapping per Brand

The system SHALL map Kubernetes namespace names to the brand-specific equivalent for the `korczewski` brand (`workspace` → `workspace-korczewski`, `website` → `website-korczewski`), leave `mentolder` namespaces unmodified, pass through unknown shared namespaces (e.g., `kube-system`, `cert-manager`, `workspace-office`) unchanged, and resolve `{ns}` placeholders in health URLs using the brand-specific namespace.

#### Scenario: Korczewski-Brand erhält das korrekte Namespace-Suffix

- **GIVEN** die Namespace-Namen `workspace` und `website` werden für den Brand `korczewski` aufgelöst
- **WHEN** `mapNamespaceForBrand()` aufgerufen wird
- **THEN** `workspace` → `workspace-korczewski` und `website` → `website-korczewski`
- **AND** `workspace-office`, `kube-system` und `cert-manager` bleiben für beide Brands unverändert

#### Scenario: Health-URL-Template {ns} wird korrekt je Brand ersetzt

- **GIVEN** eine Health-URL mit dem Platzhalter `{ns}` (z. B. `http://keycloak.{ns}.svc.cluster.local:8080/health/ready`)
- **WHEN** `resolveHealthUrl()` für `mentolder` bzw. `korczewski` aufgerufen wird
- **THEN** `{ns}` wird für `mentolder` zu `workspace` aufgelöst und für `korczewski` zu `workspace-korczewski`
- **AND** URLs ohne `{ns}` (z. B. Collabora auf `workspace-office`) bleiben für beide Brands unverändert

---

### Requirement: Platform Help Content with §5.2 Fallback Guarantee

The system SHALL provide a `helpContent.admin.platform` entry with a non-empty `actions` list (between 1 and 8 entries) derived from real component names from `agentGuide.components`, and exactly one hand-authored guide pointing to the Agent-Anleitung view, ensuring the Plattform Hub drawer is never blank.

#### Scenario: Plattform-Hub Hilfe hat Titel, Beschreibung und mindestens eine Action

- **GIVEN** das `helpContent`-Objekt wird importiert
- **WHEN** auf `helpContent.admin.platform` zugegriffen wird
- **THEN** `title` ist `'Plattform Hub'`, `description` ist nicht leer und `actions.length` liegt zwischen 1 und 8

#### Scenario: Jede Action basiert auf einem realen Komponenten-Namen und genau ein Guide zeigt auf Agent-Anleitung

- **GIVEN** die Actions-Liste des Platform-Hilfe-Eintrags
- **WHEN** jede Action mit den bekannten Komponenten-Namen aus `agentGuide.components` verglichen wird
- **THEN** jede Action enthält den Namen mindestens einer bekannten Komponente
- **AND** genau ein Guide existiert und sein `steps`-Text enthält `Agent-Anleitung`

---

### Requirement: Platform DB Schema Ensure with German Descriptions

The system SHALL initialize the `platform` schema idempotently (DDL runs only once per process lifetime), seed English-placeholder descriptions with German translations while preserving admin-edited texts, and fill `NULL` hardware descriptions with German defaults.

#### Scenario: Englischer Platzhalter wird durch deutschen Text ersetzt, Admin-Text bleibt erhalten

- **GIVEN** `platform.software_assets` enthält einen Eintrag mit englischem Platzhalter (`SSO / OIDC identity provider`) und einen mit admin-bearbeitetem deutschen Text
- **WHEN** `listSoftwareAssets()` aufgerufen wird
- **THEN** der englische Platzhalter wird durch einen deutschen Text ersetzt (enthält `Anmeldung`) und NULL-Hardware-Beschreibungen enthalten `Fleet`
- **AND** der admin-bearbeitete Text (`Mein eigener Text`) bleibt unverändert

#### Scenario: Schema-DDL wird nur beim ersten Aufruf ausgeführt (ensureSchemaOnce)

- **GIVEN** das Schema-Init-Flag ist zurückgesetzt
- **WHEN** `listSoftwareAssets()` und `listHardwareAssets()` mehrfach aufgerufen werden
- **THEN** die `CREATE TABLE / SCHEMA`-DDL wird genau einmal ausgeführt
- **AND** alle weiteren Aufrufe lösen kein erneutes DDL aus

---

### Requirement: Poll Templates and Result Formatting

The system SHALL provide exactly 5 poll templates where each `multiple_choice` template has at least 2 options and each `text` template has `null` options, and SHALL format result bot messages with question, per-option counts, and URL for MC polls but only total count and URL (no per-option breakdown) for text polls.

#### Scenario: Multiple-Choice-Ergebnisse enthalten Frage, Zählungen je Option und URL

- **GIVEN** eine Multiple-Choice-Umfrage mit 2 Optionen und 7 Abstimmungen
- **WHEN** `buildResultsBotMessage()` mit den Ergebnissen und einer Ergebnis-URL aufgerufen wird
- **THEN** die Nachricht enthält die Frage, die Zählung je Option (z. B. `Gut: 5`, `Mittel: 2`) und die URL

#### Scenario: Text-Umfragen zeigen Gesamtzahl und URL, aber keine Einzel-Option-Aufschlüsselung

- **GIVEN** eine Text-Umfrage mit 4 Antworten
- **WHEN** `buildResultsBotMessage()` aufgerufen wird
- **THEN** die Nachricht enthält `4 Antworten` und die Ergebnis-URL
- **AND** die Nachricht enthält keine per-Option-Zählung (kein `Fokus: 3`)

---

### Requirement: Audit Log Recording and Client IP Extraction

The system SHALL write audit log entries with all provided fields to `audit.audit_log` (allowing entries with only the mandatory `action` field), fail softly on database errors without propagating exceptions to the caller, and extract the first-hop IP from `x-forwarded-for` headers with whitespace trimming.

#### Scenario: Vollständiger Audit-Eintrag wird in die Datenbank geschrieben und bei nur Pflichtfeldern sind optionale Felder null

- **GIVEN** ein Pool mit einer existierenden `audit.audit_log`-Tabelle
- **WHEN** `recordAudit()` einmal mit allen Feldern und einmal nur mit `action` aufgerufen wird
- **THEN** der vollständige Eintrag enthält alle übergebenen Werte und einen gesetzten `ts`-Timestamp
- **AND** der minimale Eintrag hat `actor_id`, `ip` und `metadata` gleich `null`

#### Scenario: Fehler beim Insert bricht den Aufrufer nicht ab (fail-soft) und clientIpFromRequest extrahiert den ersten Hop

- **GIVEN** die `audit.audit_log`-Tabelle wurde gelöscht
- **WHEN** `recordAudit()` aufgerufen wird
- **THEN** die Funktion löst keine Exception aus (resolves to `undefined`) und gibt eine `console.warn`-Meldung mit `[audit] recordAudit failed:` aus
- **AND** `clientIpFromRequest()` mit `x-forwarded-for: ' 10.0.0.1 , 192.168.1.1'` gibt `'10.0.0.1'` zurück (erster Hop, getrimmt)

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Authentifizierungspflicht (Routes)
<!-- e2e: fa-client-portal.spec.ts -->

The system SHALL redirect unauthenticated users away from `/portal`, `/admin`, and `/portal/raum/:id` without returning a 404 or 500 error.

#### Scenario: Direktzugriff auf /portal ohne Session *(E2E)*
- **GIVEN** ein Nutzer ist nicht eingeloggt
- **WHEN** er `/portal` aufruft
- **THEN** wird er umgeleitet (die URL endet nicht auf `/portal`) ohne dass ein 404-Fehler angezeigt wird

#### Scenario: Direktzugriff auf /admin ohne Session *(E2E)*
- **GIVEN** ein Nutzer ist nicht eingeloggt
- **WHEN** er `/admin` aufruft
- **THEN** wird er umgeleitet (die URL endet nicht auf `/admin`) ohne dass ein 404-Fehler angezeigt wird

#### Scenario: Direktzugriff auf /portal/raum/:id ohne Session *(E2E)*
- **GIVEN** ein Nutzer ist nicht eingeloggt
- **WHEN** er `/portal/raum/999` aufruft
- **THEN** wird er umgeleitet (die URL endet nicht auf `/portal/raum/999`) und kein 500-Fehler tritt auf

---

### Requirement: Profil-Selbstverwaltung im Portal (Konto-Sektion)
<!-- e2e: kundenprofil-portal.spec.ts | bats: portal-profile-update.bats -->

The system SHALL display a profile card with an edit button in the `konto` section and SHALL persist valid profile updates (phone, company) while rejecting invalid payloads.

#### Scenario: Profil-Karte mit Bearbeiten-Button sichtbar *(E2E)*
- **GIVEN** ein eingeloggter Nutzer ruft `/portal?section=konto` auf
- **WHEN** die Seite geladen ist
- **THEN** ist der Text „Meine Kontaktdaten" und ein Button „Profil bearbeiten" sichtbar

#### Scenario: Telefonnummer und Firma editieren und speichern *(E2E)*
- **GIVEN** ein eingeloggter Nutzer befindet sich auf `/portal?section=konto`
- **WHEN** er auf „Profil bearbeiten" klickt, Telefon und Firma ausfüllt und auf „Speichern" klickt
- **THEN** wird die Erfolgsmeldung „Profil gespeichert." angezeigt

#### Scenario: Zu langes Telefonnummernfeld wird abgelehnt *(BATS)*
- **GIVEN** ein Nutzer übermittelt einen Profil-Payload mit einer Telefonnummer von 31 Zeichen Länge
- **WHEN** `validateProfileInput` mit diesem Payload aufgerufen wird
- **THEN** gibt die Funktion `{ ok: false }` zurück und die Daten werden nicht gespeichert

#### Scenario: Ungültiger Kontaktkanal wird abgelehnt *(BATS)*
- **GIVEN** ein Nutzer übermittelt `preferred_contact_channel: 'fax'`
- **WHEN** `validateProfileInput` aufgerufen wird
- **THEN** gibt die Funktion `{ ok: false }` zurück, da `'fax'` kein erlaubter Kontaktkanal ist

#### Scenario: Gültiger Profil-Payload wird akzeptiert *(BATS)*
- **GIVEN** ein Nutzer übermittelt eine gültige Telefonnummer (≤ 30 Zeichen) und eine erlaubte `communication_frequency`
- **WHEN** `validateProfileInput` aufgerufen wird
- **THEN** gibt die Funktion `{ ok: true }` zurück und das Profil kann gespeichert werden

#### Scenario: CONTACT_TYPES-Enum schließt profile_update aus *(BATS)*
- **GIVEN** die `CONTACT_TYPES`-Konstante ist importiert
- **WHEN** geprüft wird, ob `'profile_update'` im Array enthalten ist
- **THEN** ist `'profile_update'` nicht vorhanden, da Profilaktualisierungen kein Kundenkontaktereignis sind

---

### Requirement: Admin-CRM Kundenprofil-Tab
<!-- e2e: kundenprofil-admin.spec.ts -->

The system SHALL display a profile tab in the admin customer detail view with CRM status management and contact history entry creation.

#### Scenario: Admin sieht Profil-Tab mit CRM-Status *(E2E)*
- **GIVEN** ein Admin-Nutzer öffnet `/admin/<clientId>?tab=profil`
- **WHEN** die Seite geladen ist
- **THEN** ist der `admin-client-profil`-Bereich sowie der Text „CRM-Status" sichtbar

#### Scenario: Admin fügt Kontakthistorie-Eintrag hinzu *(E2E)*
- **GIVEN** ein Admin-Nutzer befindet sich auf dem Profil-Tab eines Kunden
- **WHEN** er einen Betreff eingibt und auf „+ Eintrag" klickt
- **THEN** erscheint der neue Eintrag in der Kontakthistorie

#### Scenario: Admin ändert den CRM-Status und speichert *(E2E)*
- **GIVEN** ein Admin-Nutzer befindet sich auf dem Profil-Tab eines Kunden
- **WHEN** er den CRM-Status auf „pausiert" setzt und auf „Speichern" klickt
- **THEN** wird die Meldung „Gespeichert." angezeigt

---

### Requirement: Terminbuchung per Chat-Assistent
<!-- e2e: portal-termin-actions.spec.ts -->

The system SHALL allow authenticated portal users to book, cancel, and reschedule appointments via the chat assistant and SHALL create an inbox item for open-ended appointment requests.

#### Scenario: SA-PORTAL-01 — Termin buchen: AI bestätigt CalDAV-Event-Erstellung *(E2E)*
- **GIVEN** ein eingeloggter Nutzer hat den Chat-Assistenten geöffnet
- **WHEN** er „Buche einen Termin für [Datum] um 10 Uhr" eingibt und Enter drückt
- **THEN** antwortet der Assistent mit einer Bestätigung, die „bestätigt", „Termin gebucht" oder „10:00" enthält

#### Scenario: SA-PORTAL-02 — Termin absagen: AI bestätigt Absage *(E2E)*
- **GIVEN** ein eingeloggter Nutzer hat mindestens einen gebuchten Termin
- **WHEN** er „Sage meinen nächsten Termin ab" eingibt
- **THEN** antwortet der Assistent mit einer Antwort, die nicht „noch nicht angebunden" enthält

#### Scenario: SA-PORTAL-03 — Terminverschiebung: AI bestätigt Verschiebung *(E2E)*
- **GIVEN** ein eingeloggter Nutzer hat einen bestehenden Termin
- **WHEN** er den Termin auf ein neues Datum verschieben möchte und die Nachricht absendet
- **THEN** antwortet der Assistent mit einer Antwort, die nicht „noch nicht angebunden" enthält

#### Scenario: SA-PORTAL-04 — Terminanfrage ohne Datum: InboxItem erstellt, AI bestätigt *(E2E)*
- **GIVEN** ein eingeloggter Nutzer möchte einen Termin, ist aber zeitlich flexibel
- **WHEN** er „Ich hätte gerne einen Termin, bin aber zeitlich flexibel" eingibt
- **THEN** antwortet der Assistent mit einer Bestätigung, die „Terminanfrage", „eingegangen", „benachrichtigt" oder „melden" enthält

---

### Requirement: Externe Dienste & öffentliche Website (Systemtest)
<!-- e2e: systemtest-10-externe.spec.ts -->

The system SHALL pass all steps of System-Test 10 (Externe Dienste & öffentliche Website) including the automated walkthrough with the systemtest runner.

#### Scenario: Systemtest 10 vollständig durchlaufen *(E2E)*
- **GIVEN** Admin-Zugangsdaten sind als Umgebungsvariable gesetzt
- **WHEN** `walkSystemtestByTemplate(page, 10)` ausgeführt wird
- **THEN** alle 10 Testschritte werden durchlaufen und das Ergebnis wird erfolgreich übermittelt

---

### Requirement: Coaching Studio Service

The system SHALL provide an authenticated coaching-studio service for the coach to run
KI-supported 10-level systemic coaching sessions with international clients.
