# newsletter-system

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Newsletter-System ermöglicht das zeitgesteuerte, atomare Versenden von geplanten Newsletter-Beiträgen über einen Kubernetes-CronJob, der alle fünf Minuten ausgeführt wird. Die Zustelllogik ist durch eine datenbankbasierte Sperre vor parallelen Ausführungen und verwaisten Locks geschützt. Jede Brand-Instanz (mentolder, korczewski) betreibt ihren eigenen CronJob, der den API-Endpunkt im jeweiligen Namespace adressiert.

---

## Requirements

### Requirement: Content Block Creation with UUID

The system SHALL persist a new content block with a server-generated UUID, the provided title, block_type, and html_body, and return the complete record immediately upon creation.

#### Scenario: Erstellung eines Header-Blocks

- **GIVEN** eine gültige Datenbankverbindung ist verfügbar
- **WHEN** `createContentBlock` mit `title: 'Willkommens-Header'`, `block_type: 'header'` und `html_body: '<h1>Hallo!</h1>'` aufgerufen wird
- **THEN** gibt die Funktion einen Block mit einer nicht-leeren `id` zurück
- **AND** `title`, `block_type` und `html_body` entsprechen exakt den übergebenen Werten

#### Scenario: Erstellung mehrerer Blocks unterschiedlicher Typen

- **GIVEN** eine leere oder bereits befüllte Blocktabelle
- **WHEN** nacheinander ein `cta`-Block und ein `footer`-Block erstellt werden
- **THEN** enthält `listContentBlocks` danach mindestens drei Einträge
- **AND** jeder Block ist über seine `id` eindeutig identifizierbar

---

### Requirement: Content Block Listing

The system SHALL return all persisted content blocks when listing, including every block created in the current session.

#### Scenario: Neuer Block erscheint in der Listenabfrage

- **GIVEN** ein Content Block wurde erfolgreich erstellt
- **WHEN** `listContentBlocks` aufgerufen wird
- **THEN** enthält das Ergebnis mindestens einen Eintrag
- **AND** der neu erstellte Block ist anhand seiner `id` in der Liste auffindbar

---

### Requirement: Content Block Retrieval by ID

The system SHALL return the full content block record when queried by a known ID, and SHALL return null for an unknown ID.

#### Scenario: Abruf eines vorhandenen Blocks per ID

- **GIVEN** ein Block mit dem Titel `'Angebot-Block'` und `block_type: 'angebot'` wurde erstellt
- **WHEN** `getContentBlock` mit der zurückgegebenen `id` aufgerufen wird
- **THEN** gibt die Funktion einen Nicht-null-Wert zurück
- **AND** `title` des zurückgegebenen Objekts ist `'Angebot-Block'`

#### Scenario: Abruf mit unbekannter ID gibt null zurück

- **GIVEN** die UUID `'00000000-0000-4000-8000-000000000000'` existiert nicht in der Datenbank
- **WHEN** `getContentBlock` mit dieser UUID aufgerufen wird
- **THEN** gibt die Funktion `null` zurück

---

### Requirement: Partial Content Block Update

The system SHALL update only the supplied fields of a content block while leaving all other fields unchanged, and SHALL return null when the target ID does not exist.

#### Scenario: Aktualisierung von Titel und HTML-Body ohne Änderung des Typs

- **GIVEN** ein Block mit `title: 'Alt'`, `block_type: 'text'` und `html_body: '<p>alt</p>'` wurde erstellt
- **WHEN** `updateContentBlock` mit `title: 'Neu'` und `html_body: '<p>neu</p>'` aufgerufen wird
- **THEN** gibt die Funktion den aktualisierten Block zurück mit `title === 'Neu'` und `html_body === '<p>neu</p>'`
- **AND** `block_type` bleibt unverändert `'text'`

#### Scenario: Update mit unbekannter ID gibt null zurück

- **GIVEN** eine UUID, die keinem Block in der Datenbank entspricht
- **WHEN** `updateContentBlock` mit dieser UUID und einem neuen Titel aufgerufen wird
- **THEN** gibt die Funktion `null` zurück

---

### Requirement: Content Block Deletion

The system SHALL permanently remove a content block so that subsequent get and list operations no longer return it.

#### Scenario: Gelöschter Block ist nicht mehr per ID abrufbar

- **GIVEN** ein Block wurde erfolgreich erstellt und seine `id` ist bekannt
- **WHEN** `deleteContentBlock` mit dieser `id` aufgerufen wird und danach `getContentBlock` mit derselben `id` aufgerufen wird
- **THEN** gibt `getContentBlock` `null` zurück

---

### Requirement: Newsletter HTML Document Structure

The system SHALL render a complete, valid HTML document with `<!doctype html>`, `<html lang="de">`, and a `<title>` element matching the newsletter subject.

#### Scenario: Vollständiges HTML-Dokument für Mentolder

- **GIVEN** `bodyHtml`, `subject: 'Test-Betreff'` und `unsubscribeUrl` sind angegeben, Brand ist Mentolder
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** beginnt die Ausgabe mit `<!doctype html>` (case-insensitive)
- **AND** enthält `<html lang="de">`, `</html>` und `<title>Test-Betreff</title>`

---

### Requirement: Brand Header and Body Passthrough

The system SHALL include a brand header with the brand name and job title, and SHALL embed the authored body HTML untouched within the rendered email.

#### Scenario: Brand-Header mit Name und Berufsbezeichnung

- **GIVEN** Brand ist Mentolder mit `brandName: 'Mentolder'` und `legalJobtitle: 'Coach und digitaler Begleiter'`
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das gerenderte HTML den Brand-Namen `'Mentolder'`
- **AND** enthält die Berufsbezeichnung `'Coach und digitaler Begleiter'`

#### Scenario: Autoren-Inhalt wird unverändert eingebettet

- **GIVEN** `bodyHtml` enthält `'<h1>Hallo!</h1><p>Newsletter-Inhalt.</p>'`
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das gerenderte HTML die exakten Tags `<h1>Hallo!</h1>` und `<p>Newsletter-Inhalt.</p>`

---

### Requirement: Mandatory Unsubscribe Link

The system SHALL always include a visible unsubscribe link with the provided URL and a German "Abmelden" label, even when all legal brand data is missing.

#### Scenario: Abmeldelink ist in der E-Mail vorhanden

- **GIVEN** `unsubscribeUrl` ist `'https://web.mentolder.de/api/newsletter/unsubscribe?token=abc123'`
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das HTML die vollständige Abmelde-URL
- **AND** enthält das HTML (case-insensitive) den Text `'abmelden'`

#### Scenario: Abmeldelink auch ohne Legal-Daten vorhanden

- **GIVEN** alle Legal-Felder des Brand-Objekts sind leere Strings
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das HTML die `unsubscribeUrl` und den Body-Inhalt unverändert

---

### Requirement: Legal Footer (Anbieterkennzeichnung UWG/TMG §5)

The system SHALL embed the full legal disclosure including name, street, ZIP+city, email, phone, USt-ID, and website in the rendered HTML email footer.

#### Scenario: Vollständige Anbieterkennzeichnung Mentolder

- **GIVEN** Brand ist Mentolder mit vollständigen Kontaktdaten
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das HTML `'Gerald Korczewski'`, `'Ludwig-Erhard-Str. 18'`, `'20459 Hamburg'`, `'info@mentolder.de'`, `'+49 151 508 32 601'`, `'33/023/05100'` und `'mentolder.de'`

#### Scenario: Vollständige Anbieterkennzeichnung Korczewski

- **GIVEN** Brand ist Korczewski mit eigenem Legal-Datensatz
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das HTML `'Patrick Korczewski'`, `'In der Twiet 4'`, `'21360 Vögelsen'` und `'Kleinunternehmer gem. § 19 Abs. 1 UStG'`

---

### Requirement: Per-Brand Visual Identity

The system SHALL render brand-specific accent colors and SHALL NOT bleed one brand's color scheme into another brand's output.

#### Scenario: Korczewski verwendet Teal-Akzentfarbe, nicht Messing

- **GIVEN** Brand ist Korczewski
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das HTML den Teal-Farbcode `#1f3b3b`
- **AND** enthält das HTML NICHT die Mentolder-Messingfarbe `background:#b8973a`

---

### Requirement: Preview Mode Banner

The system SHALL display a visible "Vorschau" banner when `isPreview` is true, and SHALL NOT include the banner for actual sends.

#### Scenario: Vorschau-Banner erscheint bei isPreview=true

- **GIVEN** `isPreview: true` ist in den Render-Parametern gesetzt
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das HTML (case-insensitive) den Text `'vorschau'`

#### Scenario: Kein Vorschau-Banner bei regulärem Versand

- **GIVEN** `isPreview` ist nicht gesetzt
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das HTML NICHT den Text `'Vorschau — diese Ansicht'`

---

### Requirement: HTML Escaping in Unsubscribe URL

The system SHALL escape HTML-unsafe characters in the unsubscribe URL to prevent XSS injection in rendered email output.

#### Scenario: Script-Tag in URL wird zu HTML-Entities escaped

- **GIVEN** `unsubscribeUrl` enthält die Zeichenkette `'<script>'`
- **WHEN** `renderNewsletterEmail` aufgerufen wird
- **THEN** enthält das HTML NICHT den Literal-String `'<script>'`
- **AND** enthält das HTML die escaped Form `'&lt;script&gt;'`

---

### Requirement: Plain-Text Fallback Rendering

The system SHALL produce a plain-text version of the newsletter that strips all HTML tags, appends the legal footer, and includes an "Abmelden:" line with the unsubscribe URL.

#### Scenario: HTML-Tags werden entfernt, rechtlicher Footer wird angehängt

- **GIVEN** `bodyHtml: '<h1>Hallo!</h1><p>Inhalt.</p>'` und eine gültige `unsubscribeUrl` sowie Brand Mentolder
- **WHEN** `renderNewsletterText` aufgerufen wird
- **THEN** enthält der Text `'Hallo!'` und `'Inhalt.'`, aber NICHT den Tag `'<h1>'`
- **AND** enthält der Text `'Abmelden:'`, die vollständige Abmelde-URL, `'Gerald Korczewski'` und `'Ludwig-Erhard-Str. 18'`

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Scheduled-Publish CronJob Registration
<!-- bats: newsletter-scheduled-publish.bats -->

The system SHALL register a CronJob named `scheduled-publish` in the base Kustomize manifest so that it is present in every deployment.

#### Scenario: CronJob im Basis-Kustomize vorhanden *(BATS)*
- **GIVEN** der Kustomize-Build des `k3d`-Basisverzeichnisses wurde ausgeführt
- **WHEN** die gerenderten Manifeste nach `name: scheduled-publish` durchsucht werden
- **THEN** wird mindestens ein Treffer gefunden und der Build gilt als erfolgreich

---

### Requirement: Five-Minute Schedule in Europe/Berlin Timezone
<!-- bats: newsletter-scheduled-publish.bats -->

The system SHALL execute the scheduled-publish CronJob every 5 minutes using the `Europe/Berlin` timezone so that publish times align with Central European time.

#### Scenario: Cron-Schedule auf 5-Minuten-Intervall gesetzt *(BATS)*
- **GIVEN** der Kustomize-Build des `k3d`-Basisverzeichnisses wurde ausgeführt
- **WHEN** die gerenderten Manifeste nach dem Cron-Ausdruck `*/5 * * * *` und nach `Europe/Berlin` durchsucht werden
- **THEN** werden beide Werte im gerenderten Output gefunden

---

### Requirement: Forbid Concurrency Policy
<!-- bats: newsletter-scheduled-publish.bats -->

The system SHALL configure the scheduled-publish CronJob with `concurrencyPolicy: Forbid` so that a new Job instance is never started while a previous one is still running, preventing double-sends.

#### Scenario: Gleichzeitiger Job-Start wird verhindert *(BATS)*
- **GIVEN** der Kustomize-Build des `k3d`-Basisverzeichnisses wurde ausgeführt
- **WHEN** die gerenderten Manifeste nach `concurrencyPolicy: Forbid` durchsucht werden
- **THEN** wird der Wert im CronJob-Manifest gefunden

---

### Requirement: Bearer Authentication on Cron Endpoint
<!-- bats: newsletter-scheduled-publish.bats -->

The system SHALL protect the `/api/cron/scheduled-publish` endpoint with Bearer-token authentication and return HTTP 401 when the provided token does not match `CRON_SECRET`.

#### Scenario: Fehlender oder falscher Bearer-Token wird abgewiesen *(BATS)*
- **GIVEN** der API-Endpunkt `scheduled-publish.ts` ist implementiert
- **WHEN** der Quellcode nach `status: 401` und `Bearer ${CRON_SECRET}` durchsucht wird
- **THEN** sind beide Werte im Quellcode der Endpunkt-Implementierung vorhanden

---

### Requirement: Atomic Status Lock on Scheduled Entries
<!-- bats: newsletter-scheduled-publish.bats -->

The system SHALL acquire newsletter locks atomically via a guarded SQL UPDATE that checks `status = 'scheduled' AND scheduled_publish_at <= now()` so that no two concurrent executions publish the same entry.

#### Scenario: Atomare Lock-Abfrage verhindert Doppelveröffentlichung *(BATS)*
- **GIVEN** die Datenbankschicht `newsletter-db.ts` ist implementiert
- **WHEN** der Quellcode nach der Lock-Query durchsucht wird
- **THEN** enthält die Abfrage die Bedingung `WHERE id = $1 AND status = 'scheduled' AND scheduled_publish_at <= now()`

---

### Requirement: Stale Sending Lock Reset After 10 Minutes
<!-- bats: newsletter-scheduled-publish.bats -->

The system SHALL automatically reset newsletter entries that are stuck in `sending` status for more than 10 minutes, allowing them to be retried on the next CronJob run.

#### Scenario: Veraltete Sending-Locks werden nach 10 Minuten freigegeben *(BATS)*
- **GIVEN** die Datenbankschicht `newsletter-db.ts` ist implementiert
- **WHEN** der Quellcode nach dem Stale-Lock-Reset durchsucht wird
- **THEN** enthält die Abfrage das Intervall `INTERVAL '10 minutes'`

---

### Requirement: Per-Brand CronJob URL Patch
<!-- bats: newsletter-scheduled-publish.bats -->

The system SHALL configure the korczewski brand's scheduled-publish CronJob to call its own namespace-local endpoint (`website.website-korczewski.svc.cluster.local/api/cron/scheduled-publish`) via a Kustomize patch.

#### Scenario: Korczewski-Patch zeigt auf eigenen Namespace-Endpunkt *(BATS)*
- **GIVEN** das Kustomize-Overlay `prod-korczewski/patch-cronjob-urls.yaml` existiert
- **WHEN** die Patch-Datei nach der korczewski-spezifischen Service-URL durchsucht wird
- **THEN** enthält sie `website.website-korczewski.svc.cluster.local/api/cron/scheduled-publish`

---

### Requirement: Admin Newsletter Route Redirect
<!-- e2e: fa-admin-newsletter.spec.ts -->

The system SHALL redirect unauthenticated and authenticated requests from `/admin/newsletter` to `/admin/dokumente` so that the newsletter admin entry point is handled by the dokumente auth gate.

#### Scenario: /admin/newsletter leitet auf /admin/dokumente weiter *(E2E)*
- **GIVEN** ein Browser navigiert auf `${BASE}/admin/newsletter`
- **WHEN** die Seite geladen wird
- **THEN** befindet sich der Browser nicht mehr auf der URL `/admin/newsletter`

---

### Requirement: Admin Newsletter API Endpoint Authentication
<!-- e2e: fa-admin-newsletter.spec.ts -->

The system SHALL require authentication on the `/api/admin/newsletter/campaigns` endpoint and return HTTP 401 or 403 when no valid session credentials are provided.

#### Scenario: GET /api/admin/newsletter/campaigns ohne Auth wird abgewiesen *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie oder -Token ist gesetzt
- **WHEN** ein GET-Request an `${BASE}/api/admin/newsletter/campaigns` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP-Status 401 oder 403
